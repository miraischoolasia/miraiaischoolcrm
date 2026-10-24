import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LeadStageBadge } from './LeadStageBadge'

describe('LeadStageBadge', () => {
  it('shows only the stage when every child is at it', () => {
    render(<LeadStageBadge status="contacted" kids={[{ name: 'Mia' }, { name: 'Ben' }]} />)

    expect(screen.getByText('Contacted')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows +N for the children at another stage, with whose', () => {
    render(<LeadStageBadge status="contacted" kids={[{ name: 'Mia' }, { name: 'Ben', stage: 'trial_scheduled' }]} />)

    const more = screen.getByText('+1')
    expect(more).toHaveAttribute('title', 'Ben: Trial Scheduled')
  })
})
