import { cn } from '../../lib/cn'
import type { FlowGraph, FlowSettings } from '../../lib/automationFlows'
import { leadStatusOptions } from '../../lib/constants'

type FlowSettingsCardProps = {
  settings: FlowGraph['settings']
  readOnly: boolean
  onChange: (change: FlowSettings) => void
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// The rules that hold for the whole flow: leads in some stages get nothing, and the same person is not
// messaged again too soon.
export function FlowSettingsCard({ settings, readOnly, onChange }: FlowSettingsCardProps) {
  const stopped = settings?.stopStages ?? []
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-900">For the whole flow</h3>
      <div
        className={cn(
          'space-y-1 rounded-lg border p-3',
          settings?.autoSend === true ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50',
        )}
      >
        <label className="flex items-start gap-2 text-sm font-semibold text-slate-900">
          <input
            type="checkbox"
            checked={settings?.autoSend === true}
            disabled={readOnly}
            onChange={(event) => onChange({ autoSend: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
          />
          <span>Send by itself (no approval)</span>
        </label>
        <p className="text-xs text-slate-600">
          {settings?.autoSend === true
            ? 'The messages of this flow go out on their own, at the right time, inside the daily limit and the hours set on the Automations page. Only to people who have written to us before; anyone else waits in the approval queue.'
            : 'Off: every message waits in the approval queue (the lightning button) until someone sends it.'}
        </p>
      </div>
      <fieldset disabled={readOnly} className="space-y-1.5">
        <legend className="text-xs font-semibold text-slate-600">Send nothing to leads who are</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {leadStatusOptions.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stopped.includes(option.key)}
                onChange={(event) =>
                  onChange({
                    stopStages: event.target.checked
                      ? [...stopped, option.key]
                      : stopped.filter((stage) => stage !== option.key),
                  })
                }
                className="h-4 w-4 accent-[#fc0c97]"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>Do not send to the same person again within</span>
        <input
          type="number"
          aria-label="Days before the same person is messaged again"
          min={0}
          max={365}
          value={settings?.cooldownDays ?? 0}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ cooldownDays: Math.max(0, Math.min(365, Number(event.target.value) || 0)) })
          }
          className={cn(fieldClass, 'w-20')}
        />
        <span>days (0 is no limit)</span>
      </label>
      <p className="text-xs text-slate-500">
        A parent who writes STOP is never messaged by any flow. The steps of one flow are not blocked by this.
      </p>
    </section>
  )
}
