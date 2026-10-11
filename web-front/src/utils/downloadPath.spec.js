const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  sanitizePathSegment,
  joinRelativeDir,
  sanitizeRelativeDir,
  appendFolderSegment,
  folderSegmentsFromNode,
  withRelativeDir,
  ariaOutName,
  joinDownloadDir,
  isStructuralFolder
} = require('./downloadPath')

describe('downloadPath', () => {
  it('keeps normal folder and file names', () => {
    assert.equal(sanitizePathSegment('Season 1'), 'Season 1')
    assert.equal(sanitizePathSegment('第一季'), '第一季')
    assert.equal(ariaOutName('ep.01.mkv', 'Movie/Season 1'), 'Movie/Season 1/ep.01.mkv')
  })

  it('drops traversal and illegal path characters', () => {
    assert.equal(sanitizePathSegment('..'), '')
    assert.equal(sanitizePathSegment('../etc'), '_etc')
    assert.equal(sanitizeRelativeDir('Movie/../../secret'), 'Movie/secret')
    assert.equal(ariaOutName('a:b?.txt', 'bad/../ok'), 'bad/ok/a_b_.txt')
    assert.equal(joinDownloadDir('D:\\Downloads', 'Movie/../Season'), 'D:\\Downloads\\Movie\\Season')
  })

  it('joins download directories with the base separator', () => {
    assert.equal(joinDownloadDir('/data/downloads', 'Movie/Season'), '/data/downloads/Movie/Season')
    assert.equal(joinDownloadDir('D:\\Downloads\\', ''), 'D:\\Downloads')
    assert.equal(joinDownloadDir('', 'Movie'), 'Movie')
  })

  it('builds a relative dir from tree parents and skips the share root', () => {
    const root = { data: { id: 'root', fileName: '全部文件', fileType: 'folder' }, parent: null }
    const movie = { data: { fileName: 'Movie', fileType: 'folder' }, parent: root }
    const file = { data: { fileName: 'a.mkv', fileType: 'file' }, parent: movie }
    assert.equal(isStructuralFolder(root.data), false)
    assert.deepEqual(folderSegmentsFromNode(file), ['Movie'])
    assert.equal(joinRelativeDir(folderSegmentsFromNode(file)), 'Movie')
    assert.equal(withRelativeDir(file.data, ['Movie']).relativeDir, 'Movie')
  })

  it('appends only real folder names', () => {
    assert.deepEqual(
      appendFolderSegment(['Movie'], { fileName: 'Season 1', fileType: 'folder' }),
      ['Movie', 'Season 1']
    )
    assert.deepEqual(
      appendFolderSegment(['Movie'], { id: 'root', fileName: '全部文件', fileType: 'folder' }),
      ['Movie']
    )
  })
})
