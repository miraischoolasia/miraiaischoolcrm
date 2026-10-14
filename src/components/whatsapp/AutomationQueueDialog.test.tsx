import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QueueItem } from '../../lib/automationQueue'
import { AutomationQueueDialog } from './AutomationQueueDialog'

const NOW = Date.parse('2026-10-14T10:00:00+08:00')

const item = (change: Partial<QueueItem>): QueueItem => ({
  id: 1,
  ruleKey: 'trial_reminder',
  ruleName: 'Trial reminder',
  phone: '60123456789',
  parentName: 'Mrs Lim',
  childName: 'Ethan',
  leadId: null,
  studentId: null,
  message: 'Hi Mrs Lim, a reminder about tomorrow.',
  status: 'pending',
  dueAt: '2026-10-14T09:00:00+08:00',
  expiresAt: null,
  decidedAt: null,
  sentAt: null,
  error: null,
  createdAt: '2026-10-13T09:00:00+08:00',
  autoBlocked: null,
  mediaUrl: null,
  ...change,
})

const second = item({ id: 2, parentName: 'Mr Wong', childName: 'Chloe', phone: '60111111111', message: 'Hi Mr Wong' })

function setup(
  change: {
    items?: QueueItem[]
    canEdit?: boolean
    sentToday?: number
    paused?: boolean
    autoRuleKeys?: string[]
    nowMs?: number
  } = {},
) {
  const onApprove = vi.fn().mockResolvedValue({ sent: 1, failure: null, taken: 0, heldBack: 0 })
  const onSkip = vi.fn().mockResolvedValue(null)
  const onSaveMessage = vi.fn().mockResolvedValue(null)
  render(
    <AutomationQueueDialog
      items={change.items ?? [item({}), second]}
      autoRuleKeys={new Set(change.autoRuleKeys ?? [])}
      settings={{ paused: change.paused ?? false, dailyCap: 40, gapSeconds: 30 }}
      sentToday={change.sentToday ?? 0}
      canEdit={change.canEdit ?? true}
      isLoading={false}
      loadError={null}
      progress={null}
      nowMs={change.nowMs ?? NOW}
      onClose={vi.fn()}
      onSaveMessage={onSaveMessage}
      onSkip={onSkip}
      onApprove={onApprove}
    />,
  )
  return { onApprove, onSkip, onSaveMessage }
}

describe('AutomationQueueDialog', () => {
  it('shows who each message is for, and sends nothing until one is ticked', () => {
    setup()

    expect(screen.getByText('Mrs Lim')).toBeInTheDocument()
    expect(screen.getByText('· Ethan')).toBeInTheDocument()
    expect(screen.getByText(/Sent today 0 of 40/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Approve and send \(0\)/ })).toBeDisabled()
  })

  it('shows the messages of a flow that sends by itself apart, and says they need nobody', () => {
    setup({
      items: [
        item({ id: 1, ruleKey: 'flow_1', ruleName: 'Class reminder', dueAt: '2026-10-14T19:30:00+08:00' }),
        item({ id: 2, ruleKey: 'flow_2', ruleName: 'Follow up', parentName: 'Mr Wong', phone: '60111111111', message: 'Hi Mr Wong' }),
      ],
      autoRuleKeys: ['flow_1'],
    })

    const auto = screen.getByRole('region', { name: 'Will send by itself' })
    expect(auto).toHaveTextContent('Mrs Lim')
    expect(auto).toHaveTextContent('No need to approve it')
    const needs = screen.getByRole('region', { name: 'Needs your approval' })
    expect(needs).toHaveTextContent('Mr Wong')
    expect(needs).not.toHaveTextContent('Mrs Lim')
    // "Select all" counts only what needs a person.
    expect(screen.getByRole('button', { name: 'Select all (1)' })).toBeInTheDocument()
  })

  it('says when a message due after the sending hours will really go out', () => {
    setup({
      items: [item({ id: 1, ruleKey: 'flow_1', dueAt: '2026-10-14T21:17:00+08:00' })],
      autoRuleKeys: ['flow_1'],
      nowMs: Date.parse('2026-10-14T21:30:00+08:00'),
    })

    const auto = screen.getByRole('region', { name: 'Will send by itself' })
    expect(auto).toHaveTextContent(/outside the sending hours \(9:00 to 21:00\)/)
  })

  it('keeps a message the sender handed back in the list that needs a person', () => {
    setup({
      items: [item({ id: 1, ruleKey: 'flow_1', autoBlocked: 'Never wrote to us first.' })],
      autoRuleKeys: ['flow_1'],
    })

    expect(screen.queryByRole('region', { name: 'Will send by itself' })).not.toBeInTheDocument()
    expect(screen.getByText(/Not sent by itself: Never wrote to us first/)).toBeInTheDocument()
  })

  it('sends the ticked messages with the text as edited', async () => {
    const { onApprove } = setup()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mrs Lim' }))
    const box = screen.getByRole('textbox', { name: 'Message to Mrs Lim' })
    await userEvent.clear(box)
    await userEvent.type(box, 'Hi Mrs Lim, see you at 2pm.')
    await userEvent.click(screen.getByRole('button', { name: /Approve and send \(1\)/ }))

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1))
    const entries = onApprove.mock.calls[0][0]
    expect(entries).toHaveLength(1)
    expect(entries[0].item.id).toBe(1)
    expect(entries[0].message).toBe('Hi Mrs Lim, see you at 2pm.')
    expect(await screen.findByText('1 message sent.')).toBeInTheDocument()
  })

  it('skips the ticked messages', async () => {
    const { onSkip } = setup()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mr Wong' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip selected' }))

    await waitFor(() => expect(onSkip).toHaveBeenCalledWith([2]))
  })

  it('only sends as many as the daily limit leaves, and says so', async () => {
    const { onApprove } = setup({ sentToday: 39 })

    await userEvent.click(screen.getByRole('button', { name: /Select all/ }))

    expect(screen.getByText(/Only 1 more can go out today/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Approve and send \(1\)/ })).toBeEnabled()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('does not let a message that is too late be ticked', () => {
    setup({ items: [item({ expiresAt: '2026-10-14T08:00:00+08:00' })] })

    expect(screen.getByText('Too late to send')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Mrs Lim' })).toBeDisabled()
  })

  it('lets someone without edit rights read but not send', () => {
    setup({ canEdit: false })

    expect(screen.getByText(/Only people who can edit Leads/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Mrs Lim' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Message to Mrs Lim' })).toBeDisabled()
  })

  it('tells when automations are paused and when nothing is waiting', () => {
    setup({ items: [], paused: true })

    expect(screen.getByText(/Automations are paused/)).toBeInTheDocument()
    expect(screen.getByText('All caught up')).toBeInTheDocument()
  })
})
