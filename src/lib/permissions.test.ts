import { describe, expect, it } from 'vitest'
import { describePermissions, hasPermission, parseAccountPermissions } from './permissions'

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
})

describe('parseAccountPermissions', () => {
  it('drops anything the database would not allow', () => {
    expect(
      parseAccountPermissions({
        leads: { level: 'view', delete: true },
        activity: { level: 'edit', delete: true },
        money: { level: 'edit' },
        forms: { level: 'owner' },
      }),
    ).toEqual({ leads: { level: 'view' }, activity: { level: 'view' } })
    expect(parseAccountPermissions(null)).toEqual({})
    expect(parseAccountPermissions([])).toEqual({})
  })
})

describe('describePermissions', () => {
  it('lists the ticked modules in a fixed order', () => {
    expect(
      describePermissions({ leads: { level: 'edit', delete: true }, calendar: { level: 'view' } }),
    ).toBe('Calendar (view) · Leads (edit, delete)')
    expect(describePermissions({})).toBe('No access yet')
  })
})
