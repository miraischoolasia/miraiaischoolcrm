import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GalleriesSection, type GalleriesApi } from './GalleriesSection'
import type { GalleryData } from '../../lib/galleries'

vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://files.test/${path}` } }) }) } },
}))

const MB = 1_048_576

const data: GalleryData = {
  folders: [{ id: 1, parentId: null, name: 'Photos', deletedAt: null }],
  files: [
    {
      id: 10, folderId: null, name: 'Fees.pdf', path: 'a/fees.pdf', mime: 'application/pdf', kind: 'document', sizeBytes: 2 * MB,
      uploadedByName: 'Mei', createdAt: '2026-10-23T00:00:00Z', deletedAt: null, deletedByName: null,
    },
    {
      id: 11, folderId: null, name: 'Old.jpg', path: 'b/old.jpg', mime: 'image/jpeg', kind: 'image', sizeBytes: MB,
      uploadedByName: 'Mei', createdAt: '2026-10-22T00:00:00Z', deletedAt: '2026-10-23T01:00:00Z', deletedByName: 'Mei',
    },
  ],
}

function makeApi(overrides: Partial<GalleriesApi> = {}): GalleriesApi {
  return {
    fetchGallery: vi.fn().mockResolvedValue(data),
    fetchUsage: vi.fn().mockResolvedValue({ maxFileMb: 50, quotaMb: 100, warnPercent: 80, usedBytes: 85 * MB, binBytes: MB, files: 1 }),
    uploadToGallery: vi.fn().mockResolvedValue(20),
    addFolder: vi.fn().mockResolvedValue(2),
    renameItem: vi.fn().mockResolvedValue(undefined),
    moveItems: vi.fn().mockResolvedValue(undefined),
    trashItems: vi.fn().mockResolvedValue(undefined),
    restoreItems: vi.fn().mockResolvedValue(undefined),
    deleteForever: vi.fn().mockResolvedValue(undefined),
    saveLimits: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('GalleriesSection', () => {
  it('shows the hint, the space, folders and files', async () => {
    render(<GalleriesSection canEdit canDelete api={makeApi()} />)
    expect(await screen.findByText(/不要上传身份证、成绩单等敏感文件/)).toBeInTheDocument()
    expect(await screen.findByText(/85 MB of 100 MB used/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('over 80% full')
    expect(screen.getByRole('button', { name: 'Open Photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Fees.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Old.jpg' })).not.toBeInTheDocument()
  })

  it('uploads, and refuses a file over the largest size before sending it', async () => {
    const api = makeApi()
    render(<GalleriesSection canEdit canDelete api={api} />)
    await screen.findByRole('button', { name: 'Open Fees.pdf' })
    const input = screen.getByLabelText('Choose files to upload')
    const small = new File(['x'], 'small.jpg', { type: 'image/jpeg' })
    const big = new File(['x'], 'big.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 60 * MB })
    await userEvent.upload(input, [small, big])
    await waitFor(() => expect(api.uploadToGallery).toHaveBeenCalledTimes(1))
    expect(api.uploadToGallery).toHaveBeenCalledWith(small, null, expect.anything())
    expect(within(screen.getByRole('list', { name: 'Uploads' })).getByText(/largest file Galleries keeps is 50 MB/)).toBeInTheDocument()
  })

  it('moves a file to the Bin after asking, and restores it from the Bin', async () => {
    const api = makeApi()
    render(<GalleriesSection canEdit canDelete api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Fees.pdf' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to Bin' }))
    expect(api.trashItems).toHaveBeenCalledWith([10], [])

    await userEvent.click(screen.getByRole('tab', { name: /Bin/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Restore Old.jpg' }))
    expect(api.restoreItems).toHaveBeenCalledWith([11], [])
  })

  it('has no upload, rename or delete for someone who may only look', async () => {
    render(<GalleriesSection canEdit={false} canDelete={false} api={makeApi()} />)
    await screen.findByRole('button', { name: 'Open Fees.pdf' })
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Fees.pdf' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link Fees.pdf' })).toBeInTheDocument()
  })
})
