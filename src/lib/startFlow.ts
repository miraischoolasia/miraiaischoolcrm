import { supabase } from './supabase'
import {
  TRIGGER_ID,
  describeAction,
  describeNode,
  describeOffset,
  fetchFlows,
  isAction,
  isMessage,
  type AutomationFlow,
} from './automationFlows'
import type { ScheduleTarget } from './chatSchedules'

// Inbox "+" > Start automation: start one of the school's flows for this chat now, when the system did not pick the
// person up by itself (20261101100000_chat_start_flow.sql). The trigger is skipped; the flow's own blocks, the weekly
// limit, STOP, approval and the sending hours hold as in any flow.

export type StartableFlow = {
  id: number
  name: string
  // False when starting it by hand would do nothing; why says so.
  startable: boolean
  why: string | null
  // The first thing the flow does, in one line.
  firstStep: string
  // The flow sends by itself; otherwise its messages wait for approval under ⚡.
  sendsItself: boolean
}

export type FlowState = { running: false } | { running: true; since: string; startedBy: string | null; runs: number }

export type StartResult = { started: true; id: number } | { started: false; state: FlowState }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

function shorten(text: string, length = 80) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}

// Class quality flows tell the team about a lesson (alerts, care, good news): there is no lesson in a chat.
const CLASS_ONLY_TRIGGERS: AutomationFlow['trigger'][] = ['class_alert', 'student_care', 'good_news']

// What the flow does first, and whether a start by hand reaches any step: steps timed "before" an event (a class, a
// meeting) have no event to count from, so they are skipped.
export function summarizeFlow(flow: Pick<AutomationFlow, 'id' | 'name' | 'trigger' | 'graph'>): StartableFlow {
  const { graph } = flow
  const sendsItself = graph.settings?.autoSend === true
  const base = { id: flow.id, name: flow.name, sendsItself }
  if (CLASS_ONLY_TRIGGERS.includes(flow.trigger)) {
    return {
      ...base,
      startable: false,
      why: "This flow is about a class or a student's lessons, not a chat, so it cannot start from here.",
      firstStep: '',
    }
  }
  if (flow.trigger === 'first_message_keyword') {
    return {
      ...base,
      startable: false,
      why: 'This flow makes the lead from a first message. Use "Add as lead" in the side panel instead.',
      firstStep: '',
    }
  }
  const reachable = graph.nodes.some((node) => (isMessage(node) || isAction(node)) && node.after === true)
  const firstId = graph.edges.find((edge) => edge.from === TRIGGER_ID)?.to
  const first = graph.nodes.find((node) => node.id === firstId) ?? null
  let firstStep = 'Nothing yet: the flow has no steps.'
  if (first && isMessage(first)) {
    const when = first.after === true ? `${describeOffset(first.mins)} after the start` : 'before the event'
    firstStep = `Message ${when}: “${shorten(first.text)}”`
  } else if (first && isAction(first)) {
    firstStep = describeAction(first)
  } else if (first) {
    firstStep = `First it checks: ${describeNode(first)}`
  }
  if (!reachable) {
    return {
      ...base,
      startable: false,
      why: "This flow's steps are timed before a class or meeting, so starting it by hand sends nothing.",
      firstStep,
    }
  }
  return { ...base, startable: true, why: null, firstStep }
}

// The flows that are switched on, with what starting each by hand would do; the ones that can start come first.
export async function listStartableFlows(): Promise<StartableFlow[]> {
  const flows = await fetchFlows()
  return flows
    .filter((flow) => flow.enabled)
    .map(summarizeFlow)
    .sort((a, b) => Number(b.startable) - Number(a.startable) || a.name.localeCompare(b.name))
}

export function filterFlows(flows: StartableFlow[], search: string) {
  const words = search.trim().toLowerCase()
  return words === '' ? flows : flows.filter((flow) => flow.name.toLowerCase().includes(words))
}

function stateOf(raw: unknown): FlowState {
  const value = (raw ?? {}) as { running?: boolean; since?: string; startedBy?: string | null; runs?: number }
  return value.running
    ? { running: true, since: value.since ?? '', startedBy: value.startedBy ?? null, runs: value.runs ?? 1 }
    : { running: false }
}

// Is this person still in the flow (steps to come, or messages waiting)?
export async function fetchFlowState(target: ScheduleTarget, flowId: number): Promise<FlowState> {
  const { data, error } = await requireSupabase().rpc('chat_flow_state', {
    p_conversation_id: target.conversationId,
    p_inbox_id: target.inboxId as number,
    p_phone: target.phone as string,
    p_lead_id: target.leadId as number,
    p_flow_id: flowId,
  })
  if (error) {
    throw error
  }
  return stateOf(data)
}

// Starts the flow now. restart: the runs going on stop first and it starts again from the first step.
export async function startFlowNow(target: ScheduleTarget, flowId: number, restart = false): Promise<StartResult> {
  const { data, error } = await requireSupabase().rpc('chat_start_flow', {
    p_conversation_id: target.conversationId,
    p_contact_id: target.contactId as number,
    p_inbox_id: target.inboxId as number,
    p_channel: target.channel,
    p_phone: target.phone as string,
    p_lead_id: target.leadId as number,
    p_parent_name: target.parentName as string,
    p_flow_id: flowId,
    p_restart: restart,
  })
  if (error) {
    throw error
  }
  const value = (data ?? {}) as { started?: boolean; id?: number; state?: unknown }
  return value.started ? { started: true, id: value.id ?? 0 } : { started: false, state: stateOf(value.state) }
}

export function startFlowError(error: unknown, fallback = "Couldn't start the flow. Try again.") {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === 'PGRST202' || code === '42883' || message?.includes('chat_start_flow') || message?.includes('chat_flow_state')) {
    return 'Starting a flow by hand is not set up yet. Ask the admin to update the database.'
  }
  return message || fallback
}

// "since 3:05 pm, started by Mei" / "started by itself".
export function describeRun(state: Extract<FlowState, { running: true }>, now = new Date()) {
  const since = new Date(state.since)
  const sameDay = since.toDateString() === now.toDateString()
  const when = Number.isNaN(since.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-GB', sameDay ? { hour: 'numeric', minute: '2-digit', hour12: true } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(since)
  const who = state.startedBy ? `started by ${state.startedBy}` : 'started by itself'
  return when ? `since ${when}, ${who}` : who
}
