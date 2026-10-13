import { useState } from 'react'
import { ChatCircleText, Funnel, Lightning, Plus, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  TRIGGERS,
  describeNode,
  describeOffset,
  previewMessage,
  triggerInfo,
  type ChoiceKind,
  type ConditionNode,
  type FilterOptions,
  type FlowDraft,
  type FlowGraph,
  type FlowTrigger,
  type MessageNode,
  type NewBlockKind,
} from '../../lib/automationFlows'
import {
  TRIGGER_GROUPS,
  addFilter,
  addMessageStep,
  removeFilter,
  removeMessageStep,
  type FlowParts,
} from '../../lib/flowSteps'
import type { AutomationContact } from '../../lib/automationContacts'
import type { Classroom } from '../../types/domain'
import { FlowInspector } from './FlowInspector'

type SimpleBuilderProps = {
  draft: FlowDraft
  parts: FlowParts
  classrooms: Classroom[]
  contacts: AutomationContact[]
  filterOptions: FilterOptions
  classroomName: (id: number) => string
  contactName: (id: number) => string
  choiceName: (kind: ChoiceKind, id: string) => string
  readOnly: boolean
  onTriggerChange: (trigger: FlowTrigger) => void
  onGraphChange: (graph: FlowGraph) => void
  onNodeChange: (id: string, change: Record<string, unknown>) => void
}

const FILTER_KINDS: { kind: Exclude<NewBlockKind, 'message'>; label: string; hint: string }[] = [
  { kind: 'source', label: 'Source', hint: 'Where the lead came from' },
  { kind: 'tag', label: 'Tag', hint: 'Leads with a tag' },
  { kind: 'form', label: 'Form', hint: 'Filled in a form' },
  { kind: 'keyword', label: 'Source keyword', hint: 'The phrase in their first message' },
  { kind: 'age', label: 'Age', hint: 'How old the child is' },
  { kind: 'stage', label: 'Lead stage', hint: 'New, Contacted, ...' },
  { kind: 'pic', label: 'PIC', hint: 'Who handles the lead' },
  { kind: 'classroom', label: 'Class', hint: 'Which class' },
  { kind: 'hours', label: 'Lessons left', hint: 'Nearly out of lessons' },
]

// "A lead comes in from a source" is the new-lead trigger with a Source filter in front. It is shown as
// one choice in the picker so nobody has to know that.
const FROM_SOURCE = 'lead_from_source'
// Likewise "a lead comes in with a source keyword": the new-lead trigger with a Source keyword filter.
const FROM_KEYWORD = 'lead_from_keyword'

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fff1f8] text-xs font-bold text-[#be185d]">
      {n}
    </span>
  )
}

// A flow as three plain steps: when it starts, who it is for, and what is sent and when. The same flow
// the canvas draws, written the way a person would say it.
export function SimpleBuilder({
  draft,
  parts,
  classrooms,
  contacts,
  filterOptions,
  classroomName,
  contactName,
  choiceName,
  readOnly,
  onTriggerChange,
  onGraphChange,
  onNodeChange,
}: SimpleBuilderProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [pickingFilter, setPickingFilter] = useState(false)
  const info = triggerInfo(draft.trigger)

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id))
  }

  function addMessage() {
    const result = addMessageStep(draft.graph, draft.trigger)
    onGraphChange(result.graph)
    setOpenId(result.id)
  }

  const sourceFilter = parts.filters.find((filter) => filter.kind === 'source')
  const keywordFilter = parts.filters.find((filter) => filter.kind === 'keyword')
  const triggerValue =
    draft.trigger === 'lead_created' && keywordFilter
      ? FROM_KEYWORD
      : draft.trigger === 'lead_created' && sourceFilter
        ? FROM_SOURCE
        : draft.trigger

  function changeWhen(value: string) {
    if (value !== FROM_SOURCE && value !== FROM_KEYWORD) {
      onTriggerChange(value as FlowTrigger)
      return
    }
    // The filter first, then the trigger, so the trigger change sees the filter in the flow.
    if (value === FROM_SOURCE && !sourceFilter) {
      addFilterOf('source')
    }
    if (value === FROM_KEYWORD && !keywordFilter) {
      addFilterOf('keyword')
    }
    onTriggerChange('lead_created')
  }

  function addFilterOf(kind: Exclude<NewBlockKind, 'message'>) {
    const before = new Set(parts.filters.map((filter) => filter.id))
    const graph = addFilter(draft.graph, kind)
    onGraphChange(graph)
    const added = graph.nodes.find((node) => node.type === 'condition' && !before.has(node.id))
    setPickingFilter(false)
    if (added) {
      setOpenId(added.id)
    }
  }

  // The editor puts the list back in time order when a time was changed.
  const changeNode = onNodeChange

  function timeLabel(message: MessageNode) {
    const side = info.afterOnly || message.after === true ? 'after' : 'before'
    return `${describeOffset(message.mins)} ${side} ${info.phrase.replace(/ \(the task is \{class\}\)$/, '')}`
  }

  const filterCard = (filter: ConditionNode) => {
    const open = openId === filter.id
    return (
      <li key={filter.id} className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-1 px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => toggle(filter.id)}
            className="min-w-0 flex-1 text-left text-sm font-semibold text-slate-900"
          >
            {describeNode(filter, classroomName, contactName, choiceName)}
          </button>
          {!readOnly && (
            <button
              type="button"
              aria-label="Remove this filter"
              onClick={() => onGraphChange(removeFilter(draft.graph, filter.id))}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        {open && (
          <div className="border-t border-slate-100 px-3 py-3">
            <FlowInspector
              node={filter}
              trigger={draft.trigger}
              classrooms={classrooms}
              contacts={contacts}
              filterOptions={filterOptions}
              readOnly={readOnly}
              onChange={(change) => changeNode(filter.id, change)}
              onDelete={() => onGraphChange(removeFilter(draft.graph, filter.id))}
            />
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. When */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <StepNumber n={1} />
          <h2 className="text-sm font-bold text-slate-900">When this happens</h2>
        </div>
        <div className="ml-8 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <Lightning size={18} weight="fill" className="shrink-0 text-[#fc0c97]" aria-hidden="true" />
            <select
              aria-label="When"
              value={triggerValue}
              disabled={readOnly}
              onChange={(event) => changeWhen(event.target.value)}
              className={cn(fieldClass, 'w-full')}
            >
              {TRIGGER_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.keys[0] === 'lead_created' && (
                    <option value={FROM_SOURCE}>A lead comes in from a source</option>
                  )}
                  {group.keys[0] === 'lead_created' && (
                    <option value={FROM_KEYWORD}>A lead comes in with a source keyword</option>
                  )}
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {TRIGGERS.find((entry) => entry.key === key)?.label ?? key}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Starts every time {info.phrase}.
            {triggerValue === FROM_SOURCE && ' Tick the sources under "Who it is for".'}
            {triggerValue === FROM_KEYWORD && ' Tick the source keywords under "Who it is for".'}
          </p>
        </div>
      </section>

      {/* 2. Only for */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <StepNumber n={2} />
          <h2 className="text-sm font-bold text-slate-900">Who it is for</h2>
        </div>
        <div className="ml-8 space-y-2">
          {parts.filters.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Funnel size={16} aria-hidden="true" />
              Everyone. Add a filter to narrow it down.
            </p>
          ) : (
            <ul className="space-y-2">{parts.filters.map(filterCard)}</ul>
          )}
          {!readOnly && (
            <div className="relative">
              <button
                type="button"
                aria-expanded={pickingFilter}
                onClick={() => setPickingFilter((value) => !value)}
                className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                Add a filter
              </button>
              {pickingFilter && (
                <ul
                  role="menu"
                  aria-label="Filters"
                  className="absolute left-0 top-11 z-10 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                  {FILTER_KINDS.map((entry) => (
                    <li key={entry.kind} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => addFilterOf(entry.kind)}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50"
                      >
                        <span className="block text-sm font-semibold text-slate-900">{entry.label}</span>
                        <span className="block text-xs text-slate-500">{entry.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 3. Then send */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <StepNumber n={3} />
          <h2 className="text-sm font-bold text-slate-900">Then send</h2>
        </div>
        <div className="ml-8">
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
            {parts.messages.length === 0 && (
              <li className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No message yet. Add the first one.
              </li>
            )}
            {parts.messages.map((message) => {
              const open = openId === message.id
              return (
                <li key={message.id} className="relative rounded-xl border border-slate-200 bg-white">
                  <span
                    className="absolute -left-[25px] top-4 size-3 rounded-full border-2 border-white bg-[#fc0c97]"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(message.id)}
                    className="block w-full px-3 py-2.5 text-left"
                  >
                    <span className="block text-xs font-semibold text-[#be185d]">
                      {timeLabel(message)}
                      {typeof message.contactId === 'number' ? ` · to ${contactName(message.contactId)}` : ''}
                    </span>
                    <span className="mt-1 flex items-start gap-1.5 text-sm text-slate-800">
                      <ChatCircleText size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="line-clamp-2 whitespace-pre-wrap">
                        {message.text.trim() === '' ? 'Write the message' : previewMessage(message.text)}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 px-3 py-3">
                      <FlowInspector
                        node={message}
                        trigger={draft.trigger}
                        classrooms={classrooms}
                        contacts={contacts}
                        filterOptions={filterOptions}
                        readOnly={readOnly}
                        onChange={(change) => changeNode(message.id, change)}
                        onDelete={() => onGraphChange(removeMessageStep(draft.graph, message.id))}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {!readOnly && (
            <button
              type="button"
              onClick={addMessage}
              className="mt-3 flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              Add a message
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
