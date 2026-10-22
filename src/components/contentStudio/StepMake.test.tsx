import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_BRIEF, type BriefDraft } from '../../lib/contentStudio'
import { StepMake } from './StepMake'

vi.mock('../../lib/supabase', () => ({ supabase: null }))

function Harness({ onDraft }: { onDraft: (draft: BriefDraft) => void }) {
  const [draft, setDraft] = useState<BriefDraft>({ ...EMPTY_BRIEF, counts: { single: 2, carousel: 0, caption: 0 }, styleIds: [1] })
  return (
    <StepMake
      draft={draft}
      styles={[
        { id: 1, name: 'Cartoon', description: 'Pink', referencePaths: [], hidden: false },
        { id: 2, name: 'Hidden one', description: '', referencePaths: [], hidden: true },
      ]}
      angles={[{ id: 7, name: 'Pain point', description: '', examples: [], hidden: false }]}
      canEdit
      usage={{ used: 50, limit: 60 }}
      onChange={(next) => {
        setDraft(next)
        onDraft(next)
      }}
    />
  )
}

describe('StepMake', () => {
  it('sets each type on its own, shows the total and warns past the daily limit', async () => {
    const onDraft = vi.fn()
    render(<Harness onDraft={onDraft} />)
    expect(screen.queryByText('Hidden one')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More: Carousels' }))
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { single: 2, carousel: 1, caption: 0 } }))
    // Pages per carousel show once there is a carousel.
    expect(screen.getByLabelText('Pages in each carousel')).toHaveValue('5')

    const captions = screen.getByLabelText('Captions only')
    await userEvent.clear(captions)
    await userEvent.type(captions, '9')
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/Lower the numbers/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /Pain point/ }))
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ angleIds: [7] }))
  })
})
