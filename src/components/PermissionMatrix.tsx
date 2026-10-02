import { cn } from '../lib/cn'
import { permissionModules } from '../lib/permissions'
import type { AccountPermissions, PermissionModule } from '../types/domain'

type Level = 'none' | 'view' | 'edit'

type PermissionMatrixProps = {
  value: AccountPermissions
  onChange: (next: AccountPermissions) => void
  disabled?: boolean
}

// One row per module: No access / View / Edit, and "Can delete" once Edit is picked.
export function PermissionMatrix({ value, onChange, disabled = false }: PermissionMatrixProps) {
  function setLevel(module: PermissionModule, level: Level) {
    const next = { ...value }
    if (level === 'none') {
      delete next[module]
    } else if (level === 'view') {
      next[module] = { level: 'view' }
    } else {
      next[module] = { level: 'edit', delete: value[module]?.delete === true }
    }
    onChange(next)
  }

  function setDelete(module: PermissionModule, canDelete: boolean) {
    onChange({ ...value, [module]: { level: 'edit', delete: canDelete } })
  }

  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {permissionModules.map((module) => {
        const entry = value[module.key]
        const level: Level = entry?.level ?? 'none'
        const levels: Level[] = module.canEdit ? ['none', 'view', 'edit'] : ['none', 'view']

        return (
          <div
            key={module.key}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-sm font-semibold text-slate-800">{module.label}</div>
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
                      level === option
                        ? 'bg-white text-[#be185d] shadow-sm'
                        : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {option === 'none' ? 'No access' : option === 'view' ? 'View' : 'Edit'}
                  </button>
                ))}
              </div>
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
  )
}
