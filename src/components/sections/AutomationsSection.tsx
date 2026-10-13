import { useCallback, useMemo, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { FlowEditor } from '../automations/FlowEditor'
import { ChatActivityCard } from '../automations/ChatActivityCard'
import { ContactsCard } from '../automations/ContactsCard'
import { OptoutsCard } from '../automations/OptoutsCard'
import { RecipePicker } from '../automations/RecipePicker'
import { FlowSwitch } from '../automations/FlowSwitch'
import { useAutomationContacts } from '../../hooks/useAutomationContacts'
import { useAutomationFlows } from '../../hooks/useAutomationFlows'
import { useAutomationForms, useAutomationOptouts, useAutomationStats } from '../../hooks/useAutomationExtras'
import { useChatWebhook } from '../../hooks/useChatWebhook'
import { useConfirm } from '../../hooks/useConfirm'
import { cn } from '../../lib/cn'
import { EMPTY_FILTER_OPTIONS, describeFlow, type FilterOptions, type FlowDraft } from '../../lib/automationFlows'
import { describeStats } from '../../lib/automationStats'
import type { FlowRecipe } from '../../lib/flowSteps'
import type { Classroom, LeadOption } from '../../types/domain'

type AutomationsSectionProps = {
  classrooms: Classroom[]
  // Only an admin can add, change or remove a flow; others can look at them.
  canEdit: boolean
  // The lead sources, PICs and tags a flow can ask about.
  leadOptions?: LeadOption[]
}

// The automation flows: when something starts, who gets which message and how long before.
// Each flow runs by itself every 15 minutes and adds its messages to the approval queue in the
// WhatsApp inbox; nothing is sent until a person approves it there.
//
// Two views: the list of flows, and one flow open as a workbench (settings on the left, canvas on
// the right).
export function AutomationsSection({ classrooms, canEdit, leadOptions = [] }: AutomationsSectionProps) {
  const automation = useAutomationFlows({ enabled: true })
  const contactList = useAutomationContacts({ enabled: true })
  // The address Chatwoot calls is a secret only an admin can read.
  const chatWebhook = useChatWebhook({ enabled: canEdit })
  const flowStats = useAutomationStats({ enabled: true })
  const optouts = useAutomationOptouts({ enabled: true })
  const forms = useAutomationForms({ enabled: true })

  // What the source, tag, PIC and form blocks can tick (hidden options are not offered).
  const filterOptions = useMemo<FilterOptions>(() => {
    const choices = (kind: LeadOption['kind']) =>
      leadOptions
        .filter((option) => option.kind === kind && option.isActive)
        .map((option) => ({ id: String(option.id), label: option.label }))
    return {
      ...EMPTY_FILTER_OPTIONS,
      source: choices('source'),
      tag: choices('tag'),
      pic: choices('pic'),
      form: forms.map((form) => ({ id: form.id, label: form.name })),
    }
  }, [leadOptions, forms])
  const { confirm, dialog } = useConfirm()
  // null shows the list.
  const [open, setOpen] = useState<number | 'new' | null>(null)
  // A new flow starts from the recipe list; the recipe picked (or none for a blank flow) is kept here.
  const [choosing, setChoosing] = useState(false)
  const [startFrom, setStartFrom] = useState<FlowDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const { flows } = automation
  const openFlow = typeof open === 'number' ? (flows.find((flow) => flow.id === open) ?? null) : null

  const handleDirty = useCallback((value: boolean) => setDirty(value), [])

  async function leave() {
    if (
      dirty &&
      !(await confirm('This flow has changes you have not saved. Leave without saving?', { confirmLabel: 'Leave' }))
    ) {
      return
    }
    setDirty(false)
    setOpen(null)
  }

  async function toggle(id: number, name: string, enabled: boolean) {
    setNotice(null)
    const problem = await automation.toggle(id, enabled)
    setNotice(
      problem
        ? { text: problem, isError: true }
        : {
            text: enabled
              ? `"${name}" is on. Its messages appear under the lightning button in WhatsApp within 15 minutes.`
              : `"${name}" is off.`,
            isError: false,
          },
    )
  }

  async function runNow() {
    setIsRunning(true)
    setNotice(null)
    const result = await automation.runNow()
    setIsRunning(false)
    setNotice(
      result.error
        ? { text: result.error, isError: true }
        : {
            text:
              result.queued > 0
                ? `${result.queued} ${result.queued === 1 ? 'message' : 'messages'} added to the approval queue in WhatsApp.`
                : 'Nothing new to add right now.',
            isError: false,
          },
    )
  }

  function pickRecipe(recipe: FlowRecipe | null) {
    setStartFrom(recipe ? recipe.build(contactList.contacts) : null)
    setChoosing(false)
    setOpen('new')
  }

  if (choosing) {
    return <RecipePicker contacts={contactList.contacts} onPick={pickRecipe} onBack={() => setChoosing(false)} />
  }

  if (open !== null && (open === 'new' || openFlow)) {
    return (
      <section>
        <FlowEditor
          key={open === 'new' ? 'new' : openFlow?.id}
          flow={open === 'new' ? null : openFlow}
          startFrom={open === 'new' ? startFrom : null}
          classrooms={classrooms}
          contacts={contactList.contacts}
          canEdit={canEdit}
          filterOptions={filterOptions}
          onSave={automation.save}
          onDelete={automation.remove}
          onSendTest={automation.sendTest}
          onSaved={(saved) => setOpen(saved.id)}
          onDeleted={() => {
            setDirty(false)
            setOpen(null)
            setNotice({ text: 'Flow deleted.', isError: false })
          }}
          onBack={() => void leave()}
          onDirtyChange={handleDirty}
        />
        {dialog}
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Each flow checks every 15 minutes. The messages it makes wait for approval under the lightning button in
          WhatsApp; nothing is sent by itself.
        </p>
        <div className="flex gap-2">
          {canEdit && (
            <button
              type="button"
              disabled={isRunning}
              onClick={() => void runNow()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isRunning ? 'Running…' : 'Run now'}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="flex items-center gap-1 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              New flow
            </button>
          )}
        </div>
      </div>

      {automation.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {automation.error}
        </p>
      )}
      <ContactsCard
        contacts={contactList.contacts}
        loadError={contactList.error}
        canEdit={canEdit}
        onAdd={contactList.add}
        onUpdate={contactList.update}
        onRemove={contactList.remove}
      />
      <OptoutsCard optouts={optouts.optouts} loadError={optouts.error} onAllowAgain={optouts.allowAgain} />
      {canEdit && (
        <ChatActivityCard
          info={chatWebhook.info}
          loadError={chatWebhook.error}
          isLoading={chatWebhook.isLoading}
          onReload={() => void chatWebhook.reload()}
        />
      )}
      {notice && (
        <p
          role={notice.isError ? 'alert' : 'status'}
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {notice.text}
        </p>
      )}

      {automation.isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : flows.length === 0 && !automation.error ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
          <p className="font-semibold text-slate-900">No flows yet</p>
          <p className="mt-1 text-sm text-slate-500">
            {canEdit ? 'Add one to send a reminder before a class, a trial or a Zoom meeting.' : 'Nothing to show yet.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <li key={flow.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <button type="button" onClick={() => setOpen(flow.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-slate-900">{flow.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{describeFlow(flow)}</span>
                {describeStats(flowStats.stats.get(flow.id)) && (
                  <span className="mt-0.5 block text-xs text-slate-600">{describeStats(flowStats.stats.get(flow.id))}</span>
                )}
                {flow.lastError && <span className="mt-1 block text-xs font-semibold text-red-700">Has a problem</span>}
              </button>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-bold',
                  flow.enabled ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {flow.enabled ? 'LIVE' : 'OFF'}
              </span>
              <FlowSwitch
                checked={flow.enabled}
                disabled={!canEdit}
                label={`${flow.name} on or off`}
                onChange={() => void toggle(flow.id, flow.name, !flow.enabled)}
              />
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  )
}
