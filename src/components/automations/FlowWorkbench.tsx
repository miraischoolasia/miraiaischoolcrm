import { Flag, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  TRIGGERS,
  TRIGGER_ID,
  triggerInfo,
  type FilterOptions,
  type FlowDraft,
  type FlowNode,
  type FlowSettings,
  type FlowTrigger,
} from '../../lib/automationFlows'
import type { AutomationContact } from '../../lib/automationContacts'
import type { Classroom } from '../../types/domain'
import { FlowInspector } from './FlowInspector'
import { FlowSettingsCard } from './FlowSettingsCard'

type FlowWorkbenchProps = {
  draft: FlowDraft
  // The card that was clicked on the canvas: the trigger (TRIGGER_ID) or one block.
  selectedId: string
  selectedNode: FlowNode | null
  classrooms: Classroom[]
  contacts: AutomationContact[]
  filterOptions: FilterOptions
  readOnly: boolean
  onTriggerChange: (trigger: FlowTrigger) => void
  onSettingsChange: (change: FlowSettings) => void
  onClose: () => void
  onNodeChange: (id: string, change: Record<string, unknown>) => void
  onNodeDelete: (id: string) => void
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// The panel on the left. It is only there while a card on the canvas is selected, and it shows that
// card's settings: when the flow starts, or one block.
export function FlowWorkbench({
  draft,
  selectedId,
  selectedNode,
  classrooms,
  contacts,
  filterOptions,
  readOnly,
  onTriggerChange,
  onSettingsChange,
  onClose,
  onNodeChange,
  onNodeDelete,
}: FlowWorkbenchProps) {
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      <X size={14} aria-hidden="true" />
      Close
    </button>
  )

  if (selectedId === TRIGGER_ID) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{closeButton}</div>
        <section className="space-y-2">
          <h3 className="rounded-lg bg-[#fff1f8] px-3 py-2 text-sm font-semibold text-[#be185d]">When…</h3>
          <select
            aria-label="When"
            value={draft.trigger}
            disabled={readOnly}
            onChange={(event) => onTriggerChange(event.target.value as FlowTrigger)}
            className={cn(fieldClass, 'w-full')}
          >
            {TRIGGERS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Flag size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            Every time {triggerInfo(draft.trigger).phrase}, the family walks through this flow.
          </p>
        </section>

        <FlowSettingsCard settings={draft.graph.settings} readOnly={readOnly} onChange={onSettingsChange} />
      </div>
    )
  }

  if (!selectedNode) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{closeButton}</div>
      <FlowInspector
        node={selectedNode}
        trigger={draft.trigger}
        classrooms={classrooms}
        contacts={contacts}
        filterOptions={filterOptions}
        readOnly={readOnly}
        onChange={(change) => onNodeChange(selectedNode.id, change)}
        onDelete={() => onNodeDelete(selectedNode.id)}
      />
    </div>
  )
}
