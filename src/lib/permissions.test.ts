import { describe, expect, it } from 'vitest'
import {
  describePermissions,
  hasPermission,
  inScope,
  mergePermissions,
  parseAccountPermissions,
  parseEffectivePermissions,
  permissionScope,
} from './permissions'

describe('hasPermission', () => {
  const staff = {
    role: 'staff' as const,
    permissions: parseAccountPermissions({
      leads: { level: 'edit', delete: true },
      calendar: { level: 'edit' },
      forms: { level: 'view' },
    }),
  }

  it('lets admin do everything, whatever is ticked', () => {
    expect(hasPermission({ role: 'admin', permissions: {} }, 'students', 'delete')).toBe(true)
    expect(permissionScope({ role: 'admin', permissions: {} }, 'leads', 'edit')).toBe('all')
  })

  it('follows the ticks: edit includes view, delete needs its own tick', () => {
    expect(hasPermission(staff, 'leads', 'delete')).toBe(true)
    expect(hasPermission(staff, 'calendar', 'edit')).toBe(true)
    expect(hasPermission(staff, 'calendar', 'delete')).toBe(false)
    expect(hasPermission(staff, 'forms', 'view')).toBe(true)
    expect(hasPermission(staff, 'forms', 'edit')).toBe(false)
    expect(hasPermission(staff, 'students')).toBe(false)
    expect(hasPermission(null, 'leads')).toBe(false)
  })

  it('reads the database total (own ticks + teams) when there is one', () => {
    const inTeam = {
      role: 'staff' as const,
      permissions: {},
      effectivePermissions: parseEffectivePermissions({
        inbox: { level: 'edit', delete: false, scope: 'all', edit_scope: 'own' },
      }),
    }
    expect(hasPermission(inTeam, 'inbox', 'edit')).toBe(true)
    expect(permissionScope(inTeam, 'inbox', 'view')).toBe('all')
    expect(permissionScope(inTeam, 'inbox', 'edit')).toBe('own')
    expect(permissionScope(inTeam, 'inbox', 'delete')).toBeNull()
    expect(hasPermission(inTeam, 'leads')).toBe(false)
  })
})

describe('a database without the totals yet', () => {
  it('gives the new page ticks the old ticks allowed, as the migration does', () => {
    const leadsStaff = { role: 'staff' as const, permissions: parseAccountPermissions({ leads: { level: 'edit', delete: true }, students: { level: 'view' }, classrooms: { level: 'edit' } }) }
    expect(hasPermission(leadsStaff, 'inbox', 'delete')).toBe(true)
    expect(hasPermission(leadsStaff, 'automations')).toBe(true)
    expect(hasPermission(leadsStaff, 'automations', 'edit')).toBe(false)
    expect(hasPermission(leadsStaff, 'ai_knowledge')).toBe(true)
    expect(hasPermission(leadsStaff, 'app_logins')).toBe(true)
    expect(hasPermission(leadsStaff, 'app_logins', 'edit')).toBe(false)
    expect(hasPermission(leadsStaff, 'videos', 'edit')).toBe(true)
    expect(hasPermission(leadsStaff, 'packages')).toBe(false)
  })

  it('reads only the total once the database has one', () => {
    const inTeam = { role: 'staff' as const, permissions: parseAccountPermissions({ leads: { level: 'view' } }), effectivePermissions: {} }
    expect(hasPermission(inTeam, 'inbox')).toBe(false)
  })
})

describe('mergePermissions', () => {
  it('takes the widest scope per action, like the database', () => {
    const sales = parseAccountPermissions({ leads: { level: 'edit', scope: 'own' } })
    const office = parseAccountPermissions({ leads: { level: 'view' }, students: { level: 'edit', delete: true } })
    const total = mergePermissions([sales, office])
    expect(total.leads).toEqual({ level: 'edit', delete: false, scope: 'all', editScope: 'own' })
    expect(total.students).toEqual({ level: 'edit', delete: true, scope: 'all', editScope: 'all', deleteScope: 'all' })
    expect(mergePermissions([])).toEqual({})
  })

  it('own + unassigned beats own, everyone beats both', () => {
    const a = parseAccountPermissions({ inbox: { level: 'view', scope: 'own' } })
    const b = parseAccountPermissions({ inbox: { level: 'view', scope: 'own_unassigned' } })
    expect(mergePermissions([a, b]).inbox?.scope).toBe('own_unassigned')
    expect(mergePermissions([a, b, parseAccountPermissions({ inbox: { level: 'view' } })]).inbox?.scope).toBe('all')
  })
})

describe('inScope', () => {
  it('decides a row by its owner', () => {
    expect(inScope('all', false, false)).toBe(true)
    expect(inScope('own_unassigned', false, true)).toBe(true)
    expect(inScope('own_unassigned', false, false)).toBe(false)
    expect(inScope('own', true, false)).toBe(true)
    expect(inScope('own', false, true)).toBe(false)
    expect(inScope(null, true, true)).toBe(false)
  })
})

describe('parseAccountPermissions', () => {
  it('drops anything the database would not allow', () => {
    expect(
      parseAccountPermissions({
        leads: { level: 'view', delete: true },
        activity: { level: 'edit', delete: true },
        team_replies: { level: 'edit' },
        money: { level: 'edit' },
        forms: { level: 'owner' },
      }),
    ).toEqual({ leads: { level: 'view' }, activity: { level: 'view' }, team_replies: { level: 'view' } })
    expect(parseAccountPermissions(null)).toEqual({})
    expect(parseAccountPermissions([])).toEqual({})
  })

  it('keeps a scope only where the page has one, and never widens it', () => {
    expect(parseAccountPermissions({ leads: { level: 'edit', scope: 'own_unassigned' } })).toEqual({
      leads: { level: 'edit', delete: false, scope: 'own_unassigned' },
    })
    // Team Replies has no "own + unassigned": the narrowest it has.
    expect(parseAccountPermissions({ team_replies: { level: 'view', scope: 'own_unassigned' } })).toEqual({
      team_replies: { level: 'view', scope: 'own' },
    })
    // A class page has no scope: the tick is dropped rather than read as "everyone's".
    expect(parseAccountPermissions({ calendar: { level: 'view', scope: 'own' } })).toEqual({})
    expect(parseAccountPermissions({ leads: { level: 'view', scope: 'all' } })).toEqual({ leads: { level: 'view' } })
  })
})

describe('parseEffectivePermissions', () => {
  it('reads the total and fills a missing scope with the narrowest', () => {
    expect(parseEffectivePermissions({ leads: { level: 'edit', delete: true, scope: 'all' }, nope: { level: 'view' } })).toEqual({
      leads: { level: 'edit', delete: true, scope: 'all', editScope: 'own', deleteScope: 'own' },
    })
    expect(parseEffectivePermissions('x')).toEqual({})
  })
})

describe('describePermissions', () => {
  it('lists the ticked modules in menu order', () => {
    expect(
      describePermissions({ leads: { level: 'edit', delete: true }, calendar: { level: 'view' } }),
    ).toBe('Leads (edit, delete) · Calendar (view)')
    expect(describePermissions({ inbox: { level: 'view', scope: 'own' } })).toBe('Inbox (view, only own)')
    expect(describePermissions({})).toBe('No access yet')
  })
})
