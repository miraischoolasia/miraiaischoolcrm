import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STAGE_RULES, stageRulesFromRows, stageRulesSummary } from '../../lib/stageRules'
import { StageRulesCard } from './StageRulesCard'

function renderCard(overrides: Partial<React.ComponentProps<typeof StageRulesCard>> = {}) {
  const onSave = vi.fn().mockResolvedValue(null)
  render(
    <StageRulesCard
      rules={DEFAULT_STAGE_RULES}
      missing={false}
      canEdit
      loadError={null}
      onSave={onSave}
      {...overrides}
    />,
  )
  return onSave
}

describe('stage rules', () => {
  it('the defaults are what the database did before: every rule on, automatic messages count, every student counts', () => {
    expect(DEFAULT_STAGE_RULES.every((rule) => rule.enabled && rule.countAutomated && rule.students === 'all')).toBe(true)
    expect(stageRulesSummary(DEFAULT_STAGE_RULES)).toBe('All 4 rules on')
  })

  it('reads the rows of the database, and a missing row is the default', () => {
    const rules = stageRulesFromRows([
      { key: 'contacted_on_reply', enabled: true, options: { count_automated: false } },
      { key: 'converted_on_student_phone', enabled: false, options: { students: 'regular' } },
    ])
    expect(rules.find((rule) => rule.key === 'contacted_on_reply')).toMatchObject({ enabled: true, countAutomated: false })
    expect(rules.find((rule) => rule.key === 'converted_on_student_phone')).toMatchObject({ enabled: false, students: 'regular' })
    expect(rules.find((rule) => rule.key === 'converted_on_enrol')).toMatchObject({ enabled: true, countAutomated: true, students: 'all' })
    expect(stageRulesSummary(rules)).toBe('3 of 4 rules on')
  })

  it('shows the four rules when opened, each with a switch', async () => {
    renderCard()
    expect(screen.getByText('All 4 rules on')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByLabelText('Which messages count')).toHaveValue('any')
    expect(screen.getByLabelText('Which students count')).toHaveValue('all')
  })

  it('switches a rule off', async () => {
    const onSave = renderCard()
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    await userEvent.click(screen.getAllByRole('checkbox')[1])
    expect(onSave).toHaveBeenCalledWith('trial_scheduled_on_booking', { enabled: false })
  })

  it('changes the options', async () => {
    const onSave = renderCard()
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    await userEvent.selectOptions(screen.getByLabelText('Which messages count'), 'person')
    expect(onSave).toHaveBeenCalledWith('contacted_on_reply', { countAutomated: false })
    await userEvent.selectOptions(screen.getByLabelText('Which students count'), 'regular')
    expect(onSave).toHaveBeenCalledWith('converted_on_student_phone', { students: 'regular' })
  })

  it('cannot be changed by someone who may only look', async () => {
    renderCard({ canEdit: false })
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeDisabled()
    }
  })

  it('says so before the database update is applied, and shows what could not be saved', async () => {
    renderCard({ missing: true })
    expect(screen.getByText(/Not available until the database update/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('shows the reason when a change is refused', async () => {
    const onSave = renderCard({ onSave: vi.fn().mockResolvedValue('Your account is not allowed to change these rules.') })
    void onSave
    await userEvent.click(screen.getByRole('button', { name: /Stage rules/ }))
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
  })
})
