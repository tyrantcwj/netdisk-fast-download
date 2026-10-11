/**
 * 把网盘分享和本地目录按相对路径对比，找出缺少或未下完的文件。
 * 路径规则与发送到下载器时一致，这样已经按目录结构下载的文件能对上。
 */

const { ariaOutName, appendFolderSegment, withRelativeDir, sanitizePathSegment } = require('./downloadPath')

const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

function isFolderEntry(entry) {
  return !!(entry && entry.fileType === 'folder')
}

function isDownloadableEntry(entry) {
  return !!(entry && entry.parserUrl && entry.fileType !== 'folder' && entry.fileType !== 'url')
}

function cloudRelativePath(file) {
  return ariaOutName(file && file.fileName, file && file.relativeDir)
}

function normalizeLocalRelativePath(relativePath) {
  const parts = String(relativePath || '')
    .split(/[\\/]+/)
    .map(sanitizePathSegment)
    .filter(Boolean)
  if (parts.length === 0) return ''
  const base = parts[parts.length - 1].toLowerCase()
  if (JUNK_NAMES.has(base) || base.endsWith('.aria2')) return ''
  return parts.join('/')
}

function compareKey(relativePath) {
  return String(relativePath || '').toLowerCase()
}

function indexLocalFiles(localFiles) {
  const byPath = new Map()
  for (const file of localFiles || []) {
    const relativePath = normalizeLocalRelativePath(file && file.relativePath)
    if (!relativePath) continue
    const key = compareKey(relativePath)
    const size = Number(file.size)
    const next = {
      relativePath,
      size: Number.isFinite(size) && size > 0 ? size : 0
    }
    const prev = byPath.get(key)
    if (!prev || next.size > prev.size) byPath.set(key, next)
  }
  return byPath
}

function firstSegment(relativePath) {
  const slash = relativePath.indexOf('/')
  return slash === -1 ? '' : relativePath.slice(0, slash)
}

function stripFirstSegment(relativePath) {
  const slash = relativePath.indexOf('/')
  return slash === -1 ? '' : relativePath.slice(slash + 1)
}

/**
 * 本地文件如果全部落在同一个子目录里，再试一次去掉这层目录。
 * 用来兼容「选中的是下载根目录，文件实际在其中某个文件夹里」。
 */
function maybeStripCommonRoot(localIndex, cloudPaths) {
  const paths = [...localIndex.values()].map(file => file.relativePath)
  if (paths.length === 0) return localIndex
  const root = firstSegment(paths[0])
  if (!root || paths.some(path => firstSegment(path) !== root)) return localIndex

  const stripped = new Map()
  for (const file of localIndex.values()) {
    const relativePath = stripFirstSegment(file.relativePath)
    if (!relativePath) continue
    stripped.set(compareKey(relativePath), { relativePath, size: file.size })
  }

  const exact = cloudPaths.filter(path => localIndex.has(compareKey(path))).length
  const nested = cloudPaths.filter(path => stripped.has(compareKey(path))).length
  return nested > exact ? stripped : localIndex
}

function classify(file, local) {
  const cloudSize = Number(file && file.size)
  const localSize = local ? local.size : 0
  if (!local) return 'missing'
  if (Number.isFinite(cloudSize) && cloudSize > 0 && localSize < cloudSize) return 'incomplete'
  return 'matched'
}

/**
 * @param {object[]} cloudFiles 带 relativeDir 的网盘文件
 * @param {{ relativePath: string, size?: number }[]} localFiles 相对所选本地文件夹的文件
 */
function compareCloudToLocal(cloudFiles, localFiles) {
  const cloud = cloudFiles || []
  const cloudPaths = cloud.map(cloudRelativePath)
  const localIndex = maybeStripCommonRoot(indexLocalFiles(localFiles), cloudPaths)
  const missing = []
  const incomplete = []
  const matched = []

  cloud.forEach((file, index) => {
    const relativePath = cloudPaths[index]
    const local = localIndex.get(compareKey(relativePath)) || null
    const status = classify(file, local)
    const row = {
      ...file,
      relativePath,
      localSize: local ? local.size : 0
    }
    if (status === 'missing') missing.push(row)
    else if (status === 'incomplete') incomplete.push(row)
    else matched.push(row)
  })

  return {
    missing,
    incomplete,
    matched,
    cloudCount: cloud.length,
    localCount: localIndex.size
  }
}

/**
 * 从分享根目录递归展开可下载文件。depth 0 是根目录下的第一层文件夹。
 */
async function walkShareFiles(opts) {
  const {
    entries,
    maxDepth,
    fetchChildren,
    isDownloadable = isDownloadableEntry,
    isFolder = isFolderEntry,
    ctx = { files: [], depthExceeded: false, failed: 0 }
  } = opts

  if (typeof maxDepth !== 'number') return ctx

  for (const entry of entries || []) {
    if (!entry) continue
    if (isDownloadable(entry)) {
      ctx.files.push(withRelativeDir(entry, []))
    } else if (isFolder(entry)) {
      await walkFolder({
        folder: entry,
        depth: 0,
        maxDepth,
        pathSegments: appendFolderSegment([], entry),
        fetchChildren,
        isDownloadable,
        isFolder,
        ctx
      })
    }
  }
  return ctx
}

async function walkFolder(opts) {
  const {
    folder,
    depth,
    maxDepth,
    pathSegments,
    fetchChildren,
    isDownloadable,
    isFolder,
    ctx
  } = opts

  if (depth >= maxDepth) {
    ctx.depthExceeded = true
    return
  }

  let children = []
  try {
    children = await fetchChildren(folder)
  } catch {
    ctx.failed += 1
    return
  }

  for (const child of children || []) {
    if (!child) continue
    if (isDownloadable(child)) {
      ctx.files.push(withRelativeDir(child, pathSegments))
    } else if (isFolder(child)) {
      await walkFolder({
        ...opts,
        folder: child,
        depth: depth + 1,
        pathSegments: appendFolderSegment(pathSegments, child)
      })
    }
  }
}

module.exports = {
  cloudRelativePath,
  normalizeLocalRelativePath,
  compareCloudToLocal,
  walkShareFiles,
  isDownloadableEntry,
  isFolderEntry
}
