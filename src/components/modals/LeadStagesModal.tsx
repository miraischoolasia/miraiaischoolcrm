import { useState } from 'react'
import { CaretDown, CaretUp, Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { FlowSwitch } from '../automations/FlowSwitch'
import { useConfirm } from '../../hooks/useConfirm'
import type { LeadStagesState } from '../../hooks/useLeadStages'
import { cn } from '../../lib/cn'
import {
  MAX_STAGE_LABEL,
  MAX_STAGES,
  REQUIRED_STAGE_KEYS,
  STAGE_COLOR_KEYS,
  STAGE_COLORS,
  type LeadStage,
  type StageColor,
} from '../../lib/leadStages'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50'

type LeadStagesModalProps = {
  state: LeadStagesState
  onClose: () => void
}

// The stages leads go through: add as many as the school needs, rename, colour and order them. The six the
// CRM was made with stay (the automatic moves use them); the optional ones can be turned off.
export function LeadStagesModal({ state, onClose }: LeadStagesModalProps) {
  const { confirm, dialog } = useConfirm()
  const [problem, setProblem] = useState<string | null>(null)

  async function run(action: Promise<string | null>) {
    setProblem(await action)
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Leads</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Stages</h2>
            <p className="mt-2 text-sm text-slate-500">
              The steps a lead goes through, in this order on the board. Changes save at once.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-modal-body className="max-h-[75vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        {state.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {problem && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {problem}
          </p>
        )}

        <ol className="space-y-2">
          {state.stages.map((stage, index) => (
            <StageRow
              key={stage.key}
              stage={stage}
              first={index === 0}
              last={index === state.stages.length - 1}
              onChange={(edit) => void run(state.change(stage.key, edit))}
              onMove={(step) => void run(state.move(stage.key, step))}
              onDelete={async () => {
                if (!(await confirm(`Delete the stage "${stage.label}"?`, { confirmLabel: 'Delete' }))) {
                  return
                }
                await run(state.remove(stage.key))
              }}
              setProblem={setProblem}
            />
          ))}
        </ol>

        <AddStage
          full={state.stages.length >= MAX_STAGES}
          onAdd={async (label, color) => {
            const failed = await state.add(label, color)
            setProblem(null)
            return failed
          }}
        />
        <p className="text-xs text-slate-500">
          New, Converted and Lost always stay on. Contacted, Trial Scheduled and Trial Completed are moved into by the
          CRM itself (the first reply, a booked trial, a trial class taken): turn one off if you do not use it, and
          the CRM skips it. A stage with leads in it cannot be turned off or deleted until they are moved.
        </p>
      </div>
      {dialog}
    </ModalShell>
  )
}

function StageRow({
  stage,
  first,
  last,
  onChange,
  onMove,
  onDelete,
  setProblem,
}: {
  stage: LeadStage
  first: boolean
  last: boolean
  onChange: (edit: { label?: string; color?: StageColor; isActive?: boolean }) => void
  onMove: (step: -1 | 1) => void
  onDelete: () => void
  setProblem: (text: string | null) => void
}) {
  const [label, setLabel] = useState(stage.label)
  const required = REQUIRED_STAGE_KEYS.includes(stage.key)

  function commitLabel() {
    if (label.trim() === stage.label) {
      setLabel(stage.label)
      return
    }
    onChange({ label })
  }

  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2', !stage.isActive && 'opacity-60')}>
      <span aria-hidden="true" className={cn('h-3 w-3 shrink-0 rounded-full', STAGE_COLORS[stage.color].dot)} />
      <input
        value={label}
        maxLength={MAX_STAGE_LABEL}
        aria-label={`Name of ${stage.label}`}
        onChange={(event) => {
          setLabel(event.target.value)
          setProblem(null)
        }}
        onBlur={commitLabel}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        className={`${fieldClass} min-w-[140px] flex-1`}
      />
      <select
        aria-label={`Colour of ${stage.label}`}
        value={stage.color}
        onChange={(event) => onChange({ color: event.target.value as StageColor })}
        className={`${fieldClass} w-28`}
      >
        {STAGE_COLOR_KEYS.map((key) => (
          <option key={key} value={key}>
            {STAGE_COLORS[key].name}
          </option>
        ))}
      </select>
      <span className="flex shrink-0 items-center gap-1">
        {!required && (
          <FlowSwitch
            checked={stage.isActive}
            label={`${stage.label} is on`}
            onChange={() => onChange({ isActive: !stage.isActive })}
          />
        )}
        <button
          type="button"
          aria-label={`Move ${stage.label} up`}
          disabled={first}
          onClick={() => onMove(-1)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
        >
          <CaretUp size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Move ${stage.label} down`}
          disabled={last}
          onClick={() => onMove(1)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-40"
        >
          <CaretDown size={14} aria-hidden="true" />
        </button>
        {!stage.isSystem && (
          <button type="button" aria-label={`Delete ${stage.label}`} onClick={onDelete} className="rounded-lg p-1.5 text-slate-600 hover:bg-white">
            <Trash size={14} aria-hidden="true" />
          </button>
        )}
      </span>
    </li>
  )
}

function AddStage({ full, onAdd }: { full: boolean; onAdd: (label: string, color: StageColor) => Promise<string | null> }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<StageColor>('pink')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const failed = await onAdd(label, color)
    setSaving(false)
    setProblem(failed)
    if (!failed) {
      setLabel('')
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="space-y-1 border-t border-slate-100 pt-4"
    >
      <p className="text-sm font-semibold text-slate-800">Add a stage</p>
      <div className="flex flex-wrap items-start gap-2">
        <label className="min-w-[160px] flex-1">
          <span className="sr-only">Name of the new stage</span>
          <input
            value={label}
            maxLength={MAX_STAGE_LABEL}
            placeholder="Name, e.g. Placement test done"
            onChange={(event) => {
              setLabel(event.target.value)
              setProblem(null)
            }}
            className={fieldClass}
          />
        </label>
        <label>
          <span className="sr-only">Colour of the new stage</span>
          <select value={color} onChange={(event) => setColor(event.target.value as StageColor)} className={`${fieldClass} w-28`}>
            {STAGE_COLOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {STAGE_COLORS[key].name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving || full}
          className="flex items-center gap-1 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          {saving ? 'Adding…' : 'Add stage'}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-red-700">
          {problem}
        </p>
      )}
    </form>
  )
}
