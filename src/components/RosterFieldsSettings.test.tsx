import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { RosterFieldsSettings } from './RosterFieldsSettings'
import { StudentExtraInputs, StudentExtraSummary } from './StudentExtraFields'
import { defaultClassCategories, resetClassCategoriesForTests } from '../lib/classCategories'
import { EMPTY_STUDENT_EXTRAS_FORM, NO_STUDENT_FIELDS } from '../lib/studentFields'
import type { FieldOption } from '../lib/studentRoster'
import type { Teacher } from '../types/domain'

beforeAll(() => resetClassCategoriesForTests(defaultClassCategories))

const options: FieldOption[] = [
  { field: 'membership', name: '26001', sortOrder: 10, isActive: true },
  { field: 'membership', name: 'LATEST', sortOrder: 20, isActive: true },
  { field: 'membership', name: 'OLD', sortOrder: 30, isActive: false },
  { field: 'region', name: '西马', sortOrder: 10, isActive: true },
]

function renderSettings(setting = { ...NO_STUDENT_FIELDS, membership: true }, api = {} as Partial<Parameters<typeof RosterFieldsSettings>[0]['api']>) {
  const saveOption = vi.fn().mockResolvedValue(null)
  const saveCounts = vi.fn().mockResolvedValue(null)
  const fetchOptions = vi.fn().mockResolvedValue(options)
  const onOptionsChange = vi.fn()
  const onCountsChange = vi.fn()
  render(
    <RosterFieldsSettings
      setting={setting}
      options={options}
      onOptionsChange={onOptionsChange}
      counts={{ countCategories: [], changesFrom: null }}
      onCountsChange={onCountsChange}
      api={{ saveOption, saveCounts, fetchOptions, ...api }}
    />,
  )
  return { saveOption, saveCounts, fetchOptions, onOptionsChange, onCountsChange }
}

describe('roster fields settings', () => {
  it('shows nothing when no roster field is on', () => {
    const { container } = render(
      <RosterFieldsSettings setting={NO_STUDENT_FIELDS} options={options} onOptionsChange={vi.fn()} counts={{ countCategories: [], changesFrom: null }} onCountsChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the choices of a field that is on, hidden ones last, and adds, renames and hides', async () => {
    const { saveOption, onOptionsChange } = renderSettings()
    expect(screen.getByLabelText('Choice 26001')).toBeInTheDocument()
    expect(screen.queryByLabelText('Choice 西马')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('New choice for Membership'), 'GOLD')
    await userEvent.click(screen.getByRole('button', { name: 'Add choice for Membership' }))
    expect(saveOption).toHaveBeenCalledWith('membership', null, { field: 'membership', name: 'GOLD' })
    expect(onOptionsChange).toHaveBeenCalled()

    const input = screen.getByLabelText('Choice LATEST')
    await userEvent.clear(input)
    await userEvent.type(input, '2026 LATEST')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(saveOption).toHaveBeenCalledWith('membership', expect.objectContaining({ name: 'LATEST' }), { name: '2026 LATEST' })

    await userEvent.click(screen.getByRole('button', { name: 'Hide 26001' }))
    expect(saveOption).toHaveBeenCalledWith('membership', expect.objectContaining({ name: '26001' }), { isActive: false })
  })

  it('shows the reason when a change is refused', async () => {
    renderSettings(undefined, { saveOption: vi.fn().mockResolvedValue('Only admin can change the choices of a student field.') })
    await userEvent.click(screen.getByRole('button', { name: 'Hide 26001' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only admin')
  })

  it('saves which categories count and the date changes are counted from', async () => {
    const { saveCounts, onCountsChange } = renderSettings({ ...NO_STUDENT_FIELDS, roster_table: true })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Regular Class' }))
    await userEvent.type(screen.getByLabelText('Count class changes from'), '2026-10-21')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveCounts).toHaveBeenCalledWith({ countCategories: ['Regular Class'], changesFrom: '2026-10-21' })
    expect(onCountsChange).toHaveBeenCalled()
  })
})

describe('roster fields in the student form and profile', () => {
  const staff = [{ id: 7, fullName: 'Sales Sam' }] as Teacher[]
  const setting = { ...NO_STUDENT_FIELDS, sales_person: true, consultant: true, membership: true, fb_name: true, fee_month: true }

  it('offers the sales person, the choices (a hidden one only on a student that has it), the Facebook name and the month', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <StudentExtraInputs setting={setting} form={EMPTY_STUDENT_EXTRAS_FORM} kinds={[]} consultants={staff} options={options} onChange={onChange} />,
    )
    expect(screen.getByText('Learning Consultant')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'LATEST' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'OLD' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Sales person (Education Consultant)'), 'Sales Sam')
    expect(onChange).toHaveBeenCalledWith('salesPersonId', '7')
    await userEvent.selectOptions(screen.getByLabelText('Fee payment month'), '7')
    expect(onChange).toHaveBeenCalledWith('feeMonth', '7')
    await userEvent.type(screen.getByLabelText('Facebook name'), 'M')
    expect(onChange).toHaveBeenCalledWith('fbName', 'M')

    rerender(<StudentExtraInputs setting={setting} form={{ ...EMPTY_STUDENT_EXTRAS_FORM, membership: 'OLD' }} kinds={[]} consultants={staff} options={options} onChange={onChange} />)
    expect(screen.getByRole('option', { name: 'OLD' })).toBeInTheDocument()
  })

  it('offers teachers as the Sales person, but only staff as the Learning Consultant', () => {
    const teacher = { id: 9, fullName: 'Mr Jack', role: 'teacher' } as Teacher
    render(
      <StudentExtraInputs setting={setting} form={EMPTY_STUDENT_EXTRAS_FORM} kinds={[]} consultants={staff} salesPeople={[...staff, teacher]} options={options} onChange={vi.fn()} />,
    )
    const sales = screen.getByLabelText('Sales person (Education Consultant)')
    expect(within(sales).getByRole('option', { name: 'Mr Jack' })).toBeInTheDocument()
    const consultant = screen.getByLabelText('Learning Consultant')
    expect(within(consultant).queryByRole('option', { name: 'Mr Jack' })).not.toBeInTheDocument()
  })

  it('lists the roster values on the profile', async () => {
    render(
      <StudentExtraSummary
        setting={setting}
        extras={{ nameZh: null, kind: null, consultantId: 8, secondParentPhone: null, salesPersonId: 7, membership: '26001', fbName: 'Mum', feeMonth: 7 }}
        consultantName="Lee"
        salesPersonName="Sam"
      />,
    )
    // The one-line summary: Learning Consultant, Membership, how they pay (not set: a dash), fee month.
    expect(screen.getByText('Lee')).toBeInTheDocument()
    expect(screen.getByText('26001')).toBeInTheDocument()
    expect(screen.getByText('Jul')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /All details/ }))
    const list = screen.getByLabelText('Student fields')
    expect(list).toHaveTextContent('Learning ConsultantLee')
    expect(list).toHaveTextContent('Sales personSam')
    expect(list).toHaveTextContent('Membership26001')
    expect(list).toHaveTextContent('Facebook nameMum')
    expect(list).toHaveTextContent('Fee payment monthJul')
  })
})
