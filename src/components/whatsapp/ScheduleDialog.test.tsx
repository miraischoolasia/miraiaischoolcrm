import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleDialog, type ScheduleApi } from './ScheduleDialog'
import { ScheduledList } from './ScheduledList'
import type { ChatSchedule, ScheduleTarget } from '../../lib/chatSchedules'

vi.mock('../../lib/supabase', () => ({ supabase: null }))

const NOW = new Date('2026-10-20T02:00:00Z')
const target: ScheduleTarget = {
  conversationId: 42, contactId: 900, inboxId: 1, channel: 'whatsapp', phone: '60123456789', leadId: 7, parentName: 'Puan Aminah',
}

type FakeApi = { [K in keyof ScheduleApi]: ReturnType<typeof vi.fn> }

function fakeApi(): FakeApi {
  return {
    scheduleMessage: vi.fn().mockResolvedValue(1),
    scheduleFlow: vi.fn().mockResolvedValue(2),
    changeSchedule: vi.fn().mockResolvedValue(undefined),
    listFlowChoices: vi.fn().mockResolvedValue([{ id: 5, name: 'Trial follow-up' }]),
    pictureUrlFor: vi.fn().mockResolvedValue('https://storage/p.jpg?token=1'),
    signedPicture: vi.fn().mockResolvedValue('https://storage/q.png?token=2'),
  }
}

describe('ScheduleDialog', () => {
  it('schedules a message with a picture for this chat, cancelled if the parent replies first', async () => {
    const api = fakeApi()
    const onSaved = vi.fn()
    render(<ScheduleDialog target={target} quickReplies={[]} onClose={vi.fn()} onSaved={onSaved} api={api as unknown as ScheduleApi} now={NOW} />)

    await userEvent.type(screen.getByLabelText('Message'), 'See you on Saturday!')
    await userEvent.upload(screen.getByLabelText('Picture'), new File(['x'], 'map.jpg', { type: 'image/jpeg' }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))

    await waitFor(() => expect(api.scheduleMessage).toHaveBeenCalled())
    const [who, what] = api.scheduleMessage.mock.calls[0]
    expect(who).toEqual(target)
    expect(what).toMatchObject({ message: 'See you on Saturday!', mediaUrl: 'https://storage/p.jpg?token=1', cancelOnReply: true })
    expect(onSaved).toHaveBeenCalled()
  })

  it('fills in from a quick reply, with its picture', async () => {
    const api = fakeApi()
    const reply = {
      id: 3, title: 'Trial reminder', isActive: true,
      steps: [{ kind: 'text', text: 'Your trial is tomorrow.' }, { kind: 'media', media: { path: 'qr/map.png', name: 'map.png', type: 'image/png', size: 9 } }],
    }
    render(<ScheduleDialog target={target} quickReplies={[reply as never]} onClose={vi.fn()} onSaved={vi.fn()} api={api as unknown as ScheduleApi} now={NOW} />)

    await userEvent.selectOptions(screen.getByLabelText('Start from a quick reply (optional)'), '3')
    expect(screen.getByLabelText('Message')).toHaveValue('Your trial is tomorrow.')
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(api.signedPicture).toHaveBeenCalledWith('qr/map.png', expect.any(Date)))
    expect(api.scheduleMessage.mock.calls[0][1]).toMatchObject({ mediaUrl: 'https://storage/q.png?token=2' })
  })

  it('starts a flow for this person at a time', async () => {
    const api = fakeApi()
    render(<ScheduleDialog target={target} quickReplies={[]} onClose={vi.fn()} onSaved={vi.fn()} api={api as unknown as ScheduleApi} now={NOW} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Start a flow' }))
    await userEvent.selectOptions(await screen.findByLabelText('Flow'), '5')
    await userEvent.click(screen.getByLabelText('Cancel it if the parent replies before then'))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(api.scheduleFlow).toHaveBeenCalled())
    expect(api.scheduleFlow.mock.calls[0][1]).toMatchObject({ flowId: 5, cancelOnReply: false })
  })

  it('will not schedule without words, or in the past', async () => {
    const api = fakeApi()
    render(<ScheduleDialog target={target} quickReplies={[]} onClose={vi.fn()} onSaved={vi.fn()} api={api as unknown as ScheduleApi} now={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Write the message|has not passed/)
    expect(api.scheduleMessage).not.toHaveBeenCalled()
  })
})

describe('ScheduledList', () => {
  const schedule = (id: number, status: ChatSchedule['status'], extra: Partial<ChatSchedule> = {}): ChatSchedule => ({
    id, kind: 'message', message: `Message ${id}`, mediaUrl: null, flowId: null, runAt: '2026-10-21T02:00:00Z', cancelOnReply: true,
    status, createdByName: 'Mei', createdAt: '2026-10-20T02:00:00Z', ...extra,
  })

  it('shows what is waiting with Change and Cancel, and the done ones when opened', async () => {
    const onEdit = vi.fn()
    const onCancel = vi.fn()
    render(
      <ScheduledList
        schedules={[schedule(1, 'scheduled'), schedule(2, 'replied'), schedule(3, 'scheduled', { kind: 'flow', message: null, flowId: 5 })]}
        flows={[{ id: 5, name: 'Trial follow-up' }]}
        onEdit={onEdit}
        onCancel={onCancel}
      />,
    )
    const list = screen.getByLabelText('Scheduled for this chat')
    expect(list).toHaveTextContent('Message 1')
    expect(list).toHaveTextContent('Start flow: Trial follow-up')
    await userEvent.click(within(list).getAllByRole('button', { name: 'Change' })[0])
    expect(onEdit).toHaveBeenCalled()
    await userEvent.click(within(list).getAllByRole('button', { name: 'Cancel' })[0])
    expect(onCancel).toHaveBeenCalled()

    expect(list).not.toHaveTextContent('Message 2')
    await userEvent.click(screen.getByRole('button', { name: '1 done or cancelled' }))
    expect(list).toHaveTextContent('Cancelled: the parent replied first')
  })
})
