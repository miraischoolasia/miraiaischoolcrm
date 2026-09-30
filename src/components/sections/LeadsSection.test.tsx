import { render, screen, within } from '@testing-library/react'
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

function renderSection(leads: Lead[]) {
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
})
