import { cn } from '../lib/cn'
import { permissionModules, scopeLabels } from '../lib/permissions'
import type { AccountPermissions, PermissionModule, PermissionScope } from '../types/domain'

type Level = 'none' | 'view' | 'edit'

// What the account already gets from its teams, per page (shown beside its own ticks).
export type InheritedTicks = Partial<Record<PermissionModule, { from: string[]; text: string }>>

type PermissionMatrixProps = {
  value: AccountPermissions
  onChange: (next: AccountPermissions) => void
  disabled?: boolean
  inherited?: InheritedTicks
}

const GROUPS = ['Marketing', 'Teaching', 'Students', 'Admin'] as const

// One row per page, grouped as the menu is: No access / View / Edit, "Can delete" once Edit is picked, and
// for Leads, Inbox and Team Replies whose rows the tick covers.
export function PermissionMatrix({ value, onChange, disabled = false, inherited }: PermissionMatrixProps) {
  function setLevel(module: PermissionModule, level: Level) {
    const next = { ...value }
    const scope = value[module]?.scope
    const withScope = scope && scope !== 'all' ? { scope } : {}
    if (level === 'none') {
      delete next[module]
    } else if (level === 'view') {
      next[module] = { level: 'view', ...withScope }
    } else {
      next[module] = { level: 'edit', delete: value[module]?.delete === true, ...withScope }
    }
    onChange(next)
  }

  function setDelete(module: PermissionModule, canDelete: boolean) {
    onChange({ ...value, [module]: { ...value[module]!, level: 'edit', delete: canDelete } })
  }

  function setScope(module: PermissionModule, scope: PermissionScope) {
    const entry = value[module]
    if (!entry) return
    const { scope: _old, ...rest } = entry
    void _old
    onChange({ ...value, [module]: scope === 'all' ? rest : { ...rest, scope } })
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group} className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>
          {permissionModules
            .filter((module) => module.group === group)
            .map((module) => {
              const entry = value[module.key]
              const level: Level = entry?.level ?? 'none'
              const levels: Level[] = module.canEdit ? ['none', 'view', 'edit'] : ['none', 'view']
              const fromTeams = inherited?.[module.key]

              return (
                <div key={module.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{module.label}</div>
                    {fromTeams && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        From {fromTeams.from.join(', ')}: {fromTeams.text}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      role="radiogroup"
                      aria-label={`${module.label} access`}
                      className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5"
                    >
                      {levels.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={level === option}
                          disabled={disabled}
                          onClick={() => setLevel(module.key, option)}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed',
                            level === option ? 'bg-white text-[#be185d] shadow-sm' : 'text-slate-500 hover:text-slate-800',
                          )}
                        >
                          {option === 'none' ? 'No access' : option === 'view' ? 'View' : 'Edit'}
                        </button>
                      ))}
                    </div>
                    {module.scopes.length > 0 && (
                      <select
                        aria-label={`${module.label}: whose`}
                        value={entry?.scope ?? 'all'}
                        disabled={disabled || level === 'none'}
                        onChange={(event) => setScope(module.key, event.target.value as PermissionScope)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {module.scopes.map((scope) => (
                          <option key={scope} value={scope}>
                            {scopeLabels[scope]}
                          </option>
                        ))}
                      </select>
                    )}
                    {module.canEdit && (
                      <label
                        title={module.deleteHint}
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-semibold',
                          level === 'edit' ? 'text-slate-700' : 'text-slate-300',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={entry?.level === 'edit' && entry.delete === true}
                          disabled={disabled || level !== 'edit'}
                          onChange={(event) => setDelete(module.key, event.target.checked)}
                          aria-label={`${module.label}: can delete`}
                          className="h-4 w-4 accent-[#fc0c97]"
                        />
                        Can delete
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
