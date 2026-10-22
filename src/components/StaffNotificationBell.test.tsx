import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffNotificationBell } from './StaffNotificationBell'
import { noteBody, panelPlace, timeAgo, type StaffNotification } from '../lib/staffNotifications'

const note = (id: number, extra: Partial<StaffNotification> = {}): StaffNotification => ({
  id,
  title: `Please call Mrs Lim ${id}`,
  body: `Please call Mrs Lim ${id}\nEthan missed 2 classes.`,
  leadId: 7,
  studentId: 9,
  flowId: 1,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  readAt: null,
  ...extra,
})

function setup(items: StaffNotification[], links: { chat?: boolean; lead?: boolean } = { chat: true, lead: true }) {
  const handlers = { onMarkRead: vi.fn(), onOpenChat: vi.fn(), onOpenLead: vi.fn(), onOpenStudent: vi.fn() }
  render(
    <StaffNotificationBell
      items={items}
      unread={items.filter((item) => item.readAt === null).length}
      onMarkRead={handlers.onMarkRead}
      onOpenChat={links.chat ? handlers.onOpenChat : null}
      onOpenLead={links.lead ? handlers.onOpenLead : null}
      onOpenStudent={handlers.onOpenStudent}
    />,
  )
  return handlers
}

describe('the notification bell', () => {
  it('shows how many are unread, and the list when pressed', async () => {
    setup([note(1), note(2, { readAt: '2026-10-22T01:00:00Z' })])
    const bell = screen.getByRole('button', { name: 'Notifications, 1 unread' })
    expect(bell).toHaveTextContent('1')
    await userEvent.click(bell)
    expect(screen.getByText('Please call Mrs Lim 1')).toBeInTheDocument()
    // The first line is the title, so it is not repeated underneath.
    expect(screen.getAllByText('Ethan missed 2 classes.')).toHaveLength(2)
    expect(screen.getAllByText('5 min ago')).toHaveLength(2)
  })

  it('opens the chat and marks that note read', async () => {
    const handlers = setup([note(1)])
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(handlers.onOpenChat).toHaveBeenCalledWith(7)
    expect(handlers.onMarkRead).toHaveBeenCalledWith([1])
    // The list closes.
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('opens the student, and an already read note is not marked again', async () => {
    const handlers = setup([note(1, { readAt: '2026-10-22T01:00:00Z' })])
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    await userEvent.click(screen.getByRole('button', { name: 'Student' }))
    expect(handlers.onOpenStudent).toHaveBeenCalledWith(9)
    expect(handlers.onMarkRead).not.toHaveBeenCalled()
  })

  it('leaves out the links a person cannot open', async () => {
    setup([note(1)], {})
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lead' })).not.toBeInTheDocument()
  })

  it('marks everything read at once', async () => {
    const handlers = setup([note(1), note(2)])
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(handlers.onMarkRead).toHaveBeenCalledWith(null)
  })

  it('says when there is nothing yet', async () => {
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument()
  })
})

describe('notification text', () => {
  it('keeps a body whose first line is not the title', () => {
    expect(noteBody({ title: 'Automation', body: 'Hi team' })).toBe('Hi team')
    expect(noteBody({ title: 'Hi team', body: 'Hi team' })).toBe('')
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-10-22T12:00:00Z')
    expect(timeAgo('2026-10-22T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-10-22T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-10-20T12:00:00Z', now)).toBe('2 d ago')
    expect(timeAgo('2026-10-01T12:00:00Z', now)).toBe('1 Oct')
  })
})

describe('where the list opens', () => {
  it('under the bell, right edges together, on a wide screen', () => {
    expect(panelPlace({ left: 800, right: 832, bottom: 140 }, 1024)).toEqual({ top: 148, left: 480, width: 352 })
  })

  it('inside the screen on a phone where the bell is on the left', () => {
    expect(panelPlace({ left: 16, right: 48, bottom: 248 }, 375)).toEqual({ top: 256, left: 16, width: 343 })
  })
})
