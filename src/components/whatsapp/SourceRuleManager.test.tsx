import { render, screen } from '@testing-library/react'
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
const rules: SourceRule[] = [
  { id: 3, phrase: 'saw your ad', sourceId: 1, tagIds: [2], isActive: true },
  { id: 4, phrase: 'old camp', sourceId: null, tagIds: [], isActive: false },
]

function setup(extra: Partial<ComponentProps<typeof SourceRuleManager>> = {}) {
  render(<SourceRuleManager rules={rules} isLoading={false} loadError={null} leadOptions={options} onClose={vi.fn()} {...extra} />)
}

describe('SourceRuleManager', () => {
  it('lists the source keywords and says they are changed on Automations', () => {
    setup()
    expect(screen.getByText('"saw your ad"')).toBeInTheDocument()
    expect(screen.getByText('Source: Facebook')).toBeInTheDocument()
    expect(screen.getByText('Free HOA')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByText('Source: Other')).toBeInTheDocument()
    expect(screen.getByText(/Marketing → Automations/)).toBeInTheDocument()
    // Nothing is edited here any more.
    expect(screen.queryByRole('button', { name: /New rule|Edit rule|Delete rule/ })).not.toBeInTheDocument()
  })

  it('shows the chat’s first message, ready to copy into a new flow', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup({ initialPhrase: 'Hi, I saw your Facebook ad' })
    expect(screen.getByText('"Hi, I saw your Facebook ad"')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy the message' }))
    expect(writeText).toHaveBeenCalledWith('Hi, I saw your Facebook ad')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
