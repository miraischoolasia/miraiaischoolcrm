import { useEffect, useId, useRef, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { LeadTagPicker } from '../LeadTagPicker'
import {
  MALAYSIAN_STATES,
  MAX_LEAD_CHILDREN,
  leadChildAgeOptions,
  leadStatusOptions,
} from '../../lib/constants'
import type { SourceGuess } from '../../lib/chatLink'
import type { Lead, LeadOption, LeadStatus } from '../../types/domain'
import type { LeadFormValues, WhatsAppCrm } from './crm'
import { FormAnswers } from './FormAnswers'
import { PanelSection } from './PanelSection'

// Typed text is saved this long after the last key; a pick from a list is saved at once.
const AUTOSAVE_AFTER_TYPING_MS = 800

type LeadFormProps = {
  crm: WhatsAppCrm
  // The lead being edited; null while the parent is not a lead yet.
  lead: Lead | null
  // Name and number as the chat knows them, for a new lead. The number is empty when WhatsApp hides it.
  initialName: string
  initialPhone: string
  guess: SourceGuess
  // Called once a new lead is saved, so the chat can be tied to it.
  onCreated: (leadId: number) => Promise<void>
}

type ChildRow = { name: string; age: string; phone: string | null }

type FormState = {
  fullName: string
  phone: string
  state: string
  children: ChildRow[]
  sourceId: string
  tagIds: number[]
  picId: string
  status: LeadStatus
  notes: string
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

function fromLead(lead: Lead): FormState {
  return {
    fullName: lead.fullName ?? '',
    phone: lead.phone ?? '',
    state: lead.state ?? '',
    children: lead.children.map((child) => ({ name: child.name ?? '', age: String(child.age), phone: child.phone ?? null })),
    sourceId: lead.sourceId !== null ? String(lead.sourceId) : '',
    tagIds: lead.tagIds,
    picId: lead.picId !== null ? String(lead.picId) : '',
    status: lead.status,
    notes: lead.notes ?? '',
  }
}

// One form for a lead, whether it is being added or changed. A new lead is saved with the
// button; after that every change is saved by itself and nothing pops up.
export function LeadForm({ crm, lead, initialName, initialPhone, guess, onCreated }: LeadFormProps) {
  const sources = crm.leadOptions.filter((option) => option.kind === 'source' && option.isActive)
  const people = crm.leadOptions.filter((option) => option.kind === 'pic' && option.isActive)
  const tags = crm.leadOptions.filter((option) => option.kind === 'tag')
  const otherSource = sources.find((option) => option.legacyKey === 'other')
  // A lead's own source or PIC may have been hidden since; it must still show.
  const sourceChoices = withCurrent(sources, crm.leadOptions, lead?.sourceId ?? null)
  const picChoices = withCurrent(people, crm.leadOptions, lead?.picId ?? null)

  const [form, setForm] = useState<FormState>(() =>
    lead
      ? fromLead(lead)
      : {
          fullName: initialName,
          phone: initialPhone,
          state: '',
          children: [{ name: '', age: '', phone: null }],
          sourceId: String((guess.source ?? otherSource)?.id ?? ''),
          tagIds: guess.tags.map((tag) => tag.id),
          picId: '',
          status: 'new',
          notes: '',
        },
  )
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showForms, setShowForms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canEdit = crm.canEditLeads
  const sourceId = useId()
  const hasForms = lead ? crm.leadIdsWithForms.has(lead.id) : false

  // The latest of everything, for a save that runs later (a timer, or the form closing).
  const formRef = useRef(form)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const againRef = useRef(false)
  const delayRef = useRef(0)
  const saveRef = useRef<() => Promise<void>>(async () => {})
  formRef.current = form

  // A lead that exists saves itself; a new one waits for the Save lead button.
  function change(patch: Partial<FormState>, typing = false) {
    const next = { ...formRef.current, ...patch }
    formRef.current = next
    dirtyRef.current = true
    delayRef.current = typing ? AUTOSAVE_AFTER_TYPING_MS : 0
    setForm(next)
    setIsDirty(true)
    setError(null)
  }

  // Changes made elsewhere (the Leads page, another person) appear here too, unless
  // this form has unsaved changes of its own.
  const updatedAt = lead?.updatedAt
  useEffect(() => {
    if (lead && !isDirty) {
      setForm(fromLead(lead))
    }
    // Only a newer version of the lead should reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt])

  // A late first message or rule can change the guess; use it while nothing was typed.
  const guessKey = `${guess.source?.id ?? ''}-${guess.tags.map((tag) => tag.id).join(',')}`
  useEffect(() => {
    if (!lead && !isDirty) {
      setForm((current) => ({
        ...current,
        sourceId: String((guess.source ?? otherSource)?.id ?? ''),
        tagIds: guess.tags.map((tag) => tag.id),
      }))
    }
    // The guess key stands for the guess.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessKey])

  // An empty row is nothing to save yet, so it does not count as a change.
  function addChildRow() {
    const next = { ...formRef.current, children: [...formRef.current.children, { name: '', age: '', phone: null }] }
    formRef.current = next
    setForm(next)
  }

  function setChild(index: number, patch: Partial<ChildRow>, typing = false) {
    change(
      { children: form.children.map((child, position) => (position === index ? { ...child, ...patch } : child)) },
      typing,
    )
  }

  async function save() {
    // One save at a time; what was typed meanwhile is saved right after.
    if (savingRef.current) {
      againRef.current = true
      return
    }
    const sent = formRef.current
    const children = sent.children.filter((child) => child.age !== '' || child.name.trim() !== '')
    if (children.some((child) => child.age === '')) {
      setError("Choose the child's age to save.")
      return
    }
    if (!sent.fullName.trim() && !children[0]?.name.trim() && !sent.phone.trim()) {
      setError("Add the parent's name, the child's name or a phone number first.")
      return
    }
    const values: LeadFormValues = {
      fullName: sent.fullName,
      phone: sent.phone,
      state: sent.state,
      sourceId: sent.sourceId ? Number(sent.sourceId) : null,
      picId: sent.picId ? Number(sent.picId) : null,
      tagIds: sent.tagIds,
      status: sent.status,
      children: children.map((child) => ({ name: child.name, age: Number(child.age), phone: child.phone })),
      notes: sent.notes,
    }
    savingRef.current = true
    setIsSaving(true)
    setError(null)
    try {
      if (lead) {
        const problem = await crm.onUpdateLead(lead.id, values)
        if (problem) {
          setError(problem)
          return
        }
      } else {
        const result = await crm.onCreateLead(values)
        if (result.error || result.leadId === null) {
          setError(result.error ?? "Couldn't save the lead. Try again.")
          return
        }
        await onCreated(result.leadId)
      }
      // Only what was just sent is saved; anything typed since is still waiting.
      if (formRef.current === sent) {
        dirtyRef.current = false
        setIsDirty(false)
      }
    } finally {
      savingRef.current = false
      setIsSaving(false)
      if (againRef.current) {
        againRef.current = false
        void saveRef.current()
      }
    }
  }
  saveRef.current = save

  // Changes to a lead that exists are saved by themselves, a moment after typing stops.
  useEffect(() => {
    if (!lead || !canEdit || !dirtyRef.current) {
      return
    }
    const timer = window.setTimeout(() => void saveRef.current(), delayRef.current)
    return () => window.clearTimeout(timer)
    // A new form value is the signal; `lead` only decides whether to save at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // Leaving the chat right after typing must not lose the change.
  const hasLead = lead !== null
  useEffect(
    () => () => {
      if (hasLead && dirtyRef.current && !savingRef.current) {
        void saveRef.current()
      }
    },
    [hasLead],
  )

  async function addTag(label: string, color: string): Promise<LeadOption | null> {
    return crm.onAddOption('tag', label, color)
  }

  return (
    <>
      <PanelSection title={lead ? 'Lead details' : 'Add as a new lead'}>
        <label className="block">
          <span className="text-slate-600">Parent name</span>
          <input
            value={form.fullName}
            disabled={!canEdit}
            onChange={(event) => change({ fullName: event.target.value }, true)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-slate-600">Phone number</span>
          <input
            type="tel"
            value={form.phone}
            disabled={!canEdit}
            onChange={(event) => change({ phone: event.target.value }, true)}
            placeholder="012 345 6789"
            className={fieldClass}
          />
        </label>

        <div className="space-y-1.5">
          <span className="block text-slate-600">Children</span>
          {form.children.map((child, index) => (
            <div key={index} className="grid grid-cols-[1fr_64px_28px] items-center gap-1.5">
              <input
                value={child.name}
                disabled={!canEdit}
                onChange={(event) => setChild(index, { name: event.target.value }, true)}
                placeholder="Child's name"
                aria-label={`Child ${index + 1} name`}
                className={fieldClass}
              />
              <select
                value={child.age}
                disabled={!canEdit}
                onChange={(event) => setChild(index, { age: event.target.value })}
                aria-label={`Child ${index + 1} age`}
                className={fieldClass}
              >
                <option value="">Age</option>
                {leadChildAgeOptions.map((age) => (
                  <option key={age} value={age}>
                    {age}
                  </option>
                ))}
              </select>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => change({ children: form.children.filter((_, position) => position !== index) })}
                  aria-label={`Remove child ${index + 1}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {canEdit && form.children.length < MAX_LEAD_CHILDREN && (
            <button
              type="button"
              onClick={addChildRow}
              className="inline-flex items-center gap-1 font-medium text-[#be185d] hover:underline"
            >
              <Plus size={12} aria-hidden="true" />
              Add a child
            </button>
          )}
        </div>

        <label className="block">
          <span className="text-slate-600">State</span>
          <select value={form.state} disabled={!canEdit} onChange={(event) => change({ state: event.target.value })} className={fieldClass}>
            <option value="">Not set</option>
            {MALAYSIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor={sourceId} className="text-slate-600">
              Where did they find us?
              {!lead && guess.source && form.sourceId === String(guess.source.id) && (
                <span className="ml-1 text-sky-700">(guessed from the first message)</span>
              )}
            </label>
            {hasForms && (
              <button
                type="button"
                aria-expanded={showForms}
                onClick={() => setShowForms((open) => !open)}
                className="shrink-0 rounded-full border border-pink-200 bg-white px-2.5 py-0.5 leading-tight font-medium text-[#be185d] hover:bg-pink-50"
              >
                Form
              </button>
            )}
          </div>
          <select
            id={sourceId}
            value={form.sourceId}
            disabled={!canEdit}
            onChange={(event) => change({ sourceId: event.target.value })}
            className={fieldClass}
          >
            <option value="">Not set</option>
            {sourceChoices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {hasForms && showForms && lead && <FormAnswers leadId={lead.id} load={crm.loadFormAnswers} />}
        </div>

        <label className="block">
          <span className="text-slate-600">Person in charge</span>
          <select value={form.picId} disabled={!canEdit} onChange={(event) => change({ picId: event.target.value })} className={fieldClass}>
            <option value="">No one yet</option>
            {picChoices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate-600">Stage</span>
          <select
            value={form.status}
            disabled={!canEdit}
            onChange={(event) => change({ status: event.target.value as LeadStatus })}
            className={fieldClass}
          >
            {leadStatusOptions.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate-600">Notes</span>
          <textarea
            value={form.notes}
            rows={2}
            disabled={!canEdit}
            onChange={(event) => change({ notes: event.target.value }, true)}
            className={fieldClass}
          />
        </label>
      </PanelSection>

      <PanelSection title="Tags">
        {canEdit ? (
          <LeadTagPicker
            tags={tags}
            selectedIds={form.tagIds}
            onChange={(tagIds) => change({ tagIds })}
            onCreate={addTag}
            showLabel={false}
          />
        ) : (
          <p className="text-slate-500">
            {form.tagIds.flatMap((id) => tags.find((tag) => tag.id === id)?.label ?? []).join(', ') || 'None'}
          </p>
        )}

        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        {/* Only a lead that does not exist yet needs a button; a lead that exists saves itself. */}
        {canEdit && !lead && (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void save()}
            className="w-full rounded-lg bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e00a87] disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save lead'}
          </button>
        )}
      </PanelSection>
    </>
  )
}

// The choices, plus the one the lead has now if it was hidden since.
function withCurrent(active: LeadOption[], all: LeadOption[], currentId: number | null) {
  if (currentId === null || active.some((option) => option.id === currentId)) {
    return active
  }
  const current = all.find((option) => option.id === currentId)
  return current ? [...active, current] : active
}
