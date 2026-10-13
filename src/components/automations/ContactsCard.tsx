import { useState } from 'react'
import { CaretDown, CaretUp, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { useConfirm } from '../../hooks/useConfirm'
import {
  MAX_CONTACTS,
  MAX_CONTACT_NAME,
  displayContactPhone,
  type AutomationContact,
} from '../../lib/automationContacts'
import { cn } from '../../lib/cn'

type ContactsCardProps = {
  contacts: AutomationContact[]
  loadError: string | null
  // Only an admin can add, change or remove a contact; others can look.
  canEdit: boolean
  onAdd: (name: string, phone: string) => Promise<string | null>
  onUpdate: (id: number, name: string, phone: string) => Promise<string | null>
  onRemove: (id: number) => Promise<string | null>
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50'

// The people a message can be sent to instead of the family (the team's own numbers, a teacher...).
// A message block picks one under "Send to".
export function ContactsCard({ contacts, loadError, canEdit, onAdd, onUpdate, onRemove }: ContactsCardProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  // The contact being changed, or null.
  const [editing, setEditing] = useState<number | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  function reset() {
    setName('')
    setPhone('')
    setEditing(null)
    setProblem(null)
  }

  async function submit() {
    setIsWorking(true)
    setProblem(null)
    const result = editing === null ? await onAdd(name, phone) : await onUpdate(editing, name, phone)
    setIsWorking(false)
    if (result) {
      setProblem(result)
      return
    }
    reset()
  }

  async function remove(contact: AutomationContact) {
    if (!(await confirm(`Remove "${contact.name}" from the contacts?`, { confirmLabel: 'Remove' }))) {
      return
    }
    setProblem(null)
    const result = await onRemove(contact.id)
    if (result) {
      setProblem(result)
      setOpen(true)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Contacts
          <span className="ml-2 font-normal text-slate-500">
            {contacts.length === 0 ? 'None yet' : `${contacts.length} saved`}
          </span>
        </span>
        <span className="text-xs text-slate-500">People a message can go to instead of the family</span>
        {open ? <CaretUp size={14} aria-hidden="true" /> : <CaretDown size={14} aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          {loadError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}
          {contacts.length === 0 && !loadError && (
            <p className="text-sm text-slate-500">
              Add yourself to get a message when something happens, for example when a class starts.
            </p>
          )}
          {contacts.length > 0 && (
            <ul className="space-y-1.5">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2',
                    editing === contact.id && 'ring-1 ring-[#fc0c97]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{contact.name}</p>
                    <p className="text-xs text-slate-500">{displayContactPhone(contact)}</p>
                  </div>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        aria-label={`Change ${contact.name}`}
                        onClick={() => {
                          setEditing(contact.id)
                          setName(contact.name)
                          setPhone(`+${contact.phone}`)
                          setProblem(null)
                        }}
                        className="rounded p-2 text-slate-500 hover:bg-slate-200"
                      >
                        <PencilSimple size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${contact.name}`}
                        onClick={() => void remove(contact)}
                        className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (contacts.length < MAX_CONTACTS || editing !== null) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {editing === null ? 'Add a contact' : 'Change the contact'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={name}
                  maxLength={MAX_CONTACT_NAME}
                  placeholder="Name, like Lex"
                  aria-label="Contact name"
                  onChange={(event) => setName(event.target.value)}
                  className={fieldClass}
                />
                <input
                  type="tel"
                  value={phone}
                  placeholder="WhatsApp number, 012-345 6789"
                  aria-label="Contact WhatsApp number"
                  onChange={(event) => setPhone(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void submit()}
                  className="flex items-center gap-1 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
                >
                  {editing === null && <Plus size={14} weight="bold" aria-hidden="true" />}
                  {isWorking ? 'Saving…' : editing === null ? 'Add contact' : 'Save contact'}
                </button>
                {editing !== null && (
                  <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    <X size={14} aria-hidden="true" />
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {problem && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {problem}
            </p>
          )}
          {!canEdit && <p className="text-xs text-slate-500">Only an admin can change the contacts.</p>}
        </div>
      )}
      {dialog}
    </section>
  )
}
