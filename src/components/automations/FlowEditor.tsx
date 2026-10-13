import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Trash } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  TRIGGER_ID,
  addNodeAfter,
  draftOf,
  newFlowDraft,
  removeNode,
  sendAfterOnly,
  simulateFlow,
  triggerInfo,
  unreachableMessages,
  updateNode,
  type AutomationFlow,
  type FlowDraft,
  type FlowGraph,
  type FlowPort,
  type FlowTrigger,
  type NewBlockKind,
} from '../../lib/automationFlows'
import type { AutomationContact } from '../../lib/automationContacts'
import type { Classroom, LeadStatus } from '../../types/domain'
import { FlowCanvas } from './FlowCanvas'
import { FlowSwitch } from './FlowSwitch'
import { FlowTester } from './FlowTester'
import { FlowWorkbench } from './FlowWorkbench'

type FlowEditorProps = {
  // null starts a new flow.
  flow: AutomationFlow | null
  classrooms: Classroom[]
  // The saved contacts a message can be sent to instead of the family.
  contacts: AutomationContact[]
  // Only an admin can change a flow.
  canEdit: boolean
  onSave: (draft: FlowDraft) => Promise<{ error: string | null; flow: AutomationFlow | null }>
  onDelete: (id: number) => Promise<string | null>
  // Queues this flow's messages for a pretend child to the given number, for approval in WhatsApp.
  onSendTest: (
    flowId: number,
    phone: string,
    child: { age: number | null; classroomId: number | null },
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
  classrooms,
  contacts,
  canEdit,
  onSave,
  onDelete,
  onSendTest,
  onSaved,
  onDeleted,
  onBack,
  onDirtyChange,
}: FlowEditorProps) {
  const [draft, setDraft] = useState<FlowDraft>(() => (flow ? draftOf(flow) : newFlowDraft()))
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testAge, setTestAge] = useState('')
  const [testClass, setTestClass] = useState('')
  const [testHours, setTestHours] = useState('')
  const [testStage, setTestStage] = useState('')
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

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

  const readOnly = !canEdit || isWorking
  const selectedNode = draft.graph.nodes.find((node) => node.id === selectedId) ?? null
  // The panel on the left is there only while a card is selected.
  const panelOpen = selectedId === TRIGGER_ID || selectedNode !== null

  const testing = testAge !== '' || testClass !== '' || testHours !== '' || testStage !== ''
  const outcome = useMemo(
    () =>
      simulateFlow(draft.graph, {
        age: testAge === '' ? null : Number(testAge),
        classroomId: testClass === '' ? null : Number(testClass),
        hours: testHours === '' ? null : Number(testHours),
        stage: testStage === '' ? null : (testStage as LeadStatus),
      }),
    [draft.graph, testAge, testClass, testHours, testStage],
  )
  const highlight = useMemo(() => (testing ? { nodes: outcome.nodes, edges: outcome.edges } : null), [testing, outcome])
  const loose = useMemo(() => unreachableMessages(draft.graph), [draft.graph])

  const setGraph = useCallback((graph: FlowGraph) => {
    setDraft((current) => ({ ...current, graph }))
    setNotice(null)
  }, [])

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
    setSelectedId(result.id)
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
      text: saved.enabled ? 'Saved. This flow runs every 15 minutes.' : 'Saved. This flow is off, so it will not run.',
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

      {(!canEdit || flow?.lastError || loose.length > 0 || notice) && (
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
          {loose.length > 0 && (
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
              readOnly={readOnly}
              onTriggerChange={(trigger: FlowTrigger) => {
                setDraft({
                  ...draft,
                  trigger,
                  graph: triggerInfo(trigger).afterOnly ? sendAfterOnly(draft.graph) : draft.graph,
                })
                setNotice(null)
              }}
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
          <FlowTester
            classrooms={classrooms}
            testAge={testAge}
            testClass={testClass}
            testHours={testHours}
            testStage={testStage}
            outcome={outcome}
            onTestAge={setTestAge}
            onTestClass={setTestClass}
            onTestHours={setTestHours}
            onTestStage={setTestStage}
            canSend={canEdit}
            sendBlockedReason={
              draft.id === null || dirty ? 'Save the flow first: the test sends the saved version.' : null
            }
            onSend={(phone) =>
              draft.id === null
                ? Promise.resolve({ queued: 0, error: 'Save the flow first.' })
                : onSendTest(draft.id, phone, {
                    age: testAge === '' ? null : Number(testAge),
                    classroomId: testClass === '' ? null : Number(testClass),
                  })
            }
          />
          <div className="h-[420px] md:h-auto md:min-h-0 md:flex-1">
            <FlowCanvas
              graph={draft.graph}
              triggerLabel={triggerInfo(draft.trigger).label}
              selectedId={selectedId}
              classroomName={classroomName}
              contactName={contactName}
              highlight={highlight}
              readOnly={!canEdit}
              onGraphChange={setGraph}
              onSelect={setSelectedId}
              onAddAfter={addAfter}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
