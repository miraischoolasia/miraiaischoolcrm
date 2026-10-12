import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import { contactName, usePeople } from './usePeople'

const api = vi.hoisted(() => ({ fetchPeople: vi.fn(), ensureContactPeople: vi.fn() }))
vi.mock('../lib/peopleApi', () => api)

const chat = (contactId: number, name: string, phone: string, role?: 'parent' | 'student'): ChatwootConversation => ({
  id: contactId + 1000,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: 0,
  last_activity_at: 0,
  custom_attributes: role ? { crm_chat_role: role } : {},
  meta: { sender: { id: contactId, name, phone_number: phone, identifier: null } },
})

describe('contactName', () => {
  it('drops the number that is added after the name, and a name that is only a number', () => {
    expect(contactName('Teoh Soo Koon +60124645081')).toBe('Teoh Soo Koon')
    expect(contactName('+60 19-839 2258')).toBe('')
    expect(contactName('2740373712987')).toBe('')
    expect(contactName('Yvonne')).toBe('Yvonne')
  })
})

describe('usePeople', () => {
  beforeEach(() => {
    api.fetchPeople.mockReset()
    api.ensureContactPeople.mockReset()
    api.fetchPeople.mockResolvedValue([{ id: 1, kind: 'parent', contactId: 10 }])
    api.ensureContactPeople.mockResolvedValue(0)
  })

  it('loads the family table, and makes people only for the contacts that have none', async () => {
    renderHook(() =>
      usePeople({
        enabled: true,
        canEdit: true,
        conversations: [chat(10, 'Known', '+60123456789'), chat(11, 'New Mum +60198887777', '+60198887777', 'parent')],
      }),
    )

    await waitFor(() => expect(api.ensureContactPeople).toHaveBeenCalledTimes(1))
    expect(api.ensureContactPeople).toHaveBeenCalledWith([
      { contactId: 11, name: 'New Mum', phone: '60198887777', role: 'parent' },
    ])
  })

  it('does not ask again for the same contact', async () => {
    const conversations = [chat(11, 'New', '+60198887777')]
    const view = renderHook(() => usePeople({ enabled: true, canEdit: true, conversations }))

    await waitFor(() => expect(api.ensureContactPeople).toHaveBeenCalledTimes(1))
    view.rerender()
    await waitFor(() => expect(api.fetchPeople).toHaveBeenCalled())
    expect(api.ensureContactPeople).toHaveBeenCalledTimes(1)
  })

  it('only reads for someone who cannot edit, and does nothing while the inbox is not showing', async () => {
    renderHook(() => usePeople({ enabled: true, canEdit: false, conversations: [chat(11, 'New', '+60198887777')] }))
    renderHook(() => usePeople({ enabled: false, canEdit: true, conversations: [chat(12, 'New', '+60198887778')] }))

    await waitFor(() => expect(api.fetchPeople).toHaveBeenCalledTimes(1))
    expect(api.ensureContactPeople).not.toHaveBeenCalled()
  })

  it('sends a hidden number as null', async () => {
    renderHook(() => usePeople({ enabled: true, canEdit: true, conversations: [chat(13, 'Hidden', '+65983632945371')] }))

    await waitFor(() => expect(api.ensureContactPeople).toHaveBeenCalled())
    expect(api.ensureContactPeople).toHaveBeenCalledWith([{ contactId: 13, name: 'Hidden', phone: null, role: null }])
  })
})
