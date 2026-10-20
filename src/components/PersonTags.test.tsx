import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PersonTags } from './PersonTags'
import type { LeadOption } from '../types/domain'

const tag = (id: number, label: string): LeadOption => ({ id, kind: 'tag', label, isActive: true, legacyKey: null, color: '#dc2626' })
const tags = [tag(1, 'Crystal'), tag(2, 'Violet')]

describe('PersonTags', () => {
  it('lets someone who may edit add a tag from the school\'s list', async () => {
    const onChange = vi.fn()
    render(<PersonTags tags={tags} selectedIds={[1]} canEdit onChange={onChange} onCreate={vi.fn()} />)

    expect(screen.getByText('Crystal')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), 'Violet')
    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('only shows the tags to someone who may not edit', () => {
    render(<PersonTags tags={tags} selectedIds={[2]} canEdit={false} onChange={vi.fn()} onCreate={vi.fn()} />)

    expect(screen.getByText('Violet')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a tag')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says so when there are none', () => {
    render(<PersonTags tags={tags} selectedIds={[]} canEdit={false} onChange={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByText('No tags.')).toBeInTheDocument()
  })
})
