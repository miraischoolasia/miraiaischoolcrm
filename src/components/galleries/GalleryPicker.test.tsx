import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GalleryPicker } from './GalleryPicker'
import type { GalleryData } from '../../lib/galleries'

vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://files.test/${path}` } }) }) } },
}))

const base = { uploadedByName: null, createdAt: '2026-10-23T00:00:00Z', deletedAt: null, deletedByName: null }
const data: GalleryData = {
  folders: [{ id: 1, parentId: null, name: 'Posters', deletedAt: null }],
  files: [
    { ...base, id: 1, folderId: null, name: 'poster.png', path: 'a/poster.png', mime: 'image/png', kind: 'image', sizeBytes: 1000 },
    { ...base, id: 2, folderId: null, name: 'guide.pdf', path: 'b/guide.pdf', mime: 'application/pdf', kind: 'document', sizeBytes: 1000 },
    { ...base, id: 3, folderId: 1, name: 'inside.png', path: 'c/inside.png', mime: 'image/png', kind: 'image', sizeBytes: 1000 },
  ],
}

describe('GalleryPicker', () => {
  it('for an Automation message: only pictures can be picked', async () => {
    const onPick = vi.fn()
    render(<GalleryPicker use="automation" onPick={onPick} onClose={() => {}} load={vi.fn().mockResolvedValue(data)} />)
    expect(await screen.findByRole('button', { name: 'Use guide.pdf' })).toBeDisabled()
    expect(screen.getByText('An Automation message can only carry a picture.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use poster.png' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('opens folders and finds files in every folder', async () => {
    render(<GalleryPicker use="inbox" onPick={vi.fn()} onClose={() => {}} load={vi.fn().mockResolvedValue(data)} />)
    await userEvent.click(await screen.findByRole('button', { name: /Posters/ }))
    expect(screen.getByRole('button', { name: 'Use inside.png' })).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Search Galleries'), 'guide')
    expect(screen.getByRole('button', { name: 'Use guide.pdf' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Use inside.png' })).not.toBeInTheDocument()
  })

  it('shows why a pick failed', async () => {
    const onPick = vi.fn().mockRejectedValue(new Error('A quick reply file can be up to 16 MB.'))
    render(<GalleryPicker use="quick_reply" onPick={onPick} onClose={() => {}} load={vi.fn().mockResolvedValue(data)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Use poster.png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('16 MB')
  })
})
