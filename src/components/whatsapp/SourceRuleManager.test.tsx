import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { LeadOption } from '../../types/domain'
import type { SourceRule } from '../../lib/sourceRules'
import { SourceRuleManager } from './SourceRuleManager'

const option = (id: number, kind: LeadOption['kind'], label: string): LeadOption => ({
  id,
  kind,
  label,
  isActive: true,
  legacyKey: null,
  color: null,
})

const options = [option(1, 'source', 'Facebook'), option(2, 'tag', 'Free HOA')]
const existing: SourceRule = { id: 3, phrase: 'saw your ad', sourceId: 1, tagIds: [2], isActive: true }

function setup(extra: Partial<ComponentProps<typeof SourceRuleManager>> = {}) {
  const onSave = vi.fn().mockResolvedValue(null)
  const onRemove = vi.fn().mockResolvedValue(null)
  render(
    <SourceRuleManager
      rules={[existing]}
      isLoading={false}
      loadError={null}
      leadOptions={options}
      onClose={vi.fn()}
      onSave={onSave}
      onRemove={onRemove}
      onAddOption={vi.fn()}
      {...extra}
    />,
  )
  return { onSave, onRemove }
}

describe('SourceRuleManager', () => {
  it('lists each rule with its source and tags', () => {
    setup()

    expect(screen.getByText('"saw your ad"')).toBeInTheDocument()
    expect(screen.getByText('Source: Facebook')).toBeInTheDocument()
    expect(screen.getByText('Free HOA')).toBeInTheDocument()
  })

  it('opens on a new rule with the first message filled in', () => {
    setup({ initialPhrase: 'Hi, I saw your Facebook ad' })

    expect(screen.getByLabelText(/When the first message contains/)).toHaveValue('Hi, I saw your Facebook ad')
  })

  it('will not save a rule that does nothing', async () => {
    const { onSave } = setup({ initialPhrase: 'some words' })

    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a source, a tag, or both')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the phrase with the chosen source', async () => {
    const { onSave } = setup({ initialPhrase: 'some words' })

    await userEvent.selectOptions(screen.getByLabelText(/Set the source to/), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, { phrase: 'some words', sourceId: 1, tagIds: [], isActive: true }),
    )
  })

  it('shows why a save failed and keeps the form', async () => {
    const { onSave } = setup({ initialPhrase: 'some words' })
    onSave.mockResolvedValue('A rule with that phrase already exists.')

    await userEvent.selectOptions(screen.getByLabelText(/Set the source to/), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByLabelText(/When the first message contains/)).toHaveValue('some words')
  })

  it('deletes only after the person confirms', async () => {
    const { onRemove } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Delete rule saw your ad' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(existing))
  })
})
