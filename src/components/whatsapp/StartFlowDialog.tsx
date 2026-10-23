import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { ModalShell } from '../ModalShell'
import type { ScheduleTarget } from '../../lib/chatSchedules'
import {
  describeRun,
  fetchFlowState,
  filterFlows,
  listStartableFlows,
  startFlowError,
  startFlowNow,
  type FlowState,
  type StartableFlow,
} from '../../lib/startFlow'

export type StartFlowApi = {
  listStartableFlows: typeof listStartableFlows
  fetchFlowState: typeof fetchFlowState
  startFlowNow: typeof startFlowNow
}

const defaultApi: StartFlowApi = { listStartableFlows, fetchFlowState, startFlowNow }

// The chat's "+" > Start automation: pick one of the school's flows that are on and start it for this person now,
// for when the system did not pick them up by itself. A person already in the flow is not started twice unless the
// team says to start again from the first step.
export function StartFlowDialog({
  target,
  onClose,
  onStarted,
  api = defaultApi,
}: {
  target: ScheduleTarget
  onClose: () => void
  onStarted?: () => void
  api?: StartFlowApi
}) {
  const [flows, setFlows] = useState<StartableFlow[] | null>(null)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<StartableFlow | null>(null)
  const [state, setState] = useState<FlowState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .listStartableFlows()
      .then((list) => alive && setFlows(list))
      .catch((failure) => {
        if (alive) {
          setFlows([])
          setError(startFlowError(failure, "Couldn't load the flows."))
        }
      })
    return () => {
      alive = false
    }
  }, [api])

  const shown = useMemo(() => filterFlows(flows ?? [], search), [flows, search])
  const who = target.parentName?.trim() || 'this person'
  const reach = [target.parentName?.trim(), target.phone ? `+${target.phone}` : null].filter(Boolean).join(' · ')

  async function pick(flow: StartableFlow) {
    setPicked(flow)
    setState(null)
    setError(null)
    try {
      setState(await api.fetchFlowState(target, flow.id))
    } catch (failure) {
      setError(startFlowError(failure, "Couldn't check whether they are in this flow."))
    }
  }

  async function start(restart: boolean) {
    if (!picked) {
      return
    }
    setIsWorking(true)
    setError(null)
    try {
      const result = await api.startFlowNow(target, picked.id, restart)
      if (result.started) {
        setStarted(true)
        onStarted?.()
      } else {
        setState(result.state)
      }
    } catch (failure) {
      setError(startFlowError(failure))
    } finally {
      setIsWorking(false)
    }
  }

  const running = state?.running ? state : null

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Start automation</h2>
          <p className="text-sm text-slate-500">Start one of the school&apos;s flows for {who} now.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>

      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6">
        {started && picked ? (
          <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Started “{picked.name}” for {who}. Its first step runs within a minute; you can follow it in the flow&apos;s
            Enrollment history.
          </p>
        ) : picked ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{picked.name}</p>
              <dl className="mt-2 space-y-1">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">For</dt>
                  <dd>{reach || who}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Starts with</dt>
                  <dd>{picked.firstStep}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Messages</dt>
                  <dd>
                    {picked.sendsItself
                      ? 'Go out by themselves (this flow sends by itself).'
                      : 'Wait for approval under ⚡ Auto before they go.'}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-slate-500">
                It starts from the first step, skipping what usually starts it. The flow&apos;s own checks, the weekly
                limit, the sending hours and STOP still hold.
              </p>
            </div>
            {state === null && !error && <p className="text-sm text-slate-500">Checking whether they are in this flow…</p>}
            {running && (
              <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {who} is already in this flow ({describeRun(running)}). Start again from the first step? What is still
                waiting from before will not be sent.
              </p>
            )}
          </>
        ) : (
          <>
            <label className="relative block">
              <span className="sr-only">Search flows</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search flows"
                aria-label="Search flows"
                autoFocus
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#fc0c97]"
              />
            </label>
            {flows === null ? (
              <p className="text-sm text-slate-500">Loading the flows…</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-slate-500">
                {flows.length === 0 ? 'No flow is switched on. Switch one on in Automations first.' : 'No flow has that name.'}
              </p>
            ) : (
              <ul aria-label="Flows" className="space-y-2">
                {shown.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      disabled={!flow.startable}
                      onClick={() => void pick(flow)}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 text-left text-sm',
                        flow.startable ? 'border-slate-200 bg-white hover:border-[#fbcfe8] hover:bg-[#fff1f8]' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400',
                      )}
                    >
                      <span className={cn('block font-semibold', flow.startable ? 'text-slate-900' : 'text-slate-500')}>{flow.name}</span>
                      <span className="block text-xs">{flow.startable ? flow.firstStep : flow.why}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
        {started ? (
          <button type="button" onClick={onClose} className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]">
            Done
          </button>
        ) : picked ? (
          <>
            <button
              type="button"
              onClick={() => {
                setPicked(null)
                setState(null)
                setError(null)
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {running ? 'Cancel' : 'Back'}
            </button>
            <button
              type="button"
              disabled={isWorking || state === null}
              onClick={() => void start(Boolean(running))}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {isWorking ? 'Starting…' : running ? 'Start again from the first step' : 'Start now'}
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
        )}
      </div>
    </ModalShell>
  )
}
