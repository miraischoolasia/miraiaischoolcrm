import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboxCopyPanel, resetCopyJob } from './InboxCopyPanel'
import type { ChatwootClient } from '../../lib/chatwootClient'
import type { CopyProgress } from '../../lib/inboxCopyBackfill'

vi.mock('../../lib/supabase', () => ({ supabase: null }))

const client = {} as ChatwootClient
const summary = async () => ({ chats: 500, messages: 10_000, copiedChats: 498, chatsToCopy: 0, firstMessageAt: '2026-06-12T07:35:30+00:00' })
const progress = (change: Partial<CopyProgress>): CopyProgress => ({
  phase: 'chats', chatsTotal: 500, chatsDone: 0, chatsSkipped: 0, chatsFailed: 0, messages: 0, daysTotal: 0, daysDone: 0, ...change,
})

afterEach(() => resetCopyJob())

describe('InboxCopyPanel', () => {
  it('keeps going after the page is left, and shows where it is when the page opens again', async () => {
    let finish: () => void = () => {}
    let cancelledCheck: () => boolean = () => false
    const run = vi.fn(({ onProgress, cancelled }: { onProgress: (p: CopyProgress) => void; cancelled: () => boolean }) => {
      cancelledCheck = cancelled
      onProgress(progress({ chatsDone: 120 }))
      return new Promise<CopyProgress>((resolve) => {
        finish = () => resolve(progress({ phase: 'done', chatsDone: 500, messages: 10_000, daysTotal: 129, daysDone: 129 }))
      })
    })
    const first = render(<InboxCopyPanel client={client} onFinished={() => {}} run={run as never} loadSummary={summary} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Carry on copying' }))
    expect(screen.getByText(/Copying chats: 120 of 500/)).toBeInTheDocument()

    // The admin goes to another page.
    first.unmount()
    expect(cancelledCheck()).toBe(false)

    // ...and comes back while it is still going.
    const onFinished = vi.fn()
    render(<InboxCopyPanel client={client} onFinished={onFinished} run={run as never} loadSummary={summary} />)
    expect(screen.getByText(/Copying chats: 120 of 500/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copying…' })).toBeDisabled()

    await act(async () => finish())
    expect(screen.getByText(/Done: 10,000 messages copied, 129 days worked out/)).toBeInTheDocument()
    expect(onFinished).toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('stops only when Stop is pressed', async () => {
    let cancelledCheck: () => boolean = () => false
    const run = vi.fn(({ cancelled }: { cancelled: () => boolean }) => {
      cancelledCheck = cancelled
      return new Promise<CopyProgress>(() => {})
    })
    render(<InboxCopyPanel client={client} onFinished={() => {}} run={run as never} loadSummary={summary} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Carry on copying' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(cancelledCheck()).toBe(true)
  })

  it('works out the days again without reading any chat', async () => {
    const run = vi.fn()
    const runDays = vi.fn(async ({ onProgress }: { onProgress: (p: CopyProgress) => void }) => {
      const done = progress({ phase: 'done', chatsTotal: 0, daysTotal: 129, daysDone: 129 })
      onProgress(done)
      return done
    })
    render(<InboxCopyPanel client={client} onFinished={() => {}} run={run as never} runDays={runDays as never} loadSummary={summary} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Work out the days' }))

    expect(runDays).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
    expect(await screen.findByText('Done: 129 days worked out.')).toBeInTheDocument()
  })
})
