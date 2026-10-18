import { useRef, useState } from 'react'
import { ArrowLeft, CaretDown, CaretUp, MagnifyingGlass, Plus, Trash } from '@phosphor-icons/react'
import { FlowSwitch } from '../automations/FlowSwitch'
import { useConfirm } from '../../hooks/useConfirm'
import type { ProgrammesState } from '../../hooks/useProgrammes'
import { cn } from '../../lib/cn'
import {
  categoriesOf,
  DEFAULT_MESSAGE_TEMPLATE,
  fillTemplate,
  groupProgrammes,
  MAX_CATEGORY,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_PROGRAMMES,
  MAX_STEPS,
  sampleValues,
  searchProgrammes,
  STEP_KINDS,
  stepKindLabel,
  TEMPLATE_PLACEHOLDERS,
  type Programme,
  type ProgrammeOutcome,
  type StepKind,
} from '../../lib/programmes'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'
const primaryButton =
  'rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50'
const quietButton =
  'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

type Notice = { text: string; isError: boolean }

type ProgrammesSectionProps = {
  // Only an admin can make, change, reorder or remove a programme; others can read them.
  canEdit: boolean
}

// The courses the school signs parents up for: each with its own steps, the message to the parent and what
// picking a class does. What an admin saves here is what the team sees in the Inbox, with nothing to deploy.
export function ProgrammesSection({ canEdit, state }: ProgrammesSectionProps & { state: ProgrammesState }) {
  return <ProgrammesView canEdit={canEdit} state={state} />
}

// The page itself, given the programmes; kept apart from loading them so it can be shown without a database.
export function ProgrammesView({ canEdit, state }: ProgrammesSectionProps & { state: ProgrammesState }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [search, setSearch] = useState('')
  const open = state.programmes.find((entry) => entry.id === openId) ?? null
  const groups = groupProgrammes(searchProgrammes(state.programmes, search))

  if (open) {
    return (
      <ProgrammeEditor
        key={open.id}
        programme={open}
        canEdit={canEdit}
        state={state}
        onBack={() => setOpenId(null)}
        onDeleted={() => {
          setOpenId(null)
          setNotice({ text: 'Programme deleted.', isError: false })
        }}
      />
    )
  }

  return (
    <section className="space-y-4">
      <p className="max-w-2xl text-sm text-slate-600">
        An enrolment flow is what the team does in the Inbox when a parent signs up for a class: the steps (the
        form, the receipt, picking the class, Zoom), and the message to the parent. Above, pick which flow each kind of
        class uses; a class can also use its own (Edit Class).
      </p>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {notice && (
        <p
          role={notice.isError ? 'alert' : 'status'}
          className={cn('rounded-xl px-4 py-3 text-sm', notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800')}
        >
          {notice.text}
        </p>
      )}
      {canEdit && (
        <NewProgramme
          full={state.programmes.length >= MAX_PROGRAMMES}
          onAdd={async (name) => {
            const result = await state.add(name)
            if (result.programme) {
              setNotice(null)
              setOpenId(result.programme.id)
            }
            return result.error
          }}
        />
      )}
      {state.isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : state.programmes.length === 0 ? (state.error ? null : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">No flow yet</p>
          <p className="mt-1 text-sm text-slate-500">
            {canEdit
              ? 'Add the first one above, for example "Regular sign-up". Then set its steps and the message to the parent.'
              : 'An admin adds the flows.'}
          </p>
        </div>
      )) : (
        <>
        {state.programmes.length > 6 && (
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 focus-within:border-[#fc0c97]">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a flow or category"
              aria-label="Search programmes"
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
        )}
        {groups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No flow matches.</p>}
        {groups.map((group) => (
        <div key={group.label || 'all'} className="space-y-2">
          {group.label && (
            <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label} <span className="font-normal normal-case">({group.programmes.length})</span>
            </h3>
          )}
        <ul className="space-y-2">
          {group.programmes.map((programme) => { const index = state.programmes.indexOf(programme); return (
            <li key={programme.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setOpenId(programme.id)}
                className="flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{programme.name}</span>
                  {programme.legacyKey && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Built-in</span>
                  )}
                  {!programme.isActive && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Off</span>
                  )}
                </span>
                <span className="truncate text-xs text-slate-500">
                  {programme.steps.length === 0 ? 'No steps' : programme.steps.map((step) => step.title).join('  →  ')}
                </span>
              </button>
              {canEdit && (
                <div className="flex flex-col justify-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${programme.name} up`}
                    disabled={index === 0}
                    onClick={() => void state.move(programme.id, -1)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${programme.name} down`}
                    disabled={index === state.programmes.length - 1}
                    onClick={() => void state.move(programme.id, 1)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretDown size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ) })}
        </ul>
        </div>
        ))}
        </>
      )}
    </section>
  )
}

function NewProgramme({ full, onAdd }: { full: boolean; onAdd: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const failed = await onAdd(name)
    setSaving(false)
    setProblem(failed)
    if (!failed) {
      setName('')
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <label className="min-w-[220px] flex-1">
        <span className="sr-only">Name of the new flow</span>
        <input
          value={name}
          maxLength={MAX_NAME}
          placeholder="Name of a new flow, e.g. Regular sign-up"
          onChange={(event) => {
            setName(event.target.value)
            setProblem(null)
          }}
          className={fieldClass}
        />
        {problem && (
          <span role="alert" className="mt-1 block text-xs text-red-700">
            {problem}
          </span>
        )}
      </label>
      <button type="submit" disabled={saving || full} className={`${primaryButton} flex items-center gap-1`}>
        <Plus size={14} weight="bold" aria-hidden="true" />
        {saving ? 'Adding…' : 'Add flow'}
      </button>
    </form>
  )
}

function ProgrammeEditor({
  programme,
  canEdit,
  state,
  onBack,
  onDeleted,
}: {
  programme: Programme
  canEdit: boolean
  state: ProgrammesState
  onBack: () => void
  onDeleted: () => void
}) {
  const { confirm, dialog } = useConfirm()
  // A built-in programme keeps the screen it always had, so its steps and message are not edited here.
  const locked = !canEdit || programme.legacyKey !== null
  const [name, setName] = useState(programme.name)
  const [isActive, setIsActive] = useState(programme.isActive)
  const [category, setCategory] = useState(programme.category ?? '')
  const [outcome, setOutcome] = useState<ProgrammeOutcome>(programme.outcome)
  const [message, setMessage] = useState(programme.messageTemplate)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const changed =
    name !== programme.name ||
    isActive !== programme.isActive ||
    category.trim() !== (programme.category ?? '') ||
    outcome !== programme.outcome ||
    message !== programme.messageTemplate

  async function save() {
    setSaving(true)
    setNotice(null)
    const problem = await state.save(programme.id, { name, outcome, messageTemplate: message, isActive, category })
    setSaving(false)
    setNotice(problem ? { text: problem, isError: true } : { text: 'Saved. The team sees it in the Inbox now.', isError: false })
  }

  async function leave() {
    if (changed && !(await confirm('This programme has changes you have not saved. Leave without saving?', { confirmLabel: 'Leave' }))) {
      return
    }
    onBack()
  }

  async function removeProgramme() {
    if (
      !(await confirm(`Delete "${programme.name}"? Its steps are deleted too. The classes in it stay, with no programme.`, {
        confirmLabel: 'Delete',
      }))
    ) {
      return
    }
    const problem = await state.remove(programme.id)
    if (problem) {
      setNotice({ text: problem, isError: true })
      return
    }
    onDeleted()
  }

  function insertPlaceholder(token: string) {
    const field = messageRef.current
    // Where the cursor is; at the end when the message box has not been used yet.
    const inField = field !== null && document.activeElement === field
    const start = inField ? field.selectionStart : message.length
    const end = inField ? field.selectionEnd : message.length
    setMessage(`${message.slice(0, start)}${token}${message.slice(end)}`)
    setNotice(null)
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <section className="space-y-5">
      <button type="button" onClick={() => void leave()} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft size={14} aria-hidden="true" />
        All programmes
      </button>

      {programme.legacyKey && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          This is one of Mirai&apos;s own courses. It keeps the screen it always had in the Inbox, so its steps and message
          are not changed here.
        </p>
      )}
      {notice && (
        <p
          role={notice.isError ? 'alert' : 'status'}
          className={cn('rounded-xl px-4 py-3 text-sm', notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800')}
        >
          {notice.text}
        </p>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Name</span>
          <input
            value={name}
            maxLength={MAX_NAME}
            disabled={locked}
            onChange={(event) => {
              setName(event.target.value)
              setNotice(null)
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Category</span>
          <span className="block text-xs text-slate-500">
            Groups the programmes in the Inbox, for example &quot;Form 1&quot; or &quot;Products&quot;. Leave it empty for none.
          </span>
          <input
            value={category}
            maxLength={MAX_CATEGORY}
            list={`categories-${programme.id}`}
            disabled={!canEdit}
            onChange={(event) => {
              setCategory(event.target.value)
              setNotice(null)
            }}
            className={`${fieldClass} mt-1`}
          />
          <datalist id={`categories-${programme.id}`}>
            {categoriesOf(state.programmes).map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </label>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">On</p>
            <p className="text-xs text-slate-500">A flow that is off is not used in the Inbox. Nothing already saved is lost.</p>
          </div>
          <FlowSwitch
            checked={isActive}
            disabled={locked}
            label={`${programme.name} is on`}
            onChange={() => {
              setIsActive((current) => !current)
              setNotice(null)
            }}
          />
        </div>

        <fieldset disabled={locked} className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">When a class is picked</legend>
          {(
            [
              ['booking', 'Keep a place for the lead', 'The lead stays a lead. The class shows how many are booked.'],
              ['enrol', 'Make the lead a student of that class', 'Picking the class is the sign-up.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`outcome-${programme.id}`}
                checked={outcome === value}
                onChange={() => {
                  setOutcome(value)
                  setNotice(null)
                }}
                className="mt-1 accent-[#fc0c97]"
              />
              <span>
                <span className="block font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <StepsEditor programme={programme} locked={locked} state={state} onProblem={(text) => setNotice({ text, isError: true })} confirm={confirm} />

      {!programme.legacyKey && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Message to the parent</h3>
            <p className="text-xs text-slate-500">
              The Inbox puts this in the message box with what is saved on the lead. A line whose information is not saved
              yet is left out.
            </p>
          </div>
          <textarea
            ref={messageRef}
            value={message}
            maxLength={MAX_MESSAGE}
            rows={9}
            disabled={locked}
            aria-label="Message to the parent"
            onChange={(event) => {
              setMessage(event.target.value)
              setNotice(null)
            }}
            className={`${fieldClass} font-mono`}
          />
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Put in the message:</span>
              {TEMPLATE_PLACEHOLDERS.map((entry) => (
                <button
                  key={entry.token}
                  type="button"
                  onClick={() => insertPlaceholder(entry.token)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {entry.label}
                </button>
              ))}
              {message.trim() === '' && (
                <button type="button" onClick={() => setMessage(DEFAULT_MESSAGE_TEMPLATE)} className="text-xs font-semibold text-[#be185d] hover:underline">
                  Start from an example
                </button>
              )}
            </div>
          )}
          {message.trim() !== '' && (
            <div>
              <p className="text-xs font-semibold text-slate-600">How it reads (with example details)</p>
              <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {fillTemplate(message, sampleValues())}
              </pre>
            </div>
          )}
        </div>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={saving || !changed} onClick={() => void save()} className={primaryButton}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => void removeProgramme()} className={`${quietButton} flex items-center gap-1 text-red-700`}>
            <Trash size={14} aria-hidden="true" />
            Delete programme
          </button>
        </div>
      )}
      {dialog}
    </section>
  )
}

function StepsEditor({
  programme,
  locked,
  state,
  onProblem,
  confirm,
}: {
  programme: Programme
  locked: boolean
  state: ProgrammesState
  onProblem: (text: string) => void
  confirm: (message: string, labels?: { confirmLabel?: string }) => Promise<boolean>
}) {
  const [kind, setKind] = useState<StepKind>('custom')
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null)
  const kindInfo = STEP_KINDS.find((entry) => entry.kind === kind)

  async function add() {
    setSaving(true)
    const text = title.trim() === '' && kindInfo ? kindInfo.defaultTitle : title
    const failed = await state.putStep(programme.id, null, kind, text)
    setSaving(false)
    setProblem(failed)
    if (!failed) {
      setTitle('')
    }
  }

  async function rename() {
    if (!renaming) {
      return
    }
    const step = programme.steps.find((entry) => entry.id === renaming.id) ?? null
    const failed = await state.putStep(programme.id, step, null, renaming.title)
    if (failed) {
      onProblem(failed)
      return
    }
    setRenaming(null)
  }

  async function remove(stepId: number, stepTitle: string) {
    if (!(await confirm(`Remove the step "${stepTitle}"? Anything already noted on leads for this step is lost.`, { confirmLabel: 'Remove' }))) {
      return
    }
    const failed = await state.removeStep(programme.id, stepId)
    if (failed) {
      onProblem(failed)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Steps</h3>
        <p className="text-xs text-slate-500">The order the team follows in the Inbox panel. Changes here save at once.</p>
      </div>
      {programme.steps.length === 0 ? (
        <p className="text-sm text-slate-500">No steps yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {programme.steps.map((step, index) => (
            <li key={step.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                {renaming?.id === step.id ? (
                  <input
                    autoFocus
                    value={renaming.title}
                    maxLength={MAX_NAME}
                    aria-label={`Name of step ${index + 1}`}
                    onChange={(event) => setRenaming({ id: step.id, title: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void rename()
                      }
                      if (event.key === 'Escape') {
                        setRenaming(null)
                      }
                    }}
                    onBlur={() => void rename()}
                    className={fieldClass}
                  />
                ) : (
                  <>
                    <span className="block truncate text-sm font-medium text-slate-900">{step.title}</span>
                    <span className="block text-xs text-slate-500">{stepKindLabel(step.kind)}</span>
                  </>
                )}
              </span>
              {!locked && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setRenaming({ id: step.id, title: step.title })} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#be185d] hover:bg-white">
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${step.title} up`}
                    disabled={index === 0}
                    onClick={() => void state.moveStep(programme.id, step.id, -1).then((failed) => failed && onProblem(failed))}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
                  >
                    <CaretUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${step.title} down`}
                    disabled={index === programme.steps.length - 1}
                    onClick={() => void state.moveStep(programme.id, step.id, 1).then((failed) => failed && onProblem(failed))}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
                  >
                    <CaretDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${step.title}`}
                    onClick={() => void remove(step.id, step.title)}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-white"
                  >
                    <Trash size={14} aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {!locked && programme.steps.length < MAX_STEPS && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-800">Add a step</p>
          <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
            <label className="block">
              <span className="sr-only">Kind of step</span>
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as StepKind)
                  setProblem(null)
                }}
                className={fieldClass}
              >
                {STEP_KINDS.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Name of the step</span>
              <input
                value={title}
                maxLength={MAX_NAME}
                placeholder={kind === 'custom' ? 'Name, e.g. Placement test' : `Name (${kindInfo?.defaultTitle})`}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setProblem(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void add()
                  }
                }}
                className={fieldClass}
              />
            </label>
            <button type="button" disabled={saving} onClick={() => void add()} className={primaryButton}>
              {saving ? 'Adding…' : 'Add step'}
            </button>
          </div>
          {kindInfo && <p className="text-xs text-slate-500">{kindInfo.hint}</p>}
          {problem && (
            <p role="alert" className="text-xs text-red-700">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
