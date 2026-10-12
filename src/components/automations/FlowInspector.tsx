import { useRef } from 'react'
import { Trash } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  PLACEHOLDERS,
  isMessage,
  previewMessage,
  splitOffset,
  toOffsetMinutes,
  triggerInfo,
  unknownPlaceholders,
  type FlowNode,
  type FlowTrigger,
  type OffsetUnit,
} from '../../lib/automationFlows'
import type { Classroom } from '../../types/domain'

type FlowInspectorProps = {
  node: FlowNode | null
  trigger: FlowTrigger
  classrooms: Classroom[]
  readOnly: boolean
  onChange: (change: Record<string, unknown>) => void
  onDelete: () => void
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// The settings of the block that is selected on the canvas.
export function FlowInspector({ node, trigger, classrooms, readOnly, onChange, onDelete }: FlowInspectorProps) {
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
    const offset = splitOffset(node.mins)
    const unknown = unknownPlaceholders(node.text)
    body = (
      <>
        <h3 className="text-sm font-semibold text-slate-900">Message</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Send it</span>
          <input
            type="number"
            aria-label="How long before"
            min={1}
            value={offset.value}
            disabled={readOnly}
            onChange={(event) => onChange({ mins: toOffsetMinutes(Number(event.target.value) || 0, offset.unit) })}
            className={cn(fieldClass, 'w-20')}
          />
          <select
            aria-label="Unit"
            value={offset.unit}
            disabled={readOnly}
            onChange={(event) => onChange({ mins: toOffsetMinutes(offset.value, event.target.value as OffsetUnit) })}
            className={fieldClass}
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span>before it starts</span>
        </div>
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
        <p className="mt-3 text-xs text-slate-500">Preview</p>
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {previewMessage(node.text) || ' '}
        </p>
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
  } else {
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
