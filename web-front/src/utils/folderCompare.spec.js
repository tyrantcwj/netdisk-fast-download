const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  cloudRelativePath,
  normalizeLocalRelativePath,
  compareCloudToLocal,
  walkShareFiles
} = require('./folderCompare')

function cloudFile(name, extra = {}) {
  return {
    fileName: name,
    fileType: 'file',
    parserUrl: `/v2/redirectUrl/demo/${name}`,
    size: 100,
    ...extra
  }
}

describe('folderCompare', () => {
  it('matches downloaded files by the same relative path used for the downloader', () => {
    const cloud = [
      { ...cloudFile('a.mkv'), relativeDir: 'Movie/Season 1' },
      { ...cloudFile('b.mkv'), relativeDir: 'Movie/Season 1' },
      { ...cloudFile('readme.txt'), relativeDir: '' }
    ]
    const result = compareCloudToLocal(cloud, [
      { relativePath: 'Movie/Season 1/a.mkv', size: 100 },
      { relativePath: 'readme.txt', size: 100 }
    ])
    assert.deepEqual(result.missing.map(file => file.fileName), ['b.mkv'])
    assert.equal(result.matched.length, 2)
    assert.equal(result.incomplete.length, 0)
    assert.equal(cloudRelativePath(cloud[0]), 'Movie/Season 1/a.mkv')
  })

  it('treats a smaller local file as incomplete and ignores junk files', () => {
    const result = compareCloudToLocal(
      [{ ...cloudFile('a.mkv', { size: 1000 }), relativeDir: '' }],
      [
        { relativePath: 'a.mkv', size: 200 },
        { relativePath: 'a.mkv.aria2', size: 10 },
        { relativePath: 'Thumbs.db', size: 10 }
      ]
    )
    assert.equal(result.incomplete.length, 1)
    assert.equal(result.incomplete[0].localSize, 200)
    assert.equal(result.missing.length, 0)
    assert.equal(normalizeLocalRelativePath('Thumbs.db'), '')
  })

  it('strips one common local root folder when that matches the cloud layout', () => {
    const result = compareCloudToLocal(
      [{ ...cloudFile('a.mkv'), relativeDir: 'Movie' }],
      [{ relativePath: '分享/Movie/a.mkv', size: 100 }]
    )
    assert.equal(result.matched.length, 1)
    assert.equal(result.missing.length, 0)
  })

  it('walks nested folders and keeps relative directories', async () => {
    const root = [
      cloudFile('root.txt'),
      { fileName: 'Movie', fileType: 'folder', parserUrl: '/list/movie' }
    ]
    const ctx = await walkShareFiles({
      entries: root,
      maxDepth: 5,
      async fetchChildren(folder) {
        if (folder.fileName === 'Movie') {
          return [
            cloudFile('a.mkv'),
            { fileName: 'Extra', fileType: 'folder', parserUrl: '/list/extra' }
          ]
        }
        return [cloudFile('deep.txt')]
      }
    })
    const byName = Object.fromEntries(ctx.files.map(file => [file.fileName, file.relativeDir]))
    assert.equal(byName['root.txt'], '')
    assert.equal(byName['a.mkv'], 'Movie')
    assert.equal(byName['deep.txt'], 'Movie/Extra')
    assert.equal(ctx.depthExceeded, false)
    assert.equal(ctx.failed, 0)
  })

  it('stops at max depth and records a failed folder without dropping the rest', async () => {
    const ctx = await walkShareFiles({
      entries: [
        { fileName: 'Ok', fileType: 'folder', parserUrl: '/ok' },
        { fileName: 'Bad', fileType: 'folder', parserUrl: '/bad' }
      ],
      maxDepth: 1,
      async fetchChildren(folder) {
        if (folder.fileName === 'Bad') throw new Error('network')
        return [
          cloudFile('keep.txt'),
          { fileName: 'TooDeep', fileType: 'folder', parserUrl: '/deep' }
        ]
      }
    })
    assert.deepEqual(ctx.files.map(file => file.fileName), ['keep.txt'])
    assert.equal(ctx.files[0].relativeDir, 'Ok')
    assert.equal(ctx.depthExceeded, true)
    assert.equal(ctx.failed, 1)
  })
})
