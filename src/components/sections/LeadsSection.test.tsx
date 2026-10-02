import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadsSection } from './LeadsSection'
import { getTodayString } from '../../domain/studentStatus'
import type { Lead, LeadOption } from '../../types/domain'

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Walk-in', isActive: true, legacyKey: 'walk_in' },
  { id: 10, kind: 'pic', label: 'Alex', isActive: true, legacyKey: null },
]

function makeLead(id: number, picId: number | null): Lead {
  return {
    id,
    fullName: `Parent ${id}`,
    phone: `01${String(id).padStart(8, '0')}`,
    sourceId: 1,
    picId,
    status: 'new',
    children: [],
    notes: null,
    followUps: [],
    tasks: [],
    convertedStudentId: null,
    addedDate: getTodayString(),
    createdAt: '',
    updatedAt: '',
  }
}

function renderSection(
  leads: Lead[],
  extra: { leadIdsWithForms?: Set<number>; onOpenFormAnswers?: (leadId: number) => void } = {},
) {
  render(
    <LeadsSection
      isLoading={false}
      leads={leads}
      onChangeStatus={vi.fn()}
      onConvertLead={vi.fn()}
      onEditLead={vi.fn()}
      onOpenCreateLead={vi.fn()}
      onOpenBulkImportLeads={vi.fn()}
      onOpenFollowUp={vi.fn()}
      onDeleteLead={vi.fn()}
      deletingLeadId={null}
      leadOptions={options}
      onOpenLeadOptions={vi.fn()}
      {...extra}
    />,
  )
}

const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('LeadsSection', () => {
  it('shows 25 leads a page', async () => {
    renderSection(Array.from({ length: 30 }, (_, index) => makeLead(index + 1, null)))

    expect(tableRows()).toHaveLength(25)
    expect(screen.getByText('Showing 1-25 of 30')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(tableRows()).toHaveLength(5)
    expect(screen.getByText('Showing 26-30 of 30')).toBeInTheDocument()
  })

  it('shows the PIC column and filters by PIC', async () => {
    renderSection([makeLead(1, 10), makeLead(2, null)])

    expect(within(screen.getByRole('table')).getByText('Alex')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by PIC' }), 'Alex')
    expect(tableRows()).toHaveLength(1)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by PIC' }),
      'Not assigned',
    )
    expect(tableRows()).toHaveLength(1)
    expect(within(tableRows()[0]).getByText('0100000002')).toBeInTheDocument()
  })

  it('shows 15 leads per board column with a pager, and filters the board by date', async () => {
    const leads = Array.from({ length: 18 }, (_, index) => makeLead(index + 1, null))
    leads[0] = { ...leads[0], addedDate: '2020-01-01' }
    renderSection(leads)

    await userEvent.click(screen.getByRole('button', { name: /Board/ }))
    // The default date range (last month) leaves out the 2020 lead.
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit lead' })).toHaveLength(15)

    await userEvent.click(screen.getByRole('button', { name: 'New: next page' }))
    expect(screen.getAllByRole('button', { name: 'Edit lead' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New: next page' }))
    expect(screen.getAllByRole('button', { name: 'Edit lead' })).toHaveLength(3)
  })

  it('scrolls the board sideways when its background is dragged, but not from a card', async () => {
    renderSection([makeLead(1, null)])
    await userEvent.click(screen.getByRole('button', { name: /Board/ }))
    const board = screen.getByTestId('lead-board')
    board.scrollLeft = 300

    fireEvent.mouseDown(board, { button: 0, clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 300 })
    fireEvent.mouseUp(window)
    expect(board.scrollLeft).toBe(500)

    const card = screen.getByRole('button', { name: 'Edit lead' }).closest('[draggable="true"]')!
    fireEvent.mouseDown(card, { button: 0, clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 100 })
    fireEvent.mouseUp(window)
    expect(board.scrollLeft).toBe(500)
  })

  it('tags the leads that came with form answers, and opens them from the tag', async () => {
    const onOpenFormAnswers = vi.fn()
    renderSection([makeLead(1, null), makeLead(2, null)], {
      leadIdsWithForms: new Set([2]),
      onOpenFormAnswers,
    })

    const tags = within(screen.getByRole('table')).getAllByRole('button', { name: 'View form answers' })
    expect(tags).toHaveLength(1)
    const rowOf = (phone: string) => tableRows().find((row) => within(row).queryByText(phone)) as HTMLElement
    expect(within(rowOf('0100000002')).getByRole('button', { name: 'View form answers' })).toBeInTheDocument()
    expect(within(rowOf('0100000001')).queryByRole('button', { name: 'View form answers' })).not.toBeInTheDocument()

    await userEvent.click(tags[0])
    expect(onOpenFormAnswers).toHaveBeenCalledWith(2)
  })

  it('tags the lead on the board too', async () => {
    const onOpenFormAnswers = vi.fn()
    renderSection([makeLead(1, null), makeLead(2, null)], {
      leadIdsWithForms: new Set([1]),
      onOpenFormAnswers,
    })
    await userEvent.click(screen.getByRole('button', { name: /Board/ }))

    const tags = screen.getAllByRole('button', { name: 'View form answers' })
    expect(tags).toHaveLength(1)
    await userEvent.click(tags[0])
    expect(onOpenFormAnswers).toHaveBeenCalledWith(1)
  })

  it('shows no tag when nothing is passed in', () => {
    renderSection([makeLead(1, null)])

    expect(screen.queryByRole('button', { name: 'View form answers' })).not.toBeInTheDocument()
  })
})

describe('LeadsSection WhatsApp link', () => {
  it('opens a WhatsApp chat with the lead from the phone number', () => {
    renderSection([{ ...makeLead(1, null), phone: '012-345 6789', fullName: 'Mrs Lim' }])

    const link = within(screen.getByRole('table')).getByRole('link', { name: 'WhatsApp Mrs Lim' })
    expect(link).toHaveAttribute('href', 'https://wa.me/60123456789')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('is left out when the lead has no usable phone number', () => {
    renderSection([{ ...makeLead(1, null), phone: null }, { ...makeLead(2, null), phone: '12' }])

    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
  })
})
