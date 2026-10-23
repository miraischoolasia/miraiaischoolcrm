import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead, Student } from '../../types/domain'
import type { ChatwootConversation } from '../../lib/whatsappInbox'
import { keptLead } from '../../lib/childPhone'
import { ChildPhoneMatches } from './ChildPhoneMatches'

const lead = (id: number, fullName: string, phone: string | null) => ({ id, fullName, phone, children: [] }) as unknown as Lead
const chat = { id: 9, meta: { sender: { id: 9, name: 'Kid', phone_number: '+60165550001', identifier: null } } } as ChatwootConversation

describe('ChildPhoneMatches', () => {
  it('says which lead joins which before joining them', async () => {
    const onLinkLead = vi.fn(async () => null)
    const current = lead(1, 'Mum Lee', '60123456789')
    render(
      <ChildPhoneMatches
        matches={{ sameAsParent: false, leads: [lead(2, 'Old Kid Lead', null)], students: [], chats: [] }}
        lead={current}
        onLinkLead={onLinkLead}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Old Kid Lead will be joined into Mum Lee (60123456789). Mum Lee stays')
    expect(onLinkLead).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Join them' }))
    expect(onLinkLead).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('keeps the lead that has a phone number, as the database does', () => {
    expect(keptLead(lead(1, 'A', null), lead(2, 'B', '6011')).id).toBe(2)
    expect(keptLead(lead(1, 'A', '6012'), lead(2, 'B', '6011')).id).toBe(1)
  })

  it("links or opens a chat from the number, shows a student, and warns about the parent's number", async () => {
    const onLinkChat = vi.fn(async () => null)
    const onOpenChat = vi.fn()
    const { rerender } = render(
      <ChildPhoneMatches
        matches={{ sameAsParent: false, leads: [], students: [{ id: 5, name: 'Ken Lee' } as Student], chats: [chat] }}
        lead={lead(1, 'Mum Lee', '60123456789')}
        onLinkLead={vi.fn()}
        onLinkChat={onLinkChat}
        onOpenChat={onOpenChat}
      />,
    )

    expect(screen.getByText(/Already a student/)).toHaveTextContent('Ken Lee')
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(onOpenChat).toHaveBeenCalledWith(9)
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(onLinkChat).toHaveBeenCalledWith(9)
    expect(screen.getByText('Linked')).toBeInTheDocument()

    rerender(
      <ChildPhoneMatches
        matches={{ sameAsParent: true, leads: [], students: [], chats: [] }}
        lead={null}
        onLinkLead={vi.fn()}
      />,
    )
    expect(screen.getByText("This is the parent's number, not the child's.")).toBeInTheDocument()
  })
})
