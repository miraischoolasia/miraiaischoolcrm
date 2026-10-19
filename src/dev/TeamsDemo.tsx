import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MyTeamTabs } from '../components/teams/MyTeamTabs'
import { TeamsPanel } from '../components/teams/TeamsPanel'
import { WorkingHoursPanel } from '../components/teams/WorkingHoursPanel'
import { useStaffTeams } from '../hooks/useStaffTeams'

// Only the dev server shows this (/?demo=teams): My Team > Teams and Working hours on made-up data held in
// the page, with no login and no database. The page's database calls are answered here; nothing is sent.

type Row = Record<string, unknown>

const people = [
  { id: 2, name: 'Amin', role: 'staff' as const },
  { id: 3, name: 'Bella', role: 'staff' as const },
  { id: 4, name: 'Chen', role: 'teacher' as const },
  { id: 5, name: 'Dina', role: 'staff' as const },
]

const store: Record<string, Row[]> = {
  teams: [
    { id: 1, name: 'Sales', color: '#fc0c97', description: 'Follows up leads.', permissions: { leads: { level: 'edit', scope: 'own_unassigned' }, inbox: { level: 'edit', scope: 'own' } }, is_active: true, sort_order: 0 },
    { id: 2, name: 'Office', color: '#16a34a', description: null, permissions: { calendar: { level: 'edit' }, students: { level: 'edit', delete: true } }, is_active: true, sort_order: 1 },
  ],
  team_members: [
    { team_id: 1, teacher_id: 2 },
    { team_id: 1, teacher_id: 3 },
    { team_id: 2, teacher_id: 2 },
  ],
  inbox_channels: [
    { chatwoot_inbox_id: 5, kind: 'whatsapp', label: 'Main number', access: 'open', is_active: true },
    { chatwoot_inbox_id: 6, kind: 'whatsapp', label: 'Sales number', access: 'limited', is_active: true },
  ],
  inbox_channel_access: [
    { id: 1, chatwoot_inbox_id: 6, team_id: 1, teacher_id: null, level: 'view' },
    { id: 2, chatwoot_inbox_id: 6, team_id: null, teacher_id: 2, level: 'reply' },
  ],
  lead_options: [
    { id: 1, kind: 'pic', label: 'Amin', is_active: true, teacher_id: 2 },
    { id: 2, kind: 'pic', label: 'Bella', is_active: true, teacher_id: null },
  ],
  staff_shifts: [1, 2, 3, 4, 5].map((weekday) => ({
    id: weekday,
    teacher_id: 2,
    weekday,
    start_time: '09:00:00',
    end_time: '18:00:00',
    effective_from: '2000-01-01',
    effective_to: null,
  })),
  staff_roster_changes: [
    { id: 1, teacher_id: 3, starts_at: '2026-10-21T00:00:00+08:00', ends_at: '2026-10-22T00:00:00+08:00', change: 'off', reason: 'Sick leave', swap_id: null, note: null },
  ],
  app_settings: [{ key: 'leave_reasons', value: ['Annual leave', 'Sick leave', 'Off day', 'Swap'] }],
}

let nextId = 100

function query(table: string) {
  let rows = () => store[table] ?? []
  let update: Row | null = null
  const builder = {
    select: () => builder,
    order: () => builder,
    lt: () => builder,
    gt: () => builder,
    in: (column: string, values: unknown[]) => {
      const before = rows
      rows = () => before().filter((row) => values.includes(row[column]))
      return builder
    },
    eq: (column: string, value: unknown) => {
      const before = rows
      rows = () => before().filter((row) => row[column] === value)
      if (update) {
        for (const row of rows()) Object.assign(row, update)
      }
      return builder
    },
    update: (values: Row) => {
      update = values
      return builder
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  }
  return builder
}

function rpc(name: string, args: Record<string, unknown>) {
  const ok = (data: unknown = null) => Promise.resolve({ data, error: null })
  switch (name) {
    case 'save_team': {
      const fields = { name: args.p_name, color: args.p_color, description: args.p_description || null, permissions: args.p_permissions, is_active: args.p_is_active }
      if (args.p_id) {
        Object.assign(store.teams.find((team) => team.id === args.p_id)!, fields)
        return ok(args.p_id)
      }
      const id = nextId++
      store.teams.push({ id, sort_order: store.teams.length, ...fields })
      return ok(id)
    }
    case 'set_team_members':
      store.team_members = [
        ...store.team_members.filter((row) => row.team_id !== args.p_team_id),
        ...(args.p_teacher_ids as number[]).map((id) => ({ team_id: args.p_team_id, teacher_id: id })),
      ]
      return ok()
    case 'set_inbox_channel': {
      store.inbox_channels = store.inbox_channels.filter((row) => row.chatwoot_inbox_id !== args.p_inbox_id)
      store.inbox_channels.push({ chatwoot_inbox_id: args.p_inbox_id, kind: args.p_kind, label: args.p_label, access: args.p_access, is_active: args.p_is_active })
      store.inbox_channel_access = [
        ...store.inbox_channel_access.filter((row) => row.chatwoot_inbox_id !== args.p_inbox_id),
        ...(args.p_grants as Row[]).map((grant) => ({ id: nextId++, chatwoot_inbox_id: args.p_inbox_id, team_id: grant.team_id ?? null, teacher_id: grant.teacher_id ?? null, level: grant.level })),
      ]
      return ok()
    }
    case 'save_staff_week':
      store.staff_shifts = [
        ...store.staff_shifts.filter((row) => row.teacher_id !== args.p_teacher_id),
        ...(args.p_shifts as Row[]).map((time) => ({ id: nextId++, teacher_id: args.p_teacher_id, weekday: time.weekday, start_time: `${time.start}:00`, end_time: `${time.end}:00`, effective_from: '2000-01-01', effective_to: null })),
      ]
      return ok()
    case 'add_roster_change':
      store.staff_roster_changes.push({ id: nextId++, teacher_id: args.p_teacher_id, starts_at: args.p_starts_at, ends_at: args.p_ends_at, change: args.p_change, reason: args.p_reason, swap_id: null, note: args.p_note })
      return ok()
    case 'add_shift_swap': {
      const swap = `swap-${nextId++}`
      store.staff_roster_changes.push(
        { id: nextId++, teacher_id: args.p_from_teacher_id, starts_at: args.p_starts_at, ends_at: args.p_ends_at, change: 'off', reason: args.p_reason, swap_id: swap, note: args.p_note },
        { id: nextId++, teacher_id: args.p_to_teacher_id, starts_at: args.p_starts_at, ends_at: args.p_ends_at, change: 'extra', reason: args.p_reason, swap_id: swap, note: args.p_note },
      )
      return ok()
    }
    case 'delete_roster_change': {
      const row = store.staff_roster_changes.find((change) => change.id === args.p_id)
      store.staff_roster_changes = store.staff_roster_changes.filter((change) => change.id !== args.p_id && (!row?.swap_id || change.swap_id !== row.swap_id))
      return ok()
    }
    case 'set_business_hours':
    case 'set_leave_reasons': {
      const key = name === 'set_business_hours' ? 'business_hours' : 'leave_reasons'
      store.app_settings = [...store.app_settings.filter((row) => row.key !== key), { key, value: args.p_value ?? args.p_reasons }]
      return ok()
    }
    default:
      return ok()
  }
}

if (supabase) {
  const client = supabase as unknown as { from: unknown; rpc: unknown }
  client.from = query
  client.rpc = rpc
}

export function TeamsDemo() {
  const staffTeams = useStaffTeams(true)
  const [, setTick] = useState(0)
  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <MyTeamTabs
        accounts={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">(The account list, as before.)</div>}
        teams={
          <TeamsPanel
            teams={staffTeams.teams}
            members={staffTeams.members}
            missing={staffTeams.missing}
            loadError={staffTeams.error}
            people={people}
            onChanged={async () => {
              await staffTeams.refresh()
              setTick((tick) => tick + 1)
            }}
            listInboxes={async () => [
              { id: 5, name: 'Main number', kind: 'whatsapp' },
              { id: 6, name: 'Sales number', kind: 'whatsapp' },
              { id: 7, name: 'Mirai Facebook Page', kind: 'messenger' },
              { id: 8, name: 'mirai.ai.school', kind: 'instagram' },
            ]}
          />
        }
        hours={<WorkingHoursPanel people={people} canEdit canEditSettings todayString="2026-10-19" />}
      />
    </div>
  )
}
