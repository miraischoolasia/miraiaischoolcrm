import { useState } from 'react'
import { LeadTagPicker } from '../LeadTagPicker'
import { leadChildAgeOptions } from '../../lib/constants'
import type { SourceGuess } from '../../lib/chatLink'
import type { LeadOption } from '../../types/domain'
import type { NewLeadInput, WhatsAppCrm } from './crm'

type NewLeadFormProps = {
  crm: WhatsAppCrm
  // Name and number as the chat knows them; the number is empty when WhatsApp hides it.
  initialName: string
  initialPhone: string
  guess: SourceGuess
  onCreated: (leadId: number) => Promise<void>
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

export function NewLeadForm({ crm, initialName, initialPhone, guess, onCreated }: NewLeadFormProps) {
  const sources = crm.leadOptions.filter((option) => option.kind === 'source' && option.isActive)
  const people = crm.leadOptions.filter((option) => option.kind === 'pic' && option.isActive)
  const tags = crm.leadOptions.filter((option) => option.kind === 'tag')
  const otherSource = sources.find((option) => option.legacyKey === 'other')

  const [fullName, setFullName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [sourceId, setSourceId] = useState(String((guess.source ?? otherSource)?.id ?? ''))
  const [tagIds, setTagIds] = useState<number[]>(guess.tags.map((tag) => tag.id))
  const [picId, setPicId] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!fullName.trim() && !childName.trim() && !phone.trim()) {
      setError("Add the parent's name, the child's name or a phone number first.")
      return
    }
    const input: NewLeadInput = {
      fullName,
      phone,
      sourceId: sourceId ? Number(sourceId) : null,
      picId: picId ? Number(picId) : null,
      tagIds,
      childName,
      childAge: childAge ? Number(childAge) : null,
      notes,
    }
    setIsSaving(true)
    setError(null)
    const result = await crm.onCreateLead(input)
    if (result.error || result.leadId === null) {
      setError(result.error ?? "Couldn't save the lead. Try again.")
      setIsSaving(false)
      return
    }
    await onCreated(result.leadId)
    setIsSaving(false)
  }

  async function addOption(label: string, color: string): Promise<LeadOption | null> {
    return crm.onAddOption('tag', label, color)
  }

  return (
    <section className="space-y-3 text-xs">
      <h4 className="text-sm font-semibold text-slate-900">Add as a new lead</h4>

      <label className="block">
        <span className="text-slate-600">Parent name</span>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} className={fieldClass} />
      </label>
      <label className="block">
        <span className="text-slate-600">Phone number</span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="012 345 6789"
          className={fieldClass}
        />
      </label>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <label className="block">
          <span className="text-slate-600">Child's name</span>
          <input value={childName} onChange={(event) => setChildName(event.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-slate-600">Age</span>
          <select value={childAge} onChange={(event) => setChildAge(event.target.value)} className={fieldClass}>
            <option value="">-</option>
            {leadChildAgeOptions.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-slate-600">
          Where did they find us?
          {guess.source && sourceId === String(guess.source.id) && <span className="ml-1 text-sky-700">(guessed from the first message)</span>}
        </span>
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className={fieldClass}>
          <option value="">Not set</option>
          {sources.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <LeadTagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} onCreate={addOption} />
      <label className="block">
        <span className="text-slate-600">Person in charge</span>
        <select value={picId} onChange={(event) => setPicId(event.target.value)} className={fieldClass}>
          <option value="">No one yet</option>
          {people.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-slate-600">Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={fieldClass} />
      </label>

      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isSaving}
        onClick={() => void save()}
        className="w-full rounded-lg bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e00a87] disabled:opacity-60"
      >
        {isSaving ? 'Saving...' : 'Save lead'}
      </button>
    </section>
  )
}
