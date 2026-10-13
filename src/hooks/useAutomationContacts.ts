import { useCallback, useEffect, useState } from 'react'
import {
  addContact,
  automationContactsErrorMessage,
  checkContact,
  deleteContact,
  fetchContacts,
  updateContact,
  type AutomationContact,
} from '../lib/automationContacts'

function sorted(list: AutomationContact[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
}

// The contacts automation messages can be sent to. Each action resolves to an error message, or null
// when it worked.
export function useAutomationContacts({ enabled }: { enabled: boolean }) {
  const [contacts, setContacts] = useState<AutomationContact[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setContacts(await fetchContacts())
      setError(null)
    } catch (problem) {
      setError(automationContactsErrorMessage(problem, "Couldn't load the contacts."))
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const add = useCallback(async (name: string, phone: string): Promise<string | null> => {
    const checked = checkContact(name, phone)
    if (checked.error) {
      return checked.error
    }
    try {
      const saved = await addContact(name, checked.digits)
      setContacts((current) => sorted([...current, saved]))
      return null
    } catch (failure) {
      return automationContactsErrorMessage(failure, "Couldn't add the contact.")
    }
  }, [])

  const update = useCallback(async (id: number, name: string, phone: string): Promise<string | null> => {
    const checked = checkContact(name, phone)
    if (checked.error) {
      return checked.error
    }
    try {
      const saved = await updateContact(id, name, checked.digits)
      setContacts((current) => sorted(current.map((entry) => (entry.id === id ? saved : entry))))
      return null
    } catch (failure) {
      return automationContactsErrorMessage(failure, "Couldn't change the contact.")
    }
  }, [])

  const remove = useCallback(async (id: number): Promise<string | null> => {
    try {
      await deleteContact(id)
      setContacts((current) => current.filter((entry) => entry.id !== id))
      return null
    } catch (failure) {
      return automationContactsErrorMessage(failure, "Couldn't delete the contact.")
    }
  }, [])

  return { contacts, error, reload, add, update, remove }
}
