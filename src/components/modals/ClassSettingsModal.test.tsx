import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClassSettingsModal } from './ClassSettingsModal'
import { defaultReviewCriteria } from '../../lib/reviewCriteria'
import { defaultZoomMeetingOptions } from '../../lib/api'
import type { ReviewCriterion } from '../../types/domain'

const teamwork: ReviewCriterion = {
  id: 6,
  name: 'Teamwork',
  description: null,
  maxScore: 3,
  remarkRequiredAtOrBelow: 1,
  sortOrder: 60,
  isActive: false,
  legacyKey: null,
}

function renderModal(overrides: Partial<Parameters<typeof ClassSettingsModal>[0]> = {}) {
  const props = {
    criteria: [...defaultReviewCriteria, teamwork],
    zoomOptions: defaultZoomMeetingOptions,
    onClose: vi.fn(),
    onAddCriterion: vi.fn(async () => null),
    onSaveCriterion: vi.fn(async () => null),
    onSetCriterionActive: vi.fn(async () => null),
    onMoveCriterion: vi.fn(async () => null),
    onSaveZoomOptions: vi.fn(async () => null),
    ...overrides,
  }
  render(<ClassSettingsModal {...props} />)
  return props
}

describe('ClassSettingsModal', () => {
  it('lists the shown criteria in order and the hidden ones apart', () => {
    renderModal()

    const names = screen.getAllByRole('textbox', { name: / name$/ }).map((input) => (input as HTMLInputElement).value)
    expect(names).toEqual([
      'Logical & Algorithmic Thinking',
      'Coding Creativity',
      'Problem Solving',
      'Expressiveness',
      'Sustained Focus',
      '',
    ])
    expect(screen.getByText('Teamwork · top score 3')).toBeInTheDocument()
  })

  it('keeps the top score of the five starting criteria', () => {
    renderModal()

    expect(screen.getByRole('spinbutton', { name: 'Coding Creativity top score' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'New criterion top score' })).toBeEnabled()
  })

  it('adds a criterion with its own scale', async () => {
    const props = renderModal()

    await userEvent.type(screen.getByRole('textbox', { name: 'New criterion name' }), '  Presentation ')
    const top = screen.getByRole('spinbutton', { name: 'New criterion top score' })
    await userEvent.clear(top)
    await userEvent.type(top, '4')
    await userEvent.click(screen.getByRole('button', { name: 'Add criterion' }))

    expect(props.onAddCriterion).toHaveBeenCalledWith({
      name: 'Presentation',
      description: null,
      maxScore: 4,
      remarkRequiredAtOrBelow: 2,
    })
  })

  it('will not add a remark threshold at or above the top score', async () => {
    renderModal()

    await userEvent.type(screen.getByRole('textbox', { name: 'New criterion name' }), 'Presentation')
    const remark = screen.getByRole('spinbutton', { name: 'New criterion remark at or below' })
    await userEvent.clear(remark)
    await userEvent.type(remark, '5')

    expect(screen.getByRole('button', { name: 'Add criterion' })).toBeDisabled()
  })

  it('hides, shows and reorders, and shows a refused change', async () => {
    const props = renderModal({
      onSetCriterionActive: vi.fn(async () => 'Only admin can change review criteria.'),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Hide Problem Solving' }))
    expect(props.onSetCriterionActive).toHaveBeenCalledWith(defaultReviewCriteria[2], false)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only admin can change review criteria.')

    await userEvent.click(screen.getByRole('button', { name: 'Show Teamwork' }))
    expect(props.onSetCriterionActive).toHaveBeenCalledWith(teamwork, true)

    expect(screen.getByRole('button', { name: 'Move Logical & Algorithmic Thinking up' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Coding Creativity up' }))
    expect(props.onMoveCriterion).toHaveBeenCalledWith(defaultReviewCriteria[1], -1)
  })

  it('saves the Zoom settings', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('tab', { name: 'Zoom' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Waiting room/ }))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Save Zoom settings' }))

    expect(props.onSaveZoomOptions).toHaveBeenCalledWith({
      mute_upon_entry: true,
      waiting_room: true,
      join_before_host: false,
      auto_recording: 'none',
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
