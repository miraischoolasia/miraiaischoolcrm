import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LeadTagChip } from './LeadTagChip'

const tag = { label: 'Interested in the Saturday coding class', color: '#2563eb', isActive: true }

describe('LeadTagChip', () => {
  it('in the Inbox is small, cut when long, and shows the whole name on hover', () => {
    render(<LeadTagChip tag={tag} compact />)
    const chip = screen.getByTitle(tag.label)
    expect(chip.className).toContain('h-[18px]')
    expect(chip.className).toContain('max-w-[10rem]')
    expect(screen.getByText(tag.label).className).toContain('truncate')
  })

  it('keeps its usual size elsewhere', () => {
    render(<LeadTagChip tag={tag} />)
    expect(screen.getByTitle(tag.label).className).toContain('text-xs')
  })
})
