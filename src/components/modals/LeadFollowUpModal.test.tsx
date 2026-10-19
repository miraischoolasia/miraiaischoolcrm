import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Lead } from '../../types/domain'
import { LeadFollowUpModal } from './LeadFollowUpModal'

const lead = { id: 7, fullName: 'Tracy Sin', followUps: [], tasks: [] } as unknown as Lead

function setup(onOpenChat?: () => void) {
  render(
    <LeadFollowUpModal
      lead={lead}
      isSaving={false}
      saveError={null}
      onClose={vi.fn()}
      onAddFollowUp={vi.fn()}
      isSavingTask={false}
      taskSaveError={null}
      onAddTask={vi.fn()}
      onToggleTask={vi.fn()}
      onDeleteTask={vi.fn()}
      onOpenChat={onOpenChat}
    />,
  )
}

describe('LeadFollowUpModal', () => {
  it('opens the lead chat from the follow-up window', () => {
    const onOpenChat = vi.fn()
    setup(onOpenChat)
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(onOpenChat).toHaveBeenCalledTimes(1)
  })

  it('shows no Open chat when the lead has no chat', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument()
  })
})
