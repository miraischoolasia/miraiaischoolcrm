import { useRef, useState } from 'react'
import { Trash } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  MAX_REPLY_WORDS,
  PLACEHOLDERS,
  SETTABLE_STAGES,
  actionLabel,
  isAction,
  isChoiceCondition,
  isMessage,
  messageAnchors,
  previewMessage,
  splitOffset,
  toOffsetMinutes,
  triggerInfo,
  unknownPlaceholders,
  type FilterOptions,
  type FlowGraph,
  type FlowNode,
  type FlowTrigger,
  type OffsetUnit,
} from '../../lib/automationFlows'
import { displayContactPhone, type AutomationContact } from '../../lib/automationContacts'
import { leadStatusOptions } from '../../lib/constants'
import { uploadFormImageToSupabase } from '../../lib/api'
import type { Classroom } from '../../types/domain'

type FlowInspectorProps = {
  node: FlowNode | null
  trigger: FlowTrigger
  classrooms: Classroom[]
  // The saved contacts a message can be sent to instead of the family.
  contacts: AutomationContact[]
  // What a source, tag, PIC or form block can tick.
  filterOptions: FilterOptions
  // The whole flow, so a message knows if its time is counted from a reply.
  graph?: FlowGraph
  readOnly: boolean
  onChange: (change: Record<string, unknown>) => void
  onDelete: () => void
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// "Send it [3] [minutes] before it starts". The number and the unit are kept as typed, so clearing the
// box does not turn into a 0 and picking a unit never snaps back to another one; the total in minutes
// goes to the block only while the number is a valid one.
export function OffsetField({
  mins,
  after,
  readOnly,
  label,
  allowZero = false,
  onChange,
}: {
  mins: number
  after: boolean
  readOnly: boolean
  label?: string
  // 0 is allowed (a step that happens right away).
  allowZero?: boolean
  onChange: (mins: number) => void
}) {
  const initial = splitOffset(mins)
  const [unit, setUnit] = useState<OffsetUnit>(initial.unit)
  const [text, setText] = useState(String(initial.value))

  function commit(value: string, nextUnit: OffsetUnit) {
    const amount = Number(value)
    if (value.trim() !== '' && Number.isFinite(amount) && (amount > 0 || (allowZero && amount === 0))) {
      onChange(toOffsetMinutes(amount, nextUnit))
    }
  }

  return (
    <>
      <input
        type="number"
        aria-label={label ?? (after ? 'How long after' : 'How long before')}
        min={allowZero ? 0 : 1}
        step="any"
        value={text}
        disabled={readOnly}
        onChange={(event) => {
          setText(event.target.value)
          commit(event.target.value, unit)
        }}
        onBlur={() => {
          // An empty or unusable box goes back to the value the block really has.
          const amount = Number(text)
          if (text.trim() === '' || !Number.isFinite(amount) || amount < 0 || (amount === 0 && !allowZero)) {
            setText(String(Math.round((mins / toOffsetMinutes(1, unit)) * 100) / 100))
          }
        }}
        className={cn(fieldClass, 'w-20')}
      />
      <select
        aria-label="Unit"
        value={unit}
        disabled={readOnly}
        onChange={(event) => {
          const next = event.target.value as OffsetUnit
          setUnit(next)
          commit(text, next)
        }}
        className={fieldClass}
      >
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
    </>
  )
}

// The settings of the block that is selected on the canvas.
// The picture of a message: choose one, see it, take it away. It is stored in the public bucket and the
// address is kept in the block.
function PictureField({
  url,
  readOnly,
  onChange,
}: {
  url: string | undefined
  readOnly: boolean
  onChange: (url: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) {
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setProblem('Choose a PNG, JPG, WEBP or GIF picture.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProblem('The picture can be up to 5 MB.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      onChange(await uploadFormImageToSupabase(file))
    } catch {
      setProblem("Couldn't upload the picture. Only an admin can add pictures.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">Picture (optional)</p>
      {url ? (
        <div className="flex items-start gap-3">
          <img src={url} alt="Picture sent with this message" className="max-h-28 max-w-[10rem] rounded-lg border border-slate-200" />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-sm font-semibold text-slate-600 hover:text-red-700"
            >
              Remove picture
            </button>
          )}
        </div>
      ) : (
        <input
          type="file"
          aria-label="Add a picture"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={readOnly || busy}
          onChange={(event) => {
            void pick(event.target.files?.[0])
            event.target.value = ''
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold"
        />
      )}
      {busy && <p className="text-xs text-slate-500">Uploading…</p>}
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
      {url && <p className="text-xs text-slate-500">The message text is sent as the caption of the picture.</p>}
    </div>
  )
}

// The words a reply is checked for, typed with commas between them. The text is kept as typed so a comma
// at the end is not lost while the next word is being written.
export function WordsField({
  words,
  readOnly,
  onChange,
}: {
  words: string[]
  readOnly: boolean
  onChange: (words: string[]) => void
}) {
  const [text, setText] = useState(words.join(', '))
  return (
    <input
      type="text"
      aria-label="Words in the reply"
      value={text}
      disabled={readOnly}
      placeholder="for example: 7, seven, 7 years"
      onChange={(event) => {
        setText(event.target.value)
        onChange(
          event.target.value
            .split(/[,\uff0c\u3001]/)
            .map((word) => word.trim())
            .filter((word) => word !== ''),
        )
      }}
      className={cn(fieldClass, 'mt-3 w-full')}
    />
  )
}

export function FlowInspector({
  node,
  trigger,
  classrooms,
  contacts,
  filterOptions,
  graph,
  readOnly,
  onChange,
  onDelete,
}: FlowInspectorProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null)

  if (!node) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        Click a block to change it.
      </p>
    )
  }

  const info = triggerInfo(trigger)

  function insertToken(token: string, current: string) {
    const box = messageRef.current
    const start = box?.selectionStart ?? current.length
    const end = box?.selectionEnd ?? current.length
    onChange({ text: current.slice(0, start) + token + current.slice(end) })
    window.setTimeout(() => {
      box?.focus()
      box?.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  let body
  if (isMessage(node)) {
    const unknown = unknownPlaceholders(node.text)
    const anchor = graph ? (messageAnchors(graph).get(node.id) ?? null) : null
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Message</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Send it</span>
          <OffsetField
            key={node.id}
            mins={node.mins}
            after={anchor !== null || info.afterOnly === true || node.after === true}
            readOnly={readOnly}
            onChange={(mins) => onChange({ mins })}
          />
          {anchor === 'reply' ? (
            <span>after the parent replies</span>
          ) : anchor === 'timeout' ? (
            <span>after the waiting ends (no reply)</span>
          ) : info.afterOnly ? (
            <span>after it happens</span>
          ) : (
            <select
              aria-label="Before or after"
              value={node.after === true ? 'after' : 'before'}
              disabled={readOnly}
              onChange={(event) => onChange({ after: event.target.value === 'after' })}
              className={fieldClass}
            >
              <option value="before">before it starts</option>
              <option value="after">after it starts</option>
            </select>
          )}
        </div>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Send to</span>
          <select
            aria-label="Send to"
            value={typeof node.contactId === 'number' ? String(node.contactId) : ''}
            disabled={readOnly}
            onChange={(event) => onChange({ contactId: event.target.value === '' ? null : Number(event.target.value) })}
            className={cn(fieldClass, 'min-w-0 flex-1')}
          >
            <option value="">The parent of the child</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} · {displayContactPhone(contact)}
              </option>
            ))}
            {typeof node.contactId === 'number' && !contacts.some((contact) => contact.id === node.contactId) && (
              <option value={node.contactId}>A contact that was removed</option>
            )}
          </select>
        </label>
        {typeof node.contactId === 'number' && (
          <p className="mt-1 text-xs text-slate-500">
            This message goes to the contact, not to the family. It still waits for approval in WhatsApp.
          </p>
        )}
        {typeof node.contactId !== 'number' && contacts.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">
            To send to someone else, add a contact in the Contacts box on the Automations page.
          </p>
        )}
        <textarea
          ref={messageRef}
          aria-label="Message"
          value={node.text}
          rows={4}
          disabled={readOnly}
          onChange={(event) => onChange({ text: event.target.value })}
          className={cn(fieldClass, 'mt-3 w-full resize-y')}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Insert:</span>
          {PLACEHOLDERS.map((entry) => (
            <button
              key={entry.token}
              type="button"
              title={entry.hint}
              disabled={readOnly}
              onClick={() => insertToken(entry.token, node.text)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {entry.token}
            </button>
          ))}
        </div>
        {unknown.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            {unknown.join(', ')} will be sent as written. Use the Insert buttons for the details that change.
          </p>
        )}
        <PictureField
          url={node.imageUrl}
          readOnly={readOnly}
          onChange={(url) => onChange({ imageUrl: url === null ? undefined : url })}
        />
        <label className="mt-3 block text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Button message (GoHighLevel workflow id)</span>
          <input
            type="text"
            aria-label="GoHighLevel workflow id"
            value={node.ghlWorkflowId ?? ''}
            disabled={readOnly}
            placeholder="Leave empty to send the text above"
            onChange={(event) => onChange({ ghlWorkflowId: event.target.value.trim() === '' ? undefined : event.target.value.trim() })}
            className={cn(fieldClass, 'mt-1 w-full')}
          />
        </label>
        {node.ghlWorkflowId !== undefined && (
          <p className="mt-1 text-xs text-slate-500">
            The text above is not sent. This starts that GoHighLevel workflow for the parent's Messenger or Instagram
            chat; the buttons are written in the workflow. When the parent presses one, it comes back here as their
            reply, so add a "wait for a reply" block and "reply has the word" blocks with the button titles to carry on.
            The flow must send by itself on Messenger or Instagram.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">Preview</p>
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {previewMessage(node.text) || ' '}
        </p>
      </>
    )
  } else if (isAction(node)) {
    const anchor = graph ? (messageAnchors(graph).get(node.id) ?? null) : null
    const tags = filterOptions.tag
    const people = filterOptions.pic
    const known =
      node.action === 'add_tag'
        ? tags.some((choice) => choice.id === node.value)
        : node.action === 'assign_pic'
          ? people.some((choice) => choice.id === node.value)
          : true
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">{actionLabel(node.action)}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Changes the lead of this family by itself: nothing is sent and nothing waits for approval. A family with
          no lead is left as it is, and the Execution logs say so.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Do it</span>
          <OffsetField
            key={node.id}
            mins={node.mins}
            after={anchor !== null || info.afterOnly === true || node.after === true}
            allowZero
            readOnly={readOnly}
            onChange={(mins) => onChange({ mins })}
          />
          {anchor === 'reply' ? (
            <span>after the parent replies</span>
          ) : anchor === 'timeout' ? (
            <span>after the waiting ends (no reply)</span>
          ) : info.afterOnly ? (
            <span>after it happens</span>
          ) : (
            <select
              aria-label="Before or after"
              value={node.after === true ? 'after' : 'before'}
              disabled={readOnly}
              onChange={(event) => onChange({ after: event.target.value === 'after' })}
              className={fieldClass}
            >
              <option value="before">before it starts</option>
              <option value="after">after it starts</option>
            </select>
          )}
        </div>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>
            {node.action === 'add_tag' ? 'Tag' : node.action === 'assign_pic' ? 'PIC' : 'Move the lead to'}
          </span>
          <select
            aria-label={node.action === 'add_tag' ? 'Tag to add' : node.action === 'assign_pic' ? 'PIC to assign' : 'Stage'}
            value={node.value}
            disabled={readOnly}
            onChange={(event) => onChange({ value: event.target.value })}
            className={cn(fieldClass, 'min-w-0 flex-1')}
          >
            <option value="">Choose…</option>
            {node.action === 'add_tag' &&
              tags.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            {node.action === 'assign_pic' &&
              people.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            {node.action === 'set_stage' &&
              leadStatusOptions
                .filter((option) => SETTABLE_STAGES.includes(option.key))
                .map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
            {!known && node.value !== '' && <option value={node.value}>A choice that was removed</option>}
          </select>
        </label>
        {node.action === 'set_stage' && (
          <p className="mt-1 text-xs text-slate-500">
            “Converted” is not offered: a lead is converted by a person, because that makes the student.
          </p>
        )}
        {node.action === 'add_tag' && tags.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">There are no tags yet. Add one on the Leads page first.</p>
        )}
      </>
    )
  } else if (node.kind === 'wait') {
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Wait for a reply</h3>
        <p className="mt-1 text-xs text-slate-500">
          Starts when the message before it has been sent. If the parent writes back in time, the flow follows
          the Yes line; if they stay quiet until the time runs out, it follows No.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Wait up to</span>
          <OffsetField
            key={node.id}
            mins={node.mins}
            after
            label="How long to wait"
            readOnly={readOnly}
            onChange={(mins) => onChange({ mins })}
          />
        </div>
      </>
    )
  } else if (node.kind === 'reply') {
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">What the reply says</h3>
        <p className="mt-1 text-xs text-slate-500">
          Type words separated by commas (up to {MAX_REPLY_WORDS}). If the reply has any of them, in any capital
          letters, the flow follows Yes; otherwise No.
        </p>
        <WordsField key={node.id} words={node.words} readOnly={readOnly} onChange={(words) => onChange({ words })} />
      </>
    )
  } else if (node.kind === 'age') {
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Age</h3>
        <p className="mt-1 text-xs text-slate-500">
          Children in this age range follow the Yes line; everyone else, and children with no age saved, follow No.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>From</span>
          <input
            type="number"
            aria-label="Lowest age"
            min={0}
            max={30}
            placeholder="any"
            value={node.min ?? ''}
            disabled={readOnly}
            onChange={(event) => onChange({ min: event.target.value === '' ? null : Number(event.target.value) })}
            className={cn(fieldClass, 'w-20')}
          />
          <span>to</span>
          <input
            type="number"
            aria-label="Highest age"
            min={0}
            max={30}
            placeholder="any"
            value={node.max ?? ''}
            disabled={readOnly}
            onChange={(event) => onChange({ max: event.target.value === '' ? null : Number(event.target.value) })}
            className={cn(fieldClass, 'w-20')}
          />
        </div>
      </>
    )
  } else if (node.kind === 'hours') {
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Lessons left</h3>
        <p className="mt-1 text-xs text-slate-500">
          Children with this many lesson hours left, or fewer, follow the Yes line; everyone else follows No. Only
          children (not leads) have lessons.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <input
            type="number"
            aria-label="Hours left"
            min={0}
            max={500}
            value={node.max}
            disabled={readOnly}
            onChange={(event) => onChange({ max: Number(event.target.value) })}
            className={cn(fieldClass, 'w-24')}
          />
          <span>hours left or fewer</span>
        </div>
      </>
    )
  } else if (node.kind === 'stage') {
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Lead stage</h3>
        <p className="mt-1 text-xs text-slate-500">
          Leads in a ticked stage, at the moment the message is due, follow the Yes line; everyone else follows No.
        </p>
        <fieldset className="mt-3 grid gap-1 sm:grid-cols-2" disabled={readOnly}>
          {leadStatusOptions.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={node.stages.includes(option.key)}
                onChange={(event) =>
                  onChange({
                    stages: event.target.checked
                      ? [...node.stages, option.key]
                      : node.stages.filter((stage) => stage !== option.key),
                  })
                }
                className="h-4 w-4 accent-[#fc0c97]"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </>
    )
  } else if (isChoiceCondition(node)) {
    const copy = {
      source: { title: 'Source', plural: 'sources', hint: 'Leads that came from a ticked source follow the Yes line; everyone else follows No.' },
      tag: { title: 'Tag', plural: 'tags', hint: 'Leads with any ticked tag follow the Yes line; everyone else follows No.' },
      pic: { title: 'PIC', plural: 'people in charge', hint: 'Leads handled by a ticked person follow the Yes line; everyone else follows No.' },
      form: { title: 'Form', plural: 'forms', hint: 'Leads who filled in a ticked form follow the Yes line; everyone else follows No.' },
      keyword: {
        title: 'Source keyword',
        plural: 'source keywords',
        hint: 'Leads that came in with a ticked source keyword (the phrase in their first WhatsApp message) follow the Yes line; everyone else follows No.',
      },
    }[node.kind]
    // A ticked choice that was deleted stays in the list so it can be unticked.
    const known = filterOptions[node.kind]
    const choices = [
      ...known,
      ...node.ids.filter((id) => !known.some((choice) => choice.id === id)).map((id) => ({ id, label: 'A removed choice' })),
    ]
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">{copy.title}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {copy.hint} A family\’s child is checked through the parent\’s lead.
        </p>
        <fieldset className="mt-3 grid gap-1 sm:grid-cols-2" disabled={readOnly}>
          {choices.length === 0 && <p className="text-sm text-slate-500">No {copy.plural} yet.</p>}
          {choices.map((choice) => (
            <label key={choice.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={node.ids.includes(choice.id)}
                onChange={(event) =>
                  onChange({
                    ids: event.target.checked ? [...node.ids, choice.id] : node.ids.filter((id) => id !== choice.id),
                  })
                }
                className="h-4 w-4 accent-[#fc0c97]"
              />
              <span className="truncate">{choice.label}</span>
            </label>
          ))}
        </fieldset>
      </>
    )
  } else if (node.kind === 'classroom') {
    const category = info.classroomCategory
    const options = classrooms.filter(
      (room) =>
        node.ids.includes(room.id) || (room.status === 'active' && (category === null || room.category === category)),
    )
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Class</h3>
        <p className="mt-1 text-xs text-slate-500">
          Children in a ticked class follow the Yes line; everyone else follows No.
          {category === null && ' This kind of event has no class, so everyone follows No.'}
        </p>
        <fieldset className="mt-3 grid gap-1 sm:grid-cols-2" disabled={readOnly}>
          {options.length === 0 && <p className="text-sm text-slate-500">No classes of this kind yet.</p>}
          {options.map((room) => (
            <label key={room.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={node.ids.includes(room.id)}
                onChange={(event) =>
                  onChange({
                    ids: event.target.checked ? [...node.ids, room.id] : node.ids.filter((id) => id !== room.id),
                  })
                }
                className="h-4 w-4 accent-[#fc0c97]"
              />
              <span className="truncate">{room.name}</span>
            </label>
          ))}
        </fieldset>
      </>
    )
  }

  return (
    <div>
      {body}
      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-4 flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-red-700"
        >
          <Trash size={14} aria-hidden="true" />
          Delete block
        </button>
      )}
    </div>
  )
}
