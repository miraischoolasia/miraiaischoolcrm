import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Trash } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  EMPTY_FILTER_OPTIONS,
  EMPTY_TEST,
  TRIGGER_ID,
  addNodeAfter,
  describeNode,
  draftOf,
  isMessage,
  isTesting,
  newFlowDraft,
  removeNode,
  sendAfterOnly,
  simulateFlow,
  testChildOf,
  triggerInfo,
  unreachableMessages,
  updateNode,
  updateSettings,
  type AutomationFlow,
  type FlowDraft,
  type ChoiceKind,
  type FilterOptions,
  type FlowGraph,
  type FlowPort,
  type FlowSettings,
  type FlowTestChild,
  type FlowTrigger,
  type NewBlockKind,
  type TestInputs,
} from '../../lib/automationFlows'
import type { AutomationContact } from '../../lib/automationContacts'
import type { Classroom } from '../../types/domain'
import { analyzeFlow, reorderMessages } from '../../lib/flowSteps'
import { ActionPicker } from './ActionPicker'
import { FlowActivity } from './FlowActivity'
import { FlowCanvas } from './FlowCanvas'
import { FlowSettingsCard } from './FlowSettingsCard'
import { FlowSwitch } from './FlowSwitch'
import { FlowTester } from './FlowTester'
import { SimpleBuilder } from './SimpleBuilder'
import { useFlowActivity } from '../../hooks/useFlowActivity'
import { FlowWorkbench } from './FlowWorkbench'

type EditorTab = 'builder' | 'settings' | 'enrollments' | 'logs'

const TABS: Array<{ key: EditorTab; label: string }> = [
  { key: 'builder', label: 'Builder' },
  { key: 'settings', label: 'Settings' },
  { key: 'enrollments', label: 'Enrollment history' },
  { key: 'logs', label: 'Execution logs' },
]

type FlowEditorProps = {
  // null starts a new flow.
  flow: AutomationFlow | null
  // A flow that is already written to start from (only for a new flow).
  startFrom?: FlowDraft | null
  classrooms: Classroom[]
  // The saved contacts a message can be sent to instead of the family.
  contacts: AutomationContact[]
  // Only an admin can change a flow.
  canEdit: boolean
  // Every automation is paused (the switch on the Automations page).
  paused?: boolean
  // What the source, tag, PIC and form blocks can tick.
  filterOptions?: FilterOptions
  onSave: (draft: FlowDraft) => Promise<{ error: string | null; flow: AutomationFlow | null }>
  onDelete: (id: number) => Promise<string | null>
  // Queues this flow's messages for a pretend child to the given number, for approval in WhatsApp.
  onSendTest: (
    flowId: number,
    phone: string,
    child: FlowTestChild,
  ) => Promise<{ queued: number; error: string | null }>
  onSaved: (flow: AutomationFlow) => void
  onDeleted: () => void
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}

// One flow: the canvas takes the whole width, and clicking a card opens that card's settings in a
// panel on the left. Every card has a "+" for adding the next step after it.
export function FlowEditor({
  flow,
  startFrom = null,
  classrooms,
  contacts,
  canEdit,
  paused = false,
  filterOptions = EMPTY_FILTER_OPTIONS,
  onSave,
  onDelete,
  onSendTest,
  onSaved,
  onDeleted,
  onBack,
  onDirtyChange,
}: FlowEditorProps) {
  const [draft, setDraft] = useState<FlowDraft>(() => (flow ? draftOf(flow) : (startFrom ?? newFlowDraft())))
  // The simple list is the way in; a flow with Yes/No branches is only drawn by the canvas.
  const [view, setView] = useState<'simple' | 'advanced'>(() => {
    const first = flow ? draftOf(flow) : (startFrom ?? newFlowDraft())
    return analyzeFlow(first.graph).simple ? 'simple' : 'advanced'
  })
  // A recipe is a flow that is not saved yet, so it starts as changed.
  const [baseline, setBaseline] = useState(() => (flow ? JSON.stringify(draft) : JSON.stringify(newFlowDraft())))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The exit whose "+" was pressed: the panel on the right lists the steps that can be added there.
  const [adding, setAdding] = useState<{ from: string; port: FlowPort } | null>(null)
  // The "Try it with a child" panel on the right (it takes the place of the list of steps to add).
  const [testOpen, setTestOpen] = useState(false)
  const [test, setTest] = useState<TestInputs>(EMPTY_TEST)
  const [tryOpen, setTryOpen] = useState(false)
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [tab, setTab] = useState<EditorTab>('builder')
  const panelRef = useRef<HTMLElement>(null)
  const historyOpen = tab === 'enrollments' || tab === 'logs'
  const activity = useFlowActivity(flow?.id ?? null, historyOpen)

  // On a phone the panel sits under the canvas; bring it into view when a card is picked.
  useEffect(() => {
    if (selectedId !== null && window.matchMedia?.('(max-width: 767px)').matches) {
      panelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

  const dirty = JSON.stringify(draft) !== baseline
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const classroomName = useMemo(() => {
    const names = new Map(classrooms.map((room) => [room.id, room.name]))
    return (id: number) => names.get(id) ?? `Class ${id}`
  }, [classrooms])

  const contactName = useMemo(() => {
    const names = new Map(contacts.map((contact) => [contact.id, contact.name]))
    return (id: number) => names.get(id) ?? 'a removed contact'
  }, [contacts])

  // The name of a ticked source, tag, PIC or form, for the cards on the canvas.
  const choiceName = useMemo(() => {
    return (kind: ChoiceKind, id: string) =>
      filterOptions[kind].find((choice) => choice.id.toLowerCase() === id.toLowerCase())?.label ?? 'a removed choice'
  }, [filterOptions])

  const readOnly = !canEdit || isWorking
  const selectedNode = draft.graph.nodes.find((node) => node.id === selectedId) ?? null
  // The panel on the left is there only while a card is selected.
  const panelOpen = selectedId === TRIGGER_ID || selectedNode !== null

  const testing = isTesting(test)
  const outcome = useMemo(() => simulateFlow(draft.graph, testChildOf(test)), [draft.graph, test])
  const showTest = testing && testOpen
  const highlight = useMemo(
    () => (showTest ? { nodes: outcome.nodes, edges: outcome.edges } : null),
    [showTest, outcome],
  )
  const loose = useMemo(() => unreachableMessages(draft.graph), [draft.graph])
  const analysis = useMemo(() => analyzeFlow(draft.graph), [draft.graph])

  const setGraph = useCallback((graph: FlowGraph) => {
    setDraft((current) => ({ ...current, graph }))
    setNotice(null)
  }, [])

  function changeTrigger(trigger: FlowTrigger) {
    // A lead that was just added can only be messaged after it, so every message goes after.
    const afterOnly = triggerInfo(trigger).afterOnly
    setDraft((current) => ({
      ...current,
      trigger,
      graph: afterOnly ? sendAfterOnly(current.graph) : current.graph,
    }))
    setNotice(null)
  }

  // The "+" after a card: the new block opens in the panel so it can be filled in straight away.
  function addAfter(from: string, port: FlowPort, kind: NewBlockKind) {
    if (readOnly) {
      return
    }
    const result = addNodeAfter(draft.graph, from, port, kind)
    if (result.id === null) {
      return
    }
    setGraph(triggerInfo(draft.trigger).afterOnly ? sendAfterOnly(result.graph) : result.graph)
    setAdding(null)
    setSelectedId(result.id)
  }

  // The "+" opens the list of steps on the right; the settings panel on the left makes room for it.
  function chooseWhereToAdd(target: { from: string; port: FlowPort } | null) {
    setAdding(target)
    if (target !== null) {
      setSelectedId(null)
      setTestOpen(false)
    }
  }

  function toggleTest() {
    const open = !testOpen
    setTestOpen(open)
    if (open) {
      setAdding(null)
      setSelectedId(null)
    }
  }

  // Tells where the new step goes, for the heading of the list.
  function addingWhere(target: { from: string; port: FlowPort }) {
    if (target.from === TRIGGER_ID) {
      return 'It goes right after the trigger.'
    }
    const from = draft.graph.nodes.find((node) => node.id === target.from)
    if (from && !isMessage(from)) {
      const asked = from.kind === 'wait'
      const side = target.port === 'yes' ? (asked ? 'Replied' : 'Yes') : asked ? 'No reply' : 'No'
      return `It goes on the “${side}” side of “${describeNode(from, classroomName, undefined, choiceName)}”.`
    }
    return 'It goes right after this message.'
  }

  async function save() {
    setIsWorking(true)
    setNotice(null)
    const result = await onSave(draft)
    setIsWorking(false)
    if (result.error || !result.flow) {
      setNotice({ text: result.error ?? "Couldn't save the flow.", isError: true })
      return
    }
    const saved = draftOf(result.flow)
    setDraft(saved)
    setBaseline(JSON.stringify(saved))
    setNotice({
      text: saved.enabled ? 'Saved. This flow is checked every minute.' : 'Saved. This flow is off, so it will not run.',
      isError: false,
    })
    onSaved(result.flow)
  }

  async function remove() {
    if (draft.id === null) {
      return
    }
    setIsWorking(true)
    const problem = await onDelete(draft.id)
    setIsWorking(false)
    setConfirmingDelete(false)
    if (problem) {
      setNotice({ text: problem, isError: true })
      return
    }
    onDeleted()
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white md:h-[calc(100vh-170px)] md:min-h-[620px]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Automations
        </button>
        <input
          type="text"
          aria-label="Flow name"
          value={draft.name}
          disabled={readOnly}
          maxLength={80}
          placeholder="Name this flow"
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value })
            setNotice(null)
          }}
          className="min-w-[180px] flex-1 rounded-lg border border-transparent px-2 py-1.5 text-base font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-[#fc0c97] disabled:bg-transparent md:max-w-[360px]"
        />
        {tab === 'builder' && (
        <span role="group" aria-label="Editor" className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
          {(['simple', 'advanced'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={view === choice}
              onClick={() => setView(choice)}
              className={cn(
                'rounded-md px-2.5 py-1',
                view === choice ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {choice === 'simple' ? 'Simple' : 'Advanced'}
            </button>
          ))}
        </span>
        )}
        <span className="flex items-center">
          <FlowSwitch
            checked={draft.enabled}
            disabled={readOnly}
            label="Flow on or off"
            onChange={() => {
              setDraft({ ...draft, enabled: !draft.enabled })
              setNotice(null)
            }}
          />
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-bold',
              draft.enabled ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500',
            )}
          >
            {draft.enabled ? 'LIVE' : 'OFF'}
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <span className={cn('text-sm', dirty ? 'font-semibold text-amber-700' : 'text-slate-500')}>
            {dirty ? 'Unsaved changes' : draft.id === null ? 'Not saved yet' : 'Saved'}
          </span>
          {canEdit && draft.id !== null && (
            <>
              {confirmingDelete ? (
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  Delete this flow?
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => void remove()}
                    className="font-semibold text-red-700 hover:underline"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="font-semibold text-slate-600 hover:underline"
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-red-700"
                >
                  <Trash size={14} aria-hidden="true" />
                  Delete flow
                </button>
              )}
            </>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={isWorking || (!dirty && draft.id !== null)}
              onClick={() => void save()}
              className="rounded-xl bg-[#fc0c97] px-5 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {isWorking ? 'Saving…' : 'Save flow'}
            </button>
          )}
        </span>
      </header>

      <div role="tablist" aria-label="Flow sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => setTab(entry.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold',
              tab === entry.key
                ? 'border-[#fc0c97] text-[#fc0c97]'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(!canEdit || flow?.lastError || (view === 'advanced' && loose.length > 0) || notice) && (
        <div className="space-y-2 border-b border-slate-200 px-4 py-2">
          {!canEdit && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              You can look at this flow. Only an admin can change it.
            </p>
          )}
          {flow?.lastError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              This flow could not run the last time: {flow.lastError}
            </p>
          )}
          {view === 'advanced' && loose.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {loose.length === 1
                ? '1 message is not connected to the trigger, so it will never be sent.'
                : `${loose.length} messages are not connected to the trigger, so they will never be sent.`}{' '}
              Drag a line from a circle to it, or delete it.
            </p>
          )}
          {notice && (
            <p
              role={notice.isError ? 'alert' : 'status'}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
              )}
            >
              {notice.text}
            </p>
          )}
        </div>
      )}

      {tab === 'settings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
          <div className="mx-auto max-w-2xl space-y-4">
            <FlowSettingsCard
              settings={draft.graph.settings}
              readOnly={readOnly}
              onChange={(change: FlowSettings) => setGraph(updateSettings(draft.graph, change))}
            />
            <p className="text-xs text-slate-500">
              Changes here are saved with the flow: press Save flow when you are done.
            </p>
          </div>
        </div>
      ) : historyOpen ? (
        <FlowActivity
          mode={tab === 'enrollments' ? 'enrollments' : 'logs'}
          flow={flow}
          activity={activity.activity}
          paused={paused}
          isLoading={activity.isLoading}
          error={activity.error}
          onReload={() => void activity.reload()}
        />
      ) : view === 'simple' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
          <div className="mx-auto max-w-2xl space-y-6">
            {analysis.simple ? (
              <>
                <SimpleBuilder
                  draft={draft}
                  parts={analysis}
                  classrooms={classrooms}
                  contacts={contacts}
                  filterOptions={filterOptions}
                  classroomName={classroomName}
                  contactName={contactName}
                  choiceName={choiceName}
                  readOnly={readOnly}
                  onTriggerChange={changeTrigger}
                  onGraphChange={setGraph}
                  onNodeChange={(id, change) => {
                    const changed = updateNode(draft.graph, id, change)
                    setGraph('mins' in change || 'after' in change ? reorderMessages(changed) : changed)
                  }}
                />
                <section className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    aria-expanded={tryOpen}
                    onClick={() => setTryOpen((value) => !value)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
                  >
                    Try it with a pretend child
                    <span className="text-xs font-normal text-slate-500">{tryOpen ? 'Close' : 'See what would be sent'}</span>
                  </button>
                  {tryOpen && (
                    <FlowTester
                      classrooms={classrooms}
                      filterOptions={filterOptions}
                      test={test}
                      outcome={outcome}
                      onTest={(change) => setTest((current) => ({ ...current, ...change }))}
                      onClear={() => setTest(EMPTY_TEST)}
                      canSend={canEdit}
                      sendBlockedReason={
                        draft.id === null || dirty ? 'Save the flow first: the test sends the saved version.' : null
                      }
                      onSend={(phone) =>
                        draft.id === null
                          ? Promise.resolve({ queued: 0, error: 'Save the flow first.' })
                          : onSendTest(draft.id, phone, testChildOf(test))
                      }
                    />
                  )}
                </section>
              </>
            ) : (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">This flow is too detailed for the simple view.</p>
                <p>{analysis.reason} It can still be changed in the advanced editor.</p>
                <button
                  type="button"
                  onClick={() => setView('advanced')}
                  className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white"
                >
                  Open the advanced editor
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row">
        {panelOpen && selectedId !== null && (
          <aside
            ref={panelRef}
            className="order-2 w-full shrink-0 border-t border-slate-200 p-4 md:order-1 md:w-[360px] md:overflow-y-auto md:border-r md:border-t-0"
          >
            <FlowWorkbench
              draft={draft}
              selectedId={selectedId}
              selectedNode={selectedNode}
              classrooms={classrooms}
              contacts={contacts}
              filterOptions={filterOptions}
              readOnly={readOnly}
              onSettingsChange={(change: FlowSettings) => setGraph(updateSettings(draft.graph, change))}
              onTriggerChange={changeTrigger}
              onClose={() => setSelectedId(null)}
              onNodeChange={(id, change) => setGraph(updateNode(draft.graph, id, change))}
              onNodeDelete={(id) => {
                setGraph(removeNode(draft.graph, id))
                setSelectedId(null)
              }}
            />
          </aside>
        )}
        <div className="order-1 flex min-w-0 flex-col md:order-2 md:flex-1">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm">
            <button
              type="button"
              aria-expanded={testOpen}
              onClick={toggleTest}
              className={cn(
                'rounded-lg border px-3 py-1.5 font-semibold',
                testOpen
                  ? 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              Try it with a child
            </button>
            <span className="text-xs text-slate-500">
              {testing && !testOpen
                ? 'A test child is filled in. Open this to see what it would get.'
                : 'See what a child would be sent and which steps light up.'}
            </span>
          </div>
          <div className="h-[420px] md:h-auto md:min-h-0 md:flex-1">
            <FlowCanvas
              graph={draft.graph}
              triggerLabel={triggerInfo(draft.trigger).label}
              selectedId={selectedId}
              classroomName={classroomName}
              contactName={contactName}
              choiceName={choiceName}
              highlight={highlight}
              readOnly={!canEdit}
              onGraphChange={setGraph}
              onSelect={setSelectedId}
              adding={adding}
              onAdding={chooseWhereToAdd}
            />
          </div>
        </div>
        {testOpen && (
          <aside
            aria-label="Try it with a child"
            className="order-3 w-full shrink-0 border-t border-slate-200 p-4 md:w-[340px] md:overflow-y-auto md:border-l md:border-t-0"
          >
            <FlowTester
              layout="panel"
              classrooms={classrooms}
              filterOptions={filterOptions}
              test={test}
              outcome={outcome}
              onTest={(change) => setTest((current) => ({ ...current, ...change }))}
              onClear={() => setTest(EMPTY_TEST)}
              onClose={() => setTestOpen(false)}
              canSend={canEdit}
              sendBlockedReason={
                draft.id === null || dirty ? 'Save the flow first: the test sends the saved version.' : null
              }
              onSend={(phone) =>
                draft.id === null
                  ? Promise.resolve({ queued: 0, error: 'Save the flow first.' })
                  : onSendTest(draft.id, phone, testChildOf(test))
              }
            />
          </aside>
        )}
        {adding !== null && !readOnly && (
          <aside
            aria-label="Add a step"
            className="order-3 w-full shrink-0 border-t border-slate-200 p-4 md:w-[340px] md:overflow-y-auto md:border-l md:border-t-0"
          >
            <ActionPicker
              key={`${adding.from}:${adding.port}`}
              where={addingWhere(adding)}
              onPick={(kind) => addAfter(adding.from, adding.port, kind)}
              onClose={() => setAdding(null)}
            />
          </aside>
        )}
      </div>
      )}
    </div>
  )
}
