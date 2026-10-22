import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { stageLabel } from '../../lib/leadStages'
import { stageRuleText, stageRulesSummary, type StageRule, type StageRuleKey } from '../../lib/stageRules'

type StageRulesCardProps = {
  rules: StageRule[]
  // The database update that holds the rules has not been applied yet.
  missing: boolean
  canEdit: boolean
  loadError: string | null
  onSave: (key: StageRuleKey, change: Partial<Omit<StageRule, 'key'>>) => Promise<string | null>
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// The moves a lead makes by itself. Each has a switch; the stage names are the school's own. Anything else a lead
// should do by itself (after an HOA trial, after days of silence) is a flow with a "Change stage" step.
export function StageRulesCard({ rules, missing, canEdit, loadError, onSave }: StageRulesCardProps) {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function save(key: StageRuleKey, change: Partial<Omit<StageRule, 'key'>>) {
    setProblem(null)
    const result = await onSave(key, change)
    if (result) {
      setProblem(result)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">Stage rules</span>
        <span className="flex-1 text-xs text-slate-500">
          {missing ? 'Not available until the database update is applied' : stageRulesSummary(rules)}
        </span>
        {open ? <CaretUp size={14} aria-hidden="true" /> : <CaretDown size={14} aria-hidden="true" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            Leads move between stages by themselves in these four cases. Switch off the ones you do not want. For
            anything else, make a flow with a “Change stage” step (for example after an HOA trial is attended).
          </p>
          {(loadError || problem) && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {problem ?? loadError}
            </p>
          )}
          {!missing &&
            rules.map((rule) => {
              const text = stageRuleText(rule.key)
              return (
                <div key={rule.key} className="space-y-2 rounded-lg border border-slate-100 px-3 py-2">
                  <label className="flex items-start gap-2 text-sm font-semibold text-slate-900">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={!canEdit}
                      onChange={(event) => void save(rule.key, { enabled: event.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
                    />
                    <span>{text.title}</span>
                  </label>
                  <p className="pl-6 text-xs text-slate-500">{text.detail}</p>
                  {rule.key === 'contacted_on_reply' && (
                    <label className={cn('flex flex-col gap-1 pl-6 text-sm text-slate-700', !rule.enabled && 'opacity-50')}>
                      <span>Which messages count</span>
                      <select
                        value={rule.countAutomated ? 'any' : 'person'}
                        disabled={!canEdit || !rule.enabled}
                        onChange={(event) => void save(rule.key, { countAutomated: event.target.value === 'any' })}
                        className={fieldClass}
                      >
                        <option value="any">Automatic messages count too</option>
                        <option value="person">Only a person’s reply counts</option>
                      </select>
                    </label>
                  )}
                  {rule.key === 'converted_on_student_phone' && (
                    <label className={cn('flex flex-col gap-1 pl-6 text-sm text-slate-700', !rule.enabled && 'opacity-50')}>
                      <span>Which students count</span>
                      <select
                        value={rule.students}
                        disabled={!canEdit || !rule.enabled}
                        onChange={(event) => void save(rule.key, { students: event.target.value === 'regular' ? 'regular' : 'all' })}
                        className={fieldClass}
                      >
                        <option value="all">All students (an HOA trial student too)</option>
                        <option value="regular">Only regular students (an HOA trial student does not count)</option>
                      </select>
                    </label>
                  )}
                </div>
              )
            })}
          <p className="text-xs text-slate-500">
            “{stageLabel('lost')}” and any stage you added yourself never change by themselves, unless a flow does it.
          </p>
        </div>
      )}
    </section>
  )
}
