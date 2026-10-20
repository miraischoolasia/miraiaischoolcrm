import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

import { StudentFieldsSettings, type StudentFieldsApi } from './StudentFieldsSettings'
import { StudentExtraInputs, StudentExtraSummary, StudentExtrasFilters } from './StudentExtraFields'
import { NO_EXTRAS_FILTER, NO_STUDENT_FIELDS, type StudentFieldsSetting, type StudentKind } from '../lib/studentFields'
import type { Teacher } from '../types/domain'

function makeApi() {
  let kinds: StudentKind[] = [
    { name: '新生', sortOrder: 10, isActive: true },
    { name: '续报', sortOrder: 20, isActive: true },
  ]
  const api: StudentFieldsApi = {
    setFields: vi.fn(async () => null),
    fetchKinds: vi.fn(async () => kinds),
    saveKind: vi.fn(async (current, changes) => {
      if (!current) kinds = [...kinds, { name: changes.name!, sortOrder: 30, isActive: true }]
      else kinds = kinds.map((kind) => (kind.name === current.name ? { ...kind, ...changes } : kind))
      return null
    }),
  }
  return api
}

function Settings({ api, start = NO_STUDENT_FIELDS }: { api: StudentFieldsApi; start?: StudentFieldsSetting }) {
  const [setting, setSetting] = useState(start)
  return <StudentFieldsSettings setting={setting} onSettingChange={setSetting} api={api} />
}

describe('Class Settings > Student fields', () => {
  it('starts with every field off and switches one on', async () => {
    const api = makeApi()
    render(<Settings api={api} />)
    const chinese = screen.getByRole('checkbox', { name: 'Chinese name' })
    expect(chinese).not.toBeChecked()
    await userEvent.click(chinese)
    expect(api.setFields).toHaveBeenCalledWith({ ...NO_STUDENT_FIELDS, name_zh: true })
    expect(chinese).toBeChecked()
  })

  it('lets the school add, rename and hide its kinds of student', async () => {
    const api = makeApi()
    render(<Settings api={api} start={{ ...NO_STUDENT_FIELDS, student_kind: true }} />)
    expect(await screen.findByLabelText('Kind of student 新生')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('New kind of student'), '回流生')
    await userEvent.click(screen.getByRole('button', { name: 'Add kind of student' }))
    expect(await screen.findByLabelText('Kind of student 回流生')).toBeInTheDocument()

    const renew = screen.getByLabelText('Kind of student 续报')
    await userEvent.clear(renew)
    await userEvent.type(renew, 'Renewal')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(api.saveKind).toHaveBeenCalledWith(expect.objectContaining({ name: '续报' }), { name: 'Renewal' })

    await userEvent.click(screen.getByRole('button', { name: 'Hide 新生' }))
    expect(api.saveKind).toHaveBeenCalledWith(expect.objectContaining({ name: '新生' }), { isActive: false })
    expect(await screen.findByRole('button', { name: 'Show 新生' })).toBeInTheDocument()
  })
})

describe('the fields on a student', () => {
  const consultants = [{ id: 2, fullName: 'Crystal', role: 'staff', isActive: true }] as Teacher[]
  const kinds = [
    { name: '新生', sortOrder: 10, isActive: true },
    { name: 'Old', sortOrder: 5, isActive: false },
  ]

  it('shows only the fields the school switched on', () => {
    const onChange = vi.fn()
    render(
      <StudentExtraInputs
        setting={{ ...NO_STUDENT_FIELDS, name_zh: true, consultant: true }}
        form={{ nameZh: '', studentKind: '', consultantId: '', secondParentPhone: '' }}
        kinds={kinds}
        consultants={consultants}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText('Chinese name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kind of student')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Second parent phone')).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Consultant')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Not set', 'Crystal'])
  })

  it('keeps a hidden kind on the student that has it, but does not offer it to others', () => {
    const props = { setting: { ...NO_STUDENT_FIELDS, student_kind: true }, kinds, consultants, onChange: vi.fn() }
    const { rerender } = render(<StudentExtraInputs {...props} form={{ nameZh: '', studentKind: '', consultantId: '', secondParentPhone: '' }} />)
    expect(within(screen.getByLabelText('Kind of student')).queryByText('Old')).not.toBeInTheDocument()
    rerender(<StudentExtraInputs {...props} form={{ nameZh: '', studentKind: 'Old', consultantId: '', secondParentPhone: '' }} />)
    expect(screen.getByLabelText('Kind of student')).toHaveValue('Old')
  })

  it('shows them on the profile, and nothing when the school has them off', () => {
    const extras = { nameZh: '小明', kind: '新生', consultantId: 2, secondParentPhone: '0123456789' }
    const { rerender } = render(<StudentExtraSummary setting={{ ...NO_STUDENT_FIELDS, name_zh: true, consultant: true }} extras={extras} consultantName="Crystal" />)
    expect(screen.getByLabelText('Student fields')).toHaveTextContent('Chinese name:小明Consultant:Crystal')
    rerender(<StudentExtraSummary setting={NO_STUDENT_FIELDS} extras={extras} consultantName="Crystal" />)
    expect(screen.queryByLabelText('Student fields')).not.toBeInTheDocument()
  })

  it('offers list filters for kind and consultant only when shown', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <StudentExtrasFilters setting={NO_STUDENT_FIELDS} filter={NO_EXTRAS_FILTER} kinds={kinds} consultants={consultants} onChange={onChange} />,
    )
    expect(screen.queryByLabelText('Filter by kind of student')).not.toBeInTheDocument()
    rerender(
      <StudentExtrasFilters
        setting={{ ...NO_STUDENT_FIELDS, student_kind: true, consultant: true }}
        filter={NO_EXTRAS_FILTER}
        kinds={kinds}
        consultants={consultants}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Filter by consultant'), 'Crystal')
    expect(onChange).toHaveBeenCalledWith({ kind: '', consultantId: '2' })
  })
})
