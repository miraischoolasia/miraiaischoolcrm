import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureContactPeople, fetchPeople, type Person } from '../lib/peopleApi'
import { getChatRole, getRealPhone, type ChatwootConversation } from '../lib/whatsappInbox'

const REFRESH_MS = 60_000
const BATCH = 100

// "Teoh Soo Koon +60124645081" is how a contact is named once the number is added; the name is the part before.
export function contactName(raw: string | null | undefined) {
  const name = (raw ?? '').replace(/\s*\+?\d[\d\s-]{7,}$/, '').trim()
  return name && !/^[\d\s+-]+$/.test(name) ? name : ''
}

type Args = {
  // The inbox is on screen.
  enabled: boolean
  // Whoever may edit leads or students makes the people of new contacts; others only read.
  canEdit: boolean
  conversations: ChatwootConversation[]
}

// The family table, kept fresh while the inbox is open, and filled in for every WhatsApp contact
// the inbox shows. The database ties parents, children, leads and students together itself.
export function usePeople({ enabled, canEdit, conversations }: Args) {
  const [people, setPeople] = useState<Person[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const asked = useRef(new Set<number>())
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setPeople(await fetchPeople())
      setIsLoaded(true)
    } catch {
      // The card simply stays as it was; the next refresh tries again.
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || !canEdit || !isLoaded || busy.current) {
      return
    }
    const known = new Set(people.flatMap((person) => (person.contactId !== null ? [person.contactId] : [])))
    const missing = conversations.filter((conversation) => {
      const id = conversation.meta.sender.id
      return !known.has(id) && !asked.current.has(id)
    })
    if (missing.length === 0) {
      return
    }
    const batch = missing.slice(0, BATCH)
    batch.forEach((conversation) => asked.current.add(conversation.meta.sender.id))
    busy.current = true
    void ensureContactPeople(
      batch.map((conversation) => ({
        contactId: conversation.meta.sender.id,
        name: contactName(conversation.meta.sender.name),
        phone: getRealPhone(conversation.meta.sender.phone_number),
        role: getChatRole(conversation),
      })),
    )
      .then((made) => (made > 0 ? refresh() : undefined))
      .catch(() => {
        // Asked again on the next page load.
      })
      .finally(() => {
        busy.current = false
      })
  }, [enabled, canEdit, isLoaded, people, conversations, refresh])

  return { people, refresh }
}
