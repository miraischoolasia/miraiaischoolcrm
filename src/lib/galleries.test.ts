import { describe, expect, it } from 'vitest'
import {
  binItems,
  binSubtree,
  childFolders,
  folderChoices,
  folderTrail,
  formatBytes,
  kindOf,
  searchFiles,
  storageName,
  uploadProblem,
  usageLevel,
  usableProblem,
  type GalleryData,
  type GalleryFile,
  type GalleryUsage,
} from './galleries'

const MB = 1_048_576

function file(change: Partial<GalleryFile>): GalleryFile {
  return {
    id: 1,
    folderId: null,
    name: 'photo.jpg',
    path: 'a/photo.jpg',
    mime: 'image/jpeg',
    kind: 'image',
    sizeBytes: 100_000,
    uploadedByName: 'Mei',
    createdAt: '2026-10-23T00:00:00Z',
    deletedAt: null,
    deletedByName: null,
    ...change,
  }
}

const usage: GalleryUsage = { maxFileMb: 50, quotaMb: 100, warnPercent: 80, usedBytes: 10 * MB, binBytes: 0, files: 3 }

const data: GalleryData = {
  folders: [
    { id: 1, parentId: null, name: 'Photos', deletedAt: null },
    { id: 2, parentId: 1, name: '2026', deletedAt: null },
    { id: 3, parentId: null, name: 'Old', deletedAt: '2026-10-20T00:00:00Z' },
    { id: 4, parentId: 3, name: 'Inside old', deletedAt: '2026-10-20T00:00:00Z' },
  ],
  files: [
    file({ id: 1, folderId: 2, name: 'Class Day.jpg' }),
    file({ id: 2, folderId: null, name: 'Fees.pdf', kind: 'document', mime: 'application/pdf' }),
    file({ id: 3, folderId: 4, name: 'gone.jpg', deletedAt: '2026-10-20T00:00:00Z' }),
    file({ id: 4, folderId: null, name: 'alone.jpg', deletedAt: '2026-10-21T00:00:00Z' }),
  ],
}

describe('galleries helpers', () => {
  it('tells the kind of a file', () => {
    expect(kindOf('image/png')).toBe('image')
    expect(kindOf('video/mp4')).toBe('video')
    expect(kindOf('audio/ogg')).toBe('audio')
    expect(kindOf('application/pdf')).toBe('document')
  })

  it('writes sizes for people', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3.5 * MB)).toBe('3.5 MB')
  })

  it('makes a safe storage name', () => {
    expect(storageName('上课 照片 (1).JPG')).toBe('1.jpg')
    expect(storageName('Class photo.png')).toBe('Class-photo.png')
  })

  it('refuses web pages, files over the largest size and over the space, with what to do', () => {
    expect(uploadProblem({ name: 'page.html', size: 10 }, usage)).toContain('web pages and programs')
    expect(uploadProblem({ name: 'big.mp4', size: 60 * MB }, usage)).toContain('largest file Galleries keeps is 50 MB')
    expect(uploadProblem({ name: 'ok.mp4', size: 95 * MB }, { ...usage, maxFileMb: 200 })).toContain('Empty the Bin')
    expect(uploadProblem({ name: 'ok.jpg', size: MB }, usage)).toBeNull()
  })

  it('says why a file cannot be used somewhere', () => {
    expect(usableProblem({ kind: 'document', sizeBytes: 10 }, 'automation')).toContain('only carry a picture')
    expect(usableProblem({ kind: 'image', sizeBytes: 6 * MB }, 'automation')).toContain('up to 5 MB')
    expect(usableProblem({ kind: 'video', sizeBytes: 40 * MB }, 'inbox')).toContain('videos up to 32 MB')
    expect(usableProblem({ kind: 'document', sizeBytes: 45 * MB }, 'inbox')).toContain('files up to 40 MB')
    expect(usableProblem({ kind: 'video', sizeBytes: 20 * MB }, 'quick_reply')).toBeNull()
    expect(usableProblem({ kind: 'image', sizeBytes: 20 * MB }, 'quick_reply')).toContain('16 MB')
    expect(usableProblem({ kind: 'document', sizeBytes: 20 * MB }, 'inbox')).toBeNull()
  })

  it('warns as the space fills up', () => {
    expect(usageLevel(usage)).toBe('ok')
    expect(usageLevel({ ...usage, usedBytes: 85 * MB })).toBe('warn')
    expect(usageLevel({ ...usage, usedBytes: 100 * MB })).toBe('full')
  })

  it('reads the folder tree', () => {
    expect(childFolders(data, null).map((folder) => folder.name)).toEqual(['Photos'])
    expect(folderTrail(data, 2).map((folder) => folder.name)).toEqual(['Photos', '2026'])
    expect(folderChoices(data).map((choice) => choice.label)).toEqual(['Photos', 'Photos / 2026'])
    expect(searchFiles(data, 'class').map((entry) => entry.id)).toEqual([1])
  })

  it('shows the Bin by its outer folders, and deletes a folder with what was inside', () => {
    const bin = binItems(data)
    expect(bin.folders.map((folder) => folder.id)).toEqual([3])
    expect(bin.files.map((entry) => entry.id)).toEqual([4])
    const subtree = binSubtree(data, 3)
    expect(subtree.folderIds).toEqual([3, 4])
    expect(subtree.files.map((entry) => entry.id)).toEqual([3])
  })
})
