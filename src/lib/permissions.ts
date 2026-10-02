import type {
  AccountPermissions,
  PermissionAction,
  PermissionModule,
  Teacher,
} from '../types/domain'

// The ticks admin can set per account. Mirrors valid_account_permissions()
// in the database, which is what actually enforces them.
export const permissionModules: {
  key: PermissionModule
  label: string
  canEdit: boolean
  deleteHint?: string
}[] = [
  {
    key: 'calendar',
    label: 'Calendar',
    canEdit: true,
    deleteHint: 'Cancel trial bookings, delete make-ups, cancel whole schedules',
  },
  {
    key: 'classrooms',
    label: 'Classrooms',
    canEdit: true,
    deleteHint: 'Archive and restore classrooms',
  },
  { key: 'students', label: 'Students', canEdit: true, deleteHint: 'Deactivate students' },
  { key: 'leads', label: 'Leads', canEdit: true, deleteHint: 'Delete leads' },
  { key: 'forms', label: 'Forms', canEdit: true, deleteHint: 'Delete forms and responses' },
  { key: 'activity', label: 'Activity Log', canEdit: false },
]

const moduleKeys = new Set<string>(permissionModules.map((module) => module.key))

// Keeps only well-formed entries, so a bad value from the database can never
// grant more than it should.
export function parseAccountPermissions(raw: unknown): AccountPermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const result: AccountPermissions = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!moduleKeys.has(key) || !value || typeof value !== 'object') {
      continue
    }
    const entry = value as { level?: unknown; delete?: unknown }
    if (entry.level === 'edit' && key !== 'activity') {
      result[key as PermissionModule] = { level: 'edit', delete: entry.delete === true }
    } else if (entry.level === 'view' || entry.level === 'edit') {
      result[key as PermissionModule] = { level: 'view' }
    }
  }
  return result
}

export function hasPermission(
  account: Pick<Teacher, 'role' | 'permissions'> | null,
  module: PermissionModule,
  action: PermissionAction = 'view',
) {
  if (!account) {
    return false
  }
  if (account.role === 'admin') {
    return true
  }

  const entry = account.permissions[module]
  if (!entry) {
    return false
  }
  if (action === 'view') {
    return true
  }
  if (action === 'edit') {
    return entry.level === 'edit'
  }
  return entry.level === 'edit' && entry.delete === true
}

// Short text for an account list, e.g. "Leads (edit, delete) · Calendar (view)".
export function describePermissions(permissions: AccountPermissions) {
  const parts = permissionModules
    .filter((module) => permissions[module.key])
    .map((module) => {
      const entry = permissions[module.key]!
      const detail = entry.level === 'edit' ? (entry.delete ? 'edit, delete' : 'edit') : 'view'
      return `${module.label} (${detail})`
    })
  return parts.length > 0 ? parts.join(' · ') : 'No access yet'
}
