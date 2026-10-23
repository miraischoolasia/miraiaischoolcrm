import type {
  AccountPermissions,
  EffectivePermissions,
  PermissionAction,
  PermissionModule,
  PermissionScope,
  Teacher,
} from '../types/domain'

// The ticks admin can set per account and per team. Mirrors valid_account_permissions()
// in the database, which is what actually enforces them.
export const permissionModules: {
  key: PermissionModule
  label: string
  canEdit: boolean
  deleteHint?: string
  // Whose rows the tick can be limited to (Leads, Inbox, Team Replies); empty = always everyone's.
  scopes: PermissionScope[]
  // Menu group, for the tick tables.
  group: 'Marketing' | 'Teaching' | 'Students' | 'Admin'
}[] = [
  { key: 'leads', label: 'Leads', canEdit: true, deleteHint: 'Delete leads', scopes: ['all', 'own_unassigned', 'own'], group: 'Marketing' },
  { key: 'inbox', label: 'Inbox', canEdit: true, deleteHint: 'Delete messages', scopes: ['all', 'own_unassigned', 'own'], group: 'Marketing' },
  { key: 'automations', label: 'Automations', canEdit: true, deleteHint: 'Delete flows and contacts', scopes: [], group: 'Marketing' },
  { key: 'forms', label: 'Forms', canEdit: true, deleteHint: 'Delete forms and responses', scopes: [], group: 'Marketing' },
  { key: 'ai_knowledge', label: 'AI Knowledge', canEdit: true, deleteHint: 'Delete notes', scopes: [], group: 'Marketing' },
  // Briefs, the AI plan and review (edit); look only (view).
  { key: 'content_studio', label: 'Content Studio', canEdit: true, scopes: [], group: 'Marketing' },
  // See approved posts and claim them to share.
  { key: 'content_library', label: 'Content Library', canEdit: false, scopes: [], group: 'Marketing' },
  {
    key: 'calendar',
    label: 'Calendar',
    canEdit: true,
    deleteHint: 'Cancel trial bookings, delete make-ups, cancel whole schedules',
    scopes: [],
    group: 'Teaching',
  },
  {
    key: 'classrooms',
    label: 'Classrooms',
    canEdit: true,
    deleteHint: 'Archive and restore classrooms',
    scopes: [],
    group: 'Teaching',
  },
  { key: 'videos', label: 'Class Videos', canEdit: true, scopes: [], group: 'Teaching' },
  { key: 'questions', label: 'Question Bank', canEdit: true, scopes: [], group: 'Teaching' },
  { key: 'students', label: 'Students', canEdit: true, deleteHint: 'Deactivate students', scopes: [], group: 'Students' },
  { key: 'app_logins', label: 'App Logins', canEdit: true, scopes: [], group: 'Students' },
  { key: 'packages', label: 'Packages', canEdit: true, scopes: [], group: 'Students' },
  // The Student Inbox: the WhatsApp numbers set to the students zone (apart from the Marketing Inbox).
  { key: 'student_inbox', label: 'Student Inbox', canEdit: true, deleteHint: 'Delete messages', scopes: [], group: 'Students' },
  // Send a student's monthly progress card to the family: only their own students (Learning Consultant) or everyone's.
  { key: 'progress_cards', label: 'Progress Cards', canEdit: false, scopes: ['all', 'own'], group: 'Students' },
  // The teacher scorecard and retention (view), the alert settings (edit); a view tick also gets the class alerts.
  { key: 'quality', label: 'Teacher Quality', canEdit: true, scopes: [], group: 'Admin' },
  { key: 'class_settings', label: 'Class Settings', canEdit: true, scopes: [], group: 'Admin' },
  { key: 'team_replies', label: 'Team Replies', canEdit: false, scopes: ['all', 'own'], group: 'Admin' },
  { key: 'staff_hours', label: 'Working Hours', canEdit: false, scopes: [], group: 'Admin' },
  { key: 'activity', label: 'Activity Log', canEdit: false, scopes: [], group: 'Admin' },
]

export const scopeLabels: Record<PermissionScope, string> = {
  all: 'Everyone’s',
  own_unassigned: 'Own + unassigned',
  own: 'Only own',
}

const moduleByKey = new Map(permissionModules.map((module) => [module.key, module]))
const SCOPE_RANK: Record<PermissionScope, number> = { own: 1, own_unassigned: 2, all: 3 }
const SCOPES: PermissionScope[] = ['own', 'own_unassigned', 'all']

function asScope(value: unknown): PermissionScope | null {
  return value === 'all' || value === 'own_unassigned' || value === 'own' ? value : null
}

// Keeps only well-formed entries, so a bad value from the database can never
// grant more than it should.
export function parseAccountPermissions(raw: unknown): AccountPermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const result: AccountPermissions = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const module = moduleByKey.get(key as PermissionModule)
    if (!module || !value || typeof value !== 'object') {
      continue
    }
    const entry = value as { level?: unknown; delete?: unknown; scope?: unknown }
    const scope = asScope(entry.scope)
    // A scope the page cannot have is dropped to the narrowest one it can, never widened.
    const keptScope =
      scope && scope !== 'all'
        ? module.scopes.includes(scope)
          ? scope
          : module.scopes.length > 0
            ? 'own'
            : null
        : null
    if (scope && scope !== 'all' && keptScope === null) {
      continue
    }
    const withScope = keptScope ? { scope: keptScope } : {}
    if (entry.level === 'edit' && module.canEdit) {
      result[module.key] = { level: 'edit', delete: entry.delete === true, ...withScope }
    } else if (entry.level === 'view' || entry.level === 'edit') {
      result[module.key] = { level: 'view', ...withScope }
    }
  }
  return result
}

// The total worked out by the database (teachers.effective_permissions).
export function parseEffectivePermissions(raw: unknown): EffectivePermissions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const result: EffectivePermissions = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const module = moduleByKey.get(key as PermissionModule)
    if (!module || !value || typeof value !== 'object') {
      continue
    }
    const entry = value as { level?: unknown; delete?: unknown; scope?: unknown; edit_scope?: unknown; delete_scope?: unknown }
    if (entry.level !== 'view' && entry.level !== 'edit') {
      continue
    }
    const edit = entry.level === 'edit' && module.canEdit
    result[module.key] = {
      level: edit ? 'edit' : 'view',
      delete: edit && entry.delete === true,
      scope: asScope(entry.scope) ?? 'own',
      ...(edit ? { editScope: asScope(entry.edit_scope) ?? 'own' } : {}),
      ...(edit && entry.delete === true ? { deleteScope: asScope(entry.delete_scope) ?? 'own' } : {}),
    }
  }
  return result
}

// Several sets of ticks into one, the way the database does it (merge_account_permissions):
// per action, the widest scope that gives it.
export function mergePermissions(sources: AccountPermissions[]): EffectivePermissions {
  const best = new Map<PermissionModule, { view: number; edit: number; del: number }>()
  for (const source of sources) {
    for (const [key, entry] of Object.entries(source) as [PermissionModule, NonNullable<AccountPermissions[PermissionModule]>][]) {
      const rank = SCOPE_RANK[entry.scope ?? 'all']
      const current = best.get(key) ?? { view: 0, edit: 0, del: 0 }
      current.view = Math.max(current.view, rank)
      if (entry.level === 'edit') current.edit = Math.max(current.edit, rank)
      if (entry.level === 'edit' && entry.delete) current.del = Math.max(current.del, rank)
      best.set(key, current)
    }
  }
  const result: EffectivePermissions = {}
  for (const module of permissionModules) {
    const ranks = best.get(module.key)
    if (!ranks) continue
    result[module.key] = {
      level: ranks.edit > 0 ? 'edit' : 'view',
      delete: ranks.del > 0,
      scope: SCOPES[ranks.view - 1],
      ...(ranks.edit > 0 ? { editScope: SCOPES[ranks.edit - 1] } : {}),
      ...(ranks.del > 0 ? { deleteScope: SCOPES[ranks.del - 1] } : {}),
    }
  }
  return result
}

type Account = Pick<Teacher, 'role' | 'permissions'> & Partial<Pick<Teacher, 'effectivePermissions'>>

// The page ticks that came with 20261026000000, worked out from the older ticks the same way that migration
// does. Only used while the database has no total yet, so nobody loses a page if this page goes live first.
export function withLegacyPageTicks(permissions: AccountPermissions): AccountPermissions {
  const next: AccountPermissions = { ...permissions }
  if (permissions.leads && !next.inbox) next.inbox = { ...permissions.leads }
  if (permissions.leads && !next.automations) next.automations = { level: 'view' }
  if (permissions.leads && !next.ai_knowledge) next.ai_knowledge = { level: 'view' }
  if (permissions.students && !next.app_logins) next.app_logins = { ...permissions.students }
  if (permissions.classrooms && !next.videos) next.videos = { level: permissions.classrooms.level, ...(permissions.classrooms.level === 'edit' ? { delete: false } : {}) }
  return next
}

// What the account may do: the database's total when it has one, else its own ticks.
function totalOf(account: Account): EffectivePermissions {
  return account.effectivePermissions ?? mergePermissions([withLegacyPageTicks(account.permissions)])
}

export function hasPermission(account: Account | null, module: PermissionModule, action: PermissionAction = 'view') {
  if (!account) {
    return false
  }
  if (account.role === 'admin') {
    return true
  }

  const entry = totalOf(account)[module]
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

// Whose rows an action covers, or null when it is not allowed (same as permission_scope() in the database).
export function permissionScope(
  account: Account | null,
  module: PermissionModule,
  action: PermissionAction = 'view',
): PermissionScope | null {
  if (!account) return null
  if (account.role === 'admin') return 'all'
  const entry = totalOf(account)[module]
  if (!entry) return null
  if (action === 'view') return entry.scope
  if (action === 'edit') return entry.level === 'edit' ? (entry.editScope ?? entry.scope) : null
  return entry.level === 'edit' && entry.delete ? (entry.deleteScope ?? entry.editScope ?? entry.scope) : null
}

// Is a row inside a scope? mine: it is given to me; unassigned: it is given to nobody.
export function inScope(scope: PermissionScope | null, mine: boolean, unassigned: boolean) {
  if (scope === 'all') return true
  if (scope === 'own_unassigned') return mine || unassigned
  if (scope === 'own') return mine
  return false
}

function describeEntry(entry: { level: 'view' | 'edit'; delete?: boolean; scope?: PermissionScope }) {
  const detail = entry.level === 'edit' ? (entry.delete ? 'edit, delete' : 'edit') : 'view'
  return entry.scope && entry.scope !== 'all' ? `${detail}, ${scopeLabels[entry.scope].toLowerCase()}` : detail
}

// Short text for an account list, e.g. "Leads (edit, delete) · Calendar (view)".
export function describePermissions(permissions: AccountPermissions | EffectivePermissions) {
  const parts = permissionModules
    .filter((module) => permissions[module.key])
    .map((module) => `${module.label} (${describeEntry(permissions[module.key]!)})`)
  return parts.length > 0 ? parts.join(' · ') : 'No access yet'
}
