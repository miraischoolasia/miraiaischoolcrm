import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadsSection } from './LeadsSection'

const downloads: { filename: string; content: string }[] = []
vi.mock('../../lib/downloadFile', () => ({
  downloadCsv: (filename: string, content: string) => downloads.push({ filename, content }),
}))
import { getTodayString } from '../../domain/studentStatus'
import type { Lead, LeadCheckSlot, LeadOption } from '../../types/domain'

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Walk-in', isActive: true, legacyKey: 'walk_in', color: null },
  { id: 10, kind: 'pic', label: 'Alex', isActive: true, legacyKey: null, color: null },
]

function makeLead(id: number, picId: number | null): Lead {
  return {
    id,
    fullName: `Parent ${id}`,
    phone: `01${String(id).padStart(8, '0')}`,
    sourceId: 1,
    picId,
    tagIds: [],
    checks: {},
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
  extra: Partial<React.ComponentProps<typeof LeadsSection>> = {},
  leadOptions: LeadOption[] = options,
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
      leadOptions={leadOptions}
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

  it('opens the form answers by clicking the source name, with no separate Form button', async () => {
    const onOpenFormAnswers = vi.fn()
    renderSection([makeLead(1, null), makeLead(2, null)], {
      leadIdsWithForms: new Set([2]),
      onOpenFormAnswers,
    })

    const table = within(screen.getByRole('table'))
    expect(table.queryByRole('button', { name: 'View form answers' })).not.toBeInTheDocument()
    expect(table.queryByText('Form', { selector: 'button' })).not.toBeInTheDocument()
    const links = table.getAllByRole('button', { name: /View form answers: Walk-in/ })
    expect(links).toHaveLength(1)
    const rowOf = (phone: string) => tableRows().find((row) => within(row).queryByText(phone)) as HTMLElement
    expect(within(rowOf('0100000002')).getByRole('button', { name: /View form answers/ })).toHaveTextContent('Walk-in')
    // A lead without form answers has the source as plain text.
    expect(within(rowOf('0100000001')).queryByRole('button', { name: /View form answers/ })).not.toBeInTheDocument()
    expect(within(rowOf('0100000001')).getByText('Walk-in')).toBeInTheDocument()

    await userEvent.click(links[0])
    expect(onOpenFormAnswers).toHaveBeenCalledWith(2)
  })

  it('keeps the source on one line, small, with the whole name as a tooltip', () => {
    const long = 'Form: EduHero X Mirai AI School AI课程'
    renderSection(
      [{ ...makeLead(1, null), sourceId: 55 }],
      { leadIdsWithForms: new Set([1]), onOpenFormAnswers: vi.fn() },
      [...options, { id: 55, kind: 'source', label: long, isActive: true, legacyKey: null, color: null }],
    )

    const link = within(tableRows()[0]).getByRole('button', { name: /View form answers/ })
    expect(link).toHaveTextContent(long)
    // Cut to one line with an ellipsis, in the small size, inside a cell the
    // admin table does not restyle.
    expect(link.className).toContain('table-cell-link')
    expect(link.firstElementChild?.className).toContain('truncate')
    expect(link.firstElementChild?.className).toContain('whitespace-nowrap')
    expect(link.parentElement?.className).toContain('text-[11px]')
    expect(link).toHaveAttribute('title', expect.stringContaining(long))
  })

  it('opens the lead when its row is clicked, with no Edit button in the list', async () => {
    const onEditLead = vi.fn()
    renderSection([{ ...makeLead(1, null), fullName: 'Mrs Lim' }, makeLead(2, null)], { onEditLead })

    const table = within(screen.getByRole('table'))
    expect(table.queryByRole('button', { name: /edit|view lead/i })).not.toBeInTheDocument()

    await userEvent.click(within(tableRows()[0]).getByText('Mrs Lim'))
    expect(onEditLead).toHaveBeenLastCalledWith(1)

    // Any other part of the row works too.
    await userEvent.click(within(tableRows()[1]).getByText('Walk-in'))
    expect(onEditLead).toHaveBeenLastCalledWith(2)
  })

  it('opens the lead from the keyboard too', async () => {
    const onEditLead = vi.fn()
    renderSection([{ ...makeLead(1, null), fullName: 'Mrs Lim' }], { onEditLead })

    const row = screen.getByRole('row', { name: 'Edit Mrs Lim' })
    row.focus()
    await userEvent.keyboard('{Enter}')

    expect(onEditLead).toHaveBeenCalledWith(1)
  })

  it('does not open the lead when a tick, the stage, WhatsApp or the source is used', async () => {
    const onEditLead = vi.fn()
    const onToggleCheck = vi.fn()
    const onChangeStatus = vi.fn()
    const onOpenFormAnswers = vi.fn()
    renderSection(
      [{ ...makeLead(1, null), fullName: 'Mrs Lim', phone: '60123456789' }],
      { onEditLead, onToggleCheck, onChangeStatus, leadIdsWithForms: new Set([1]), onOpenFormAnswers },
      allOptions,
    )
    const row = within(tableRows()[0])

    await userEvent.click(row.getByRole('checkbox', { name: /RM99 pack/ }))
    await userEvent.selectOptions(row.getByRole('combobox', { name: '' }), 'contacted')
    await userEvent.click(row.getByRole('button', { name: /View form answers/ }))

    expect(onToggleCheck).toHaveBeenCalledTimes(1)
    expect(onChangeStatus).toHaveBeenCalledTimes(1)
    expect(onOpenFormAnswers).toHaveBeenCalledWith(1)
    expect(onEditLead).not.toHaveBeenCalled()
  })

  it('opens a lead to view only for an account that cannot edit', async () => {
    const onEditLead = vi.fn()
    renderSection([{ ...makeLead(1, null), fullName: 'Mrs Lim' }], { canEdit: false, onEditLead })

    await userEvent.click(screen.getByRole('row', { name: 'View Mrs Lim' }))

    expect(onEditLead).toHaveBeenCalledWith(1)
  })

  it('has no Action column when the account cannot delete', () => {
    renderSection([makeLead(1, null)], { canDelete: false })

    expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByRole('button', { name: 'Delete lead' })).not.toBeInTheDocument()
  })

  it('shows each child on its own line, the tags after them', () => {
    renderSection(
      [
        {
          ...makeLead(1, null),
          children: [
            { name: 'Goh Xuan Zheng', age: 15, phone: null },
            { name: 'Goh Xuan En', age: 13, phone: null },
            { name: '', age: 9, phone: null },
          ],
          tagIds: [201],
        },
      ],
      {},
      allOptions,
    )

    const cell = within(tableRows()[0]).getByText('Goh Xuan Zheng (15)').closest('td') as HTMLElement
    const lines = within(cell).getAllByRole('listitem').map((item) => item.textContent)
    expect(lines).toEqual(['Goh Xuan Zheng (15)', 'Goh Xuan En (13)', '9 yrs'])
    expect(within(cell).getByText('Hot')).toBeInTheDocument()
  })

  it('shows a dash for a lead without children', () => {
    renderSection([makeLead(1, null)])

    const cells = within(tableRows()[0]).getAllByRole('cell')
    expect(cells[3]).toHaveTextContent('-')
  })

  it('writes the date as day and month with the year smaller underneath', () => {
    renderSection([{ ...makeLead(1, null), addedDate: '2026-10-06' }])

    const date = within(tableRows()[0]).getAllByRole('cell')[1]
    const [dayMonth, year] = Array.from(date.children)
    expect(dayMonth).toHaveTextContent('Oct 6')
    expect(year).toHaveTextContent('2026')
    expect(date).not.toHaveTextContent('Oct 6, 2026')
    // The year is the smaller of the two.
    expect(dayMonth.className).toContain('text-sm')
    expect(year.className).toContain('text-[11px]')
  })

  it('keeps the PIC name on one line', () => {
    renderSection([makeLead(1, 10)])

    const pic = within(tableRows()[0]).getByText('Alex').closest('td') as HTMLElement
    expect(pic.className).toContain('whitespace-nowrap')
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

const checkOptions: LeadOption[] = [
  { id: 101, kind: 'check', label: 'RM99 pack', isActive: true, legacyKey: 'check_1', color: null },
  { id: 102, kind: 'check', label: 'Joined event', isActive: true, legacyKey: 'check_2', color: null },
  { id: 103, kind: 'check', label: 'Paid deposit', isActive: true, legacyKey: 'check_3', color: null },
]
const tagOptions: LeadOption[] = [
  { id: 201, kind: 'tag', label: 'Hot', isActive: true, legacyKey: null, color: '#ef4444' },
  { id: 202, kind: 'tag', label: 'VIP', isActive: true, legacyKey: null, color: '#8b5cf6' },
]
const allOptions = [...options, ...checkOptions, ...tagOptions]

const header = (name: RegExp | string) =>
  within(screen.getByRole('table')).getByRole('columnheader', { name })

describe('LeadsSection list columns', () => {
  it('has no Follow Up, Convert, Source or follow-up count in the list', () => {
    renderSection([{ ...makeLead(1, null), fullName: 'Mrs Lim' }], {}, allOptions)

    const table = within(screen.getByRole('table'))
    expect(table.queryByRole('button', { name: /follow up/i })).not.toBeInTheDocument()
    expect(table.queryByRole('button', { name: /Convert/ })).not.toBeInTheDocument()
    expect(table.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument()
    expect(table.queryByRole('columnheader', { name: 'Follow-up' })).not.toBeInTheDocument()
    expect(screen.queryByText('0/7')).not.toBeInTheDocument()
    // The phone cards on a small screen lose them too.
    expect(screen.queryByRole('button', { name: /follow up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Convert/ })).not.toBeInTheDocument()
    // Delete stays; the lead opens by clicking its row.
    expect(table.getByRole('button', { name: 'Delete lead' })).toBeInTheDocument()
  })

  it('still has Follow up on the board, where a card dragged to Converted converts it', async () => {
    const onOpenFollowUp = vi.fn()
    renderSection([makeLead(1, null)], { onOpenFollowUp }, allOptions)

    await userEvent.click(screen.getByRole('button', { name: /Board/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Follow up' }))

    expect(onOpenFollowUp).toHaveBeenCalledWith(1)
  })

  it('puts the source under the contact name and phone', () => {
    renderSection(
      [{ ...makeLead(1, null), fullName: 'Mrs Lim', phone: '60123456789' }],
      {},
      allOptions,
    )

    const contact = within(tableRows()[0]).getByText('Mrs Lim').closest('td') as HTMLElement
    expect(within(contact).getByText('60123456789')).toBeInTheDocument()
    const lines = Array.from(contact.children).map((child) => child.textContent)
    expect(lines[0]).toBe('Mrs Lim')
    expect(lines.at(-1)).toContain('Walk-in')
  })
})

describe('LeadsSection tick columns', () => {
  const ticked = (slots: LeadCheckSlot[]) =>
    Object.fromEntries(slots.map((slot) => [slot, { at: '2026-10-05T03:00:00Z', by: 7 }]))

  it('shows the three columns with the names the admin chose', () => {
    renderSection([makeLead(1, null)], {}, allOptions)

    expect(header(/RM99 pack/)).toBeInTheDocument()
    expect(header(/Joined event/)).toBeInTheDocument()
    expect(header(/Paid deposit/)).toBeInTheDocument()
  })

  it('shows no tick columns before the database has them', () => {
    renderSection([makeLead(1, null)])

    expect(screen.queryByRole('checkbox', { name: / for / })).not.toBeInTheDocument()
  })

  it('shows which boxes are ticked, and says who ticked and when', () => {
    renderSection(
      [{ ...makeLead(1, null), fullName: 'Mrs Lim', checks: ticked([1, 3]) }],
      { teacherNames: new Map([[7, 'Alex']]) },
      allOptions,
    )

    const row = within(tableRows()[0])
    const first = row.getByRole('checkbox', { name: 'RM99 pack for Mrs Lim' })
    expect(first).toBeChecked()
    expect(first).toHaveAttribute('title', expect.stringMatching(/Ticked by Alex on /))
    expect(row.getByRole('checkbox', { name: 'Joined event for Mrs Lim' })).not.toBeChecked()
    expect(row.getByRole('checkbox', { name: 'Paid deposit for Mrs Lim' })).toBeChecked()
  })

  it('ticks and unticks a box', async () => {
    const onToggleCheck = vi.fn()
    renderSection(
      [{ ...makeLead(1, null), fullName: 'Mrs Lim', checks: ticked([2]) }],
      { onToggleCheck },
      allOptions,
    )
    const row = within(tableRows()[0])

    await userEvent.click(row.getByRole('checkbox', { name: 'RM99 pack for Mrs Lim' }))
    expect(onToggleCheck).toHaveBeenLastCalledWith(1, 1, true)

    await userEvent.click(row.getByRole('checkbox', { name: 'Joined event for Mrs Lim' }))
    expect(onToggleCheck).toHaveBeenLastCalledWith(1, 2, false)
  })

  it('cannot be changed without edit access', () => {
    renderSection([makeLead(1, null)], { canEdit: false, onToggleCheck: vi.fn() }, allOptions)

    const ticks = within(tableRows()[0]).getAllByRole('checkbox', { name: / for / })
    expect(ticks).toHaveLength(3)
    ticks.forEach((box) => expect(box).toBeDisabled())
  })

  it('filters by ticked, not ticked or all, one column at a time', async () => {
    renderSection(
      [
        { ...makeLead(1, null), fullName: 'Mrs Lim', checks: ticked([1]) },
        { ...makeLead(2, null), fullName: 'Mr Tan', checks: ticked([1, 2]) },
        { ...makeLead(3, null), fullName: 'Ms Goh', checks: {} },
      ],
      {},
      allOptions,
    )
    expect(tableRows()).toHaveLength(3)

    await userEvent.selectOptions(screen.getByLabelText('Filter RM99 pack'), 'on')
    expect(tableRows()).toHaveLength(2)

    await userEvent.selectOptions(screen.getByLabelText('Filter Joined event'), 'off')
    expect(tableRows()).toHaveLength(1)
    expect(within(tableRows()[0]).getByText('Mrs Lim')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter RM99 pack'), 'all')
    await userEvent.selectOptions(screen.getByLabelText('Filter Joined event'), 'all')
    expect(tableRows()).toHaveLength(3)

    await userEvent.selectOptions(screen.getByLabelText('Filter Paid deposit'), 'off')
    expect(tableRows()).toHaveLength(3)
    await userEvent.selectOptions(screen.getByLabelText('Filter Paid deposit'), 'on')
    expect(screen.getByText('No leads match this search or stage.')).toBeInTheDocument()
  })
})

describe('LeadsSection tags', () => {
  it('shows the tags of a lead under its children', () => {
    renderSection(
      [
        {
          ...makeLead(1, null),
          children: [{ name: 'Ken', age: 9, phone: null }],
          tagIds: [201, 202],
        },
      ],
      {},
      allOptions,
    )

    const children = within(tableRows()[0]).getByText(/Ken \(9\)/).closest('td') as HTMLElement
    expect(within(children).getByText('Hot')).toBeInTheDocument()
    expect(within(children).getByText('VIP')).toBeInTheDocument()
    // The names come first, the tags after them.
    expect(children.firstChild?.textContent).toContain('Ken (9)')
  })

  it('shows nothing extra for a tag that no longer exists', () => {
    renderSection([{ ...makeLead(1, null), tagIds: [999] }], {}, allOptions)

    expect(within(tableRows()[0]).queryByText('Hot')).not.toBeInTheDocument()
  })

  it('filters by tag, or by no tag', async () => {
    renderSection(
      [
        { ...makeLead(1, null), fullName: 'Mrs Lim', tagIds: [201] },
        { ...makeLead(2, null), fullName: 'Mr Tan', tagIds: [202] },
        { ...makeLead(3, null), fullName: 'Ms Goh', tagIds: [] },
      ],
      {},
      allOptions,
    )

    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'Hot')
    expect(tableRows()).toHaveLength(1)
    expect(within(tableRows()[0]).getByText('Mrs Lim')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'No tag')
    expect(tableRows()).toHaveLength(1)
    expect(within(tableRows()[0]).getByText('Ms Goh')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), 'All tags')
    expect(tableRows()).toHaveLength(3)
  })

  it('has no tag filter until a tag exists', () => {
    renderSection([makeLead(1, null)])

    expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument()
  })
})

describe('LeadsSection bulk selection', () => {
  const many = (count: number) => Array.from({ length: count }, (_, index) => makeLead(index + 1, null))
  const rowBox = (row: HTMLElement) => within(row).getByRole('checkbox', { name: /^Select / })
  const pageBox = () => screen.getByRole('checkbox', { name: 'Select all leads on this page' })

  it('has no bulk bar until a lead is ticked, then says how many are selected', async () => {
    renderSection(many(3), { onBulkAction: vi.fn() })
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()

    await userEvent.click(rowBox(tableRows()[0]))
    await userEvent.click(rowBox(tableRows()[2]))

    const bar = within(screen.getByRole('region', { name: 'Bulk actions' }))
    expect(bar.getByText('2 leads selected')).toBeInTheDocument()

    await userEvent.click(rowBox(tableRows()[0]))
    expect(bar.getByText('1 lead selected')).toBeInTheDocument()

    await userEvent.click(rowBox(tableRows()[2]))
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('ticking a lead does not open it', async () => {
    const onEditLead = vi.fn()
    renderSection(many(2), { onEditLead, onBulkAction: vi.fn() })

    await userEvent.click(rowBox(tableRows()[0]))

    expect(onEditLead).not.toHaveBeenCalled()
  })

  it('selects the whole page from the title row, and unselects it again', async () => {
    renderSection(many(30), { onBulkAction: vi.fn() })

    await userEvent.click(pageBox())
    expect(within(screen.getByRole('region', { name: 'Bulk actions' })).getByText('25 leads selected')).toBeInTheDocument()
    tableRows().forEach((row) => expect(rowBox(row)).toBeChecked())
    expect(pageBox()).toBeChecked()

    await userEvent.click(pageBox())
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('shows the title-row box as half ticked when only some of the page is', async () => {
    renderSection(many(3), { onBulkAction: vi.fn() })

    await userEvent.click(rowBox(tableRows()[0]))

    expect(pageBox()).not.toBeChecked()
    expect((pageBox() as HTMLInputElement).indeterminate).toBe(true)
  })

  it('offers every lead that matches the filters, across the pages', async () => {
    renderSection(many(30), { onBulkAction: vi.fn() })
    await userEvent.click(pageBox())

    await userEvent.click(screen.getByRole('button', { name: 'Select all 30 leads that match the filters' }))

    const bar = within(screen.getByRole('region', { name: 'Bulk actions' }))
    expect(bar.getByText('30 leads selected')).toBeInTheDocument()
    expect(bar.getByText('That is every lead that matches the filters.')).toBeInTheDocument()
    expect(bar.queryByRole('button', { name: /Select all/ })).not.toBeInTheDocument()

    // The next page shows its leads ticked as well.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    tableRows().forEach((row) => expect(rowBox(row)).toBeChecked())
  })

  it('keeps the selection when going to another page', async () => {
    renderSection(many(30), { onBulkAction: vi.fn() })
    await userEvent.click(rowBox(tableRows()[0]))

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(screen.getByRole('region', { name: 'Bulk actions' })).getByText('1 lead selected')).toBeInTheDocument()
    expect(pageBox()).not.toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(rowBox(tableRows()[0])).toBeChecked()
  })

  it('drops the selection when a filter changes, so nothing out of sight is touched', async () => {
    renderSection([makeLead(1, 10), makeLead(2, null)], { onBulkAction: vi.fn() })
    await userEvent.click(pageBox())
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by PIC' }), 'Alex')

    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
    expect(rowBox(tableRows()[0])).not.toBeChecked()
  })

  it('clears the selection on request', async () => {
    renderSection(many(3), { onBulkAction: vi.fn() })
    await userEvent.click(pageBox())

    await userEvent.click(screen.getByRole('button', { name: /Clear selection/ }))

    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })
})

describe('LeadsSection bulk actions', () => {
  const picAndTag: LeadOption[] = [...allOptions, { id: 11, kind: 'pic', label: 'Mei', isActive: true, legacyKey: null, color: null }, { id: 12, kind: 'pic', label: 'Old PIC', isActive: false, legacyKey: null, color: null }]
  const leadsList = [
    { ...makeLead(1, null), fullName: 'Mrs Lim' },
    { ...makeLead(2, null), fullName: 'Mr Tan' },
    { ...makeLead(3, null), fullName: 'Ms Goh' },
  ]

  async function select(names: string[]) {
    for (const name of names) {
      await userEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }))
    }
    return within(screen.getByRole('region', { name: 'Bulk actions' }))
  }

  it('sends the chosen action with the ticked leads', async () => {
    // Not going through, so the selection stays for the second choice.
    const onBulkAction = vi.fn().mockResolvedValue(false)
    renderSection(leadsList, { onBulkAction }, picAndTag)
    const bar = await select(['Mrs Lim', 'Ms Goh'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'contacted')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'stage', status: 'contacted' }, [1, 3])

    await userEvent.selectOptions(bar.getByLabelText('Set PIC'), 'Mei')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'pic', picId: 11 }, [1, 3])
  })

  it('can clear the PIC, change the source and add or remove a tag', async () => {
    const onBulkAction = vi.fn().mockResolvedValue(false)
    renderSection(leadsList, { onBulkAction }, picAndTag)
    const bar = await select(['Mr Tan'])

    await userEvent.selectOptions(bar.getByLabelText('Set PIC'), 'Not assigned')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'pic', picId: null }, [2])

    await userEvent.selectOptions(bar.getByLabelText('Set source'), 'Walk-in')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'source', sourceId: 1 }, [2])

    await userEvent.selectOptions(bar.getByLabelText('Add tag'), 'Hot')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'tag-add', tagId: 201 }, [2])

    await userEvent.selectOptions(bar.getByLabelText('Remove tag'), 'VIP')
    expect(onBulkAction).toHaveBeenLastCalledWith({ type: 'tag-remove', tagId: 202 }, [2])
  })

  it('never offers Converted, hidden names, or a tag list when there are no tags', async () => {
    renderSection(leadsList, { onBulkAction: vi.fn() }, picAndTag)
    const bar = await select(['Mrs Lim'])

    const stages = within(bar.getByLabelText('Change stage')).getAllByRole('option').map((option) => option.textContent)
    expect(stages).not.toContain('Converted')
    expect(stages).toContain('Contacted')
    const pics = within(bar.getByLabelText('Set PIC')).getAllByRole('option').map((option) => option.textContent)
    expect(pics).toEqual(['Set PIC...', 'Not assigned', 'Alex', 'Mei'])
  })

  it('has no tag lists without tags', async () => {
    renderSection(leadsList, { onBulkAction: vi.fn() }, options)
    const bar = await select(['Mrs Lim'])

    expect(bar.queryByLabelText('Add tag')).not.toBeInTheDocument()
    expect(bar.queryByLabelText('Remove tag')).not.toBeInTheDocument()
  })

  it('goes back to its title after a choice, ready for another', async () => {
    renderSection(leadsList, { onBulkAction: vi.fn().mockResolvedValue(false) }, picAndTag)
    const bar = await select(['Mrs Lim'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'lost')

    expect(bar.getByLabelText('Change stage')).toHaveValue('')
  })

  it('clears the selection once an action went through, and keeps it when it did not', async () => {
    const onBulkAction = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    renderSection(leadsList, { onBulkAction }, picAndTag)
    const bar = await select(['Mrs Lim'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'lost')
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'lost')
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument(),
    )
  })

  it('has Delete only for an account that may delete', async () => {
    const onBulkAction = vi.fn().mockResolvedValue(false)
    const { unmount } = render(
      <LeadsSection
        isLoading={false}
        leads={leadsList}
        onChangeStatus={vi.fn()}
        onConvertLead={vi.fn()}
        onEditLead={vi.fn()}
        onOpenCreateLead={vi.fn()}
        onOpenBulkImportLeads={vi.fn()}
        onOpenFollowUp={vi.fn()}
        onDeleteLead={vi.fn()}
        deletingLeadId={null}
        leadOptions={picAndTag}
        onOpenLeadOptions={vi.fn()}
        onBulkAction={onBulkAction}
      />,
    )
    let bar = await select(['Mrs Lim', 'Mr Tan'])
    await userEvent.click(bar.getByRole('button', { name: 'Delete' }))
    expect(onBulkAction).toHaveBeenCalledWith({ type: 'delete' }, [1, 2])
    unmount()

    renderSection(leadsList, { canDelete: false, onBulkAction }, picAndTag)
    bar = await select(['Mrs Lim'])
    expect(bar.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('offers only Export to an account that cannot edit', async () => {
    renderSection(leadsList, { canEdit: false, canDelete: false, onBulkAction: vi.fn() }, picAndTag)
    const bar = await select(['Mrs Lim'])

    expect(bar.queryByLabelText('Change stage')).not.toBeInTheDocument()
    expect(bar.queryByLabelText('Set PIC')).not.toBeInTheDocument()
    expect(bar.queryByLabelText('Set source')).not.toBeInTheDocument()
    expect(bar.queryByLabelText('Add tag')).not.toBeInTheDocument()
    expect(bar.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument()
  })

  it('exports the ticked leads, and only them, as a file', async () => {
    downloads.length = 0
    renderSection(
      [
        { ...leadsList[0], children: [{ name: 'Ken', age: 9, phone: null }], tagIds: [201] },
        leadsList[1],
        leadsList[2],
      ],
      { onBulkAction: vi.fn() },
      picAndTag,
    )
    const bar = await select(['Mrs Lim', 'Ms Goh'])

    await userEvent.click(bar.getByRole('button', { name: /Export CSV/ }))

    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(downloads[0].content).toContain('Mrs Lim')
    expect(downloads[0].content).toContain('Ms Goh')
    expect(downloads[0].content).not.toContain('Mr Tan')
    expect(downloads[0].content).toContain('Ken (9)')
    expect(downloads[0].content).toContain('Hot')
  })

  it('has no selection boxes or bulk bar on the phone cards, which keep one lead at a time', () => {
    renderSection(leadsList, { onBulkAction: vi.fn() })

    const cards = screen.getAllByRole('listitem').filter((item) => item.className.includes('space-y-3'))
    cards.forEach((card) => expect(within(card).queryByRole('checkbox', { name: /^Select / })).not.toBeInTheDocument())
  })
})
