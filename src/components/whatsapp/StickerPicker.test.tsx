import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StickerPicker } from './StickerPicker'
import { StickerSourceContext, stickerFileProblem } from '../../lib/inboxStickers'

vi.mock('../../lib/supabase', () => ({ supabase: null }))

function fakeApi() {
  return {
    listLibraryStickers: vi.fn().mockResolvedValue([{ id: 1, name: 'Mirai thumbs up', path: 'a.webp', url: 'https://storage/a.webp' }]),
    listReceivedStickers: vi.fn().mockResolvedValue([{ url: 'https://wa.example/rails/active_storage/x/cat.webp', name: 'cat.webp' }]),
    addLibrarySticker: vi.fn().mockResolvedValue(undefined),
    hideLibrarySticker: vi.fn().mockResolvedValue(undefined),
    stickerFile: vi.fn(async (url: string, name: string | null) => new File(['x'], name ?? url, { type: 'image/webp' })),
  }
}

function show(canManage: boolean, api = fakeApi(), onPick = vi.fn()) {
  render(
    <StickerSourceContext.Provider value={{ mediaUrl: (url) => url.replace('wa.example', 'wa.school'), canManage }}>
      <StickerPicker onPick={onPick} isSending={false} api={api} />
    </StickerSourceContext.Provider>,
  )
  return { api, onPick }
}

describe('StickerPicker', () => {
  it('sends a school sticker with one click', async () => {
    const { api, onPick } = show(false)
    await userEvent.click(await screen.findByRole('button', { name: 'Send sticker Mirai thumbs up' }))
    expect(api.stickerFile).toHaveBeenCalledWith('https://storage/a.webp', 'Mirai thumbs up')
    expect(onPick).toHaveBeenCalledWith(expect.any(File))
    // Only an admin changes the library.
    expect(screen.queryByLabelText("Add a sticker to the school's library")).not.toBeInTheDocument()
  })

  it('sends back a sticker a parent sent, read through the school\'s own inbox address', async () => {
    const { api, onPick } = show(false)
    await userEvent.click(screen.getByRole('tab', { name: 'Received lately' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Send sticker cat.webp' }))
    expect(api.stickerFile).toHaveBeenCalledWith('https://wa.school/rails/active_storage/x/cat.webp', 'cat.webp')
    expect(onPick).toHaveBeenCalled()
  })

  it('lets an admin add a sticker and take one out', async () => {
    const { api } = show(true)
    const picture = new File(['x'], 'hello.png', { type: 'image/png' })
    await userEvent.upload(await screen.findByLabelText("Add a sticker to the school's library"), picture)
    await waitFor(() => expect(api.addLibrarySticker).toHaveBeenCalledWith(picture))
    await userEvent.click(screen.getByRole('button', { name: 'Take Mirai thumbs up out of the library' }))
    expect(api.hideLibrarySticker).toHaveBeenCalledWith(1)
  })

  it('takes only small PNG, JPEG or WebP pictures into the library', () => {
    expect(stickerFileProblem(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull()
    expect(stickerFileProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))).toMatch(/PNG, JPEG or WebP/)
    expect(stickerFileProblem(new File([new Uint8Array(1024 * 1024 + 1)], 'a.png', { type: 'image/png' }))).toMatch(/under 1 MB/)
  })
})
