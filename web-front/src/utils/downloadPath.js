/**
 * 把网盘目录层级变成下载器可用的相对路径。
 * 只保留安全的路径片段，避免文件名里的分隔符或 ".." 逃出下载目录。
 */

function sanitizePathSegment(segment) {
  if (segment == null) return ''
  const cleaned = String(segment)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return ''
  return cleaned
}

function isStructuralFolder(data) {
  if (!data || data.fileType !== 'folder') return false
  if (data.id === 'root') return false
  const name = String(data.fileName || '').trim()
  return name !== '' && name !== '全部文件'
}

function joinRelativeDir(segments) {
  return (segments || [])
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join('/')
}

function sanitizeRelativeDir(relativeDir) {
  if (!relativeDir) return ''
  return joinRelativeDir(String(relativeDir).split(/[\\/]+/))
}

function appendFolderSegment(segments, folderData) {
  const next = Array.isArray(segments) ? segments.slice() : []
  if (!isStructuralFolder(folderData)) return next
  const seg = sanitizePathSegment(folderData.fileName)
  if (seg) next.push(seg)
  return next
}

/**
 * 从文件节点向上收集文件夹名。不包含节点自身，并跳过「全部文件」根节点。
 */
function folderSegmentsFromNode(node) {
  const segments = []
  let current = node && node.parent
  while (current && current.data) {
    if (isStructuralFolder(current.data)) {
      const seg = sanitizePathSegment(current.data.fileName)
      if (seg) segments.unshift(seg)
    }
    current = current.parent
  }
  return segments
}

function withRelativeDir(file, segments) {
  if (!file) return file
  return {
    ...file,
    relativeDir: joinRelativeDir(segments)
  }
}

/**
 * Aria2 / Motrix 的 out 选项。相对目录写在文件名前，下载器会自行创建中间目录。
 */
function ariaOutName(fileName, relativeDir) {
  const name = sanitizePathSegment(fileName) || 'download'
  const rel = sanitizeRelativeDir(relativeDir)
  return rel ? `${rel}/${name}` : name
}

/**
 * 把用户配置的下载目录和网盘相对目录拼在一起。
 * 分隔符跟随下载目录本身（Windows 用 \，其余用 /）。
 */
function joinDownloadDir(baseDir, relativeDir) {
  const rel = sanitizeRelativeDir(relativeDir)
  const base = String(baseDir || '').trim().replace(/[\\/]+$/, '')
  if (!rel) return base
  if (!base) return rel
  const sep = base.includes('\\') ? '\\' : '/'
  return base + sep + rel.split('/').join(sep)
}

module.exports = {
  sanitizePathSegment,
  isStructuralFolder,
  joinRelativeDir,
  sanitizeRelativeDir,
  appendFolderSegment,
  folderSegmentsFromNode,
  withRelativeDir,
  ariaOutName,
  joinDownloadDir
}
