import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WaLabelSyncDialog, type WaLabelSyncApi } from './WaLabelSyncDialog'
import { DEFAULT_WA_LABEL_SYNC, type WaLabelBudget, type WaLabelSyncSettings } from '../../lib/waLabelSync'
import type { LeadOption } from '../../types/domain'

const tag = (id: number, label: string): LeadOption => ({ id, kind: 'tag', label, isActive: true, legacyKey: null, color: '#ff0000' }) as LeadOption

const budget: WaLabelBudget = {
  maxLabels: 2,
  chats: 30,
  ticked: false,
  picColor: 9,
  pics: [{ id: 1, name: '👤 Amy', chats: 20 }],
  tagsIn: [{ id: 5, name: 'VIP', color: '#ff0000', chats: 12 }],
  tagsOut: [{ id: 6, name: 'Cold', chats: 3, why: 'full' }],
}

function api(settings: WaLabelSyncSettings | null = DEFAULT_WA_LABEL_SYNC): WaLabelSyncApi {
  return {
    fetchSettings: vi.fn(async () => ({ settings, error: settings ? null : 'WhatsApp labels need the database update first.' })),
    save: vi.fn(async (next: WaLabelSyncSettings) => next),
    fetchBudget: vi.fn(async () => budget),
    fetchRuns: vi.fn(
      async () =>
        new Map([
          [
            4,
            {
              inboxId: 4,
              startedAt: '2026-10-23T20:00:00Z',
              finishedAt: '2026-10-23T20:05:00Z',
              dryRun: false,
              chatsPlanned: 10,
              chatsDone: 9,
              chatsNoNumber: 0,
              chatsFailed: 1,
              labelsAdded: 14,
              labelsRemoved: 2,
              labelsMade: [],
              labelsMissing: [],
              tagsLeftOut: ['Cold'],
              stopped: null,
            },
          ],
        ]),
    ),
    fetchNumbers: vi.fn(async () => [
      { inboxId: 4, kind: 'whatsapp' as const, label: 'Sales', access: 'open' as const, isActive: true },
      { inboxId: 7, kind: 'messenger' as const, label: 'Page', access: 'open' as const, isActive: true },
    ]),
  }
}

describe('WaLabelSyncDialog', () => {
  it("shows each WhatsApp number's labels for tonight, what is left out, and last night's report", async () => {
    render(<WaLabelSyncDialog tags={[tag(5, 'VIP'), tag(6, 'Cold')]} onClose={vi.fn()} api={api()} />)

    const card = await screen.findByRole('region', { name: 'Labels of Sales' })
    expect(screen.queryByRole('region', { name: 'Labels of Page' })).not.toBeInTheDocument()
    expect(await within(card).findByText('👤 Amy')).toBeInTheDocument()
    expect(within(card).getByText('VIP')).toBeInTheDocument()
    expect(within(card).getByText('Cold (full)')).toBeInTheDocument()
    expect(within(card).getByText(/9 of 10 chats done · 14 labels put on · 2 taken off · 1 failed/)).toBeInTheDocument()
    expect(within(card).getByText('Tags left out: Cold')).toBeInTheDocument()
  })

  it('ticks the tags of a number starting from tonight\'s choice, and saves the settings', async () => {
    const calls = api()
    render(<WaLabelSyncDialog tags={[tag(5, 'VIP'), tag(6, 'Cold')]} onClose={vi.fn()} api={calls} />)

    const card = await screen.findByRole('region', { name: 'Labels of Sales' })
    await within(card).findByText('👤 Amy')
    await userEvent.click(screen.getByLabelText('Put the labels on every night'))
    await userEvent.click(within(card).getByLabelText('Only the tags I tick'))
    expect(within(card).getByRole('checkbox', { name: /VIP/ })).toBeChecked()
    await userEvent.click(within(card).getByRole('checkbox', { name: /Cold/ }))
    expect(within(card).getByText(/Room for 1 tags after the Handled-by labels/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Colour 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, picColor: 2, inboxes: { 4: [5, 6] } }))
    expect(await screen.findByText(/Saved/)).toBeInTheDocument()

    await userEvent.click(within(card).getByLabelText(/Automatic/))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(calls.save).toHaveBeenLastCalledWith(expect.objectContaining({ inboxes: {} }))
  })

  it('says so when the database update is not there yet', async () => {
    render(<WaLabelSyncDialog tags={[]} onClose={vi.fn()} api={api(null)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('WhatsApp labels need the database update first.')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
