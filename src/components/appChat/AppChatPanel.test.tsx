import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppChatMessage, AppChatThread } from '../../lib/appChat'
import type { AppChatState } from '../../hooks/useAppChat'

const api = vi.hoisted(() => ({
  fetchAppChatMessages: vi.fn(),
  replyAppChat: vi.fn(),
  markAppChatRead: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({ supabase: null }))
vi.mock('../../lib/appChat', async (original) => ({ ...(await original<typeof import('../../lib/appChat')>()), ...api }))

import { AppChatPanel } from './AppChatPanel'

function thread(extra: Partial<AppChatThread> = {}): AppChatThread {
  return {
    thread_id: 1,
    student_id: 10,
    student_name: 'Ali',
    student_code: 'S1234567',
    staff_id: 5,
    staff_name: 'Joey',
    role: 'teacher',
    mine: true,
    last_message_at: '2026-10-22T03:00:00Z',
    last_preview: 'I cannot open the homework',
    last_sender: 'student',
    unread_for_staff: 1,
    student_read_at: null,
    ...extra,
  }
}

const message: AppChatMessage = {
  id: 1,
  thread_id: 1,
  sender: 'student',
  sender_staff_id: null,
  body: 'I cannot open the homework',
  created_at: '2026-10-22T03:00:00Z',
}

function chat(threads: AppChatThread[], on = true): AppChatState {
  return { on, threads, loaded: true, unread: 0, reload: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  api.fetchAppChatMessages.mockReset().mockResolvedValue([message])
  api.replyAppChat.mockReset().mockResolvedValue(undefined)
  api.markAppChatRead.mockReset().mockResolvedValue(undefined)
})

describe('AppChatPanel', () => {
  it('says how to turn chat on when the school has it off', () => {
    render(<AppChatPanel chat={chat([], false)} isAdmin={false} />)
    expect(screen.getByText(/Student app chat is off/)).toBeInTheDocument()
  })

  it('lists a chat with the student code and opens it, reading it and answering', async () => {
    const user = userEvent.setup()
    render(<AppChatPanel chat={chat([thread()])} isAdmin={false} />)
    await user.click(screen.getByRole('button', { name: /S1234567 · Ali/ }))
    expect(await screen.findAllByText('I cannot open the homework')).not.toHaveLength(0)
    expect(api.markAppChatRead).toHaveBeenCalledWith(1)
    await user.type(screen.getByPlaceholderText('Reply to Ali'), 'Try again{Enter}')
    await waitFor(() => expect(api.replyAppChat).toHaveBeenCalledWith(1, 'Try again'))
  })

  it('lets an admin read another teacher’s chat without answering or marking it read', async () => {
    const user = userEvent.setup()
    render(<AppChatPanel chat={chat([thread({ mine: false })])} isAdmin />)
    await user.click(screen.getByRole('button', { name: /S1234567 · Ali/ }))
    expect(await screen.findByText('Viewing')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Reply to Ali')).not.toBeInTheDocument()
    expect(screen.getByText(/Only Joey can answer this chat/)).toBeInTheDocument()
    expect(api.markAppChatRead).not.toHaveBeenCalled()
  })

  it('does not mark a chat read while the page is behind another one', async () => {
    const user = userEvent.setup()
    render(<AppChatPanel chat={chat([thread()])} isAdmin={false} active={false} />)
    await user.click(screen.getByRole('button', { name: /S1234567 · Ali/ }))
    expect(await screen.findAllByText('I cannot open the homework')).not.toHaveLength(0)
    expect(api.markAppChatRead).not.toHaveBeenCalled()
  })

  it('lets an admin keep only the chats written to them', async () => {
    const user = userEvent.setup()
    render(<AppChatPanel chat={chat([thread({ mine: false }), thread({ thread_id: 2, student_name: 'Siti', student_code: null })])} isAdmin />)
    await user.click(screen.getByLabelText('Only chats written to me'))
    expect(screen.queryByRole('button', { name: /Ali/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Siti/ })).toBeInTheDocument()
  })
})
