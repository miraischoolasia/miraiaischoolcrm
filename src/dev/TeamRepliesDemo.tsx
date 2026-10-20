import { supabase } from '../lib/supabase'
import { TeamRepliesSection } from '../components/sections/TeamRepliesSection'
import { addDays, dayOf } from '../../supabase/functions/team-replies/logic'

// Only the dev server shows this (/?demo=teamreplies): the Team replies page, split by channel, on made-up
// days held in the page (four channels, three people, the phone and the automation), with no login and no
// database. The page's database calls are answered here; nothing is sent.

type Row = Record<string, unknown>

const staff = [
  { id: 2, name: 'Amin' },
  { id: 3, name: 'Bella' },
  { id: 5, name: 'Dina' },
]

const channels = [
  { chatwoot_inbox_id: 3, kind: 'whatsapp', label: 'EduHero WhatsApp', access: 'open', is_active: true },
  { chatwoot_inbox_id: 6, kind: 'whatsapp', label: 'EduHero WhatsApp 2', access: 'open', is_active: true },
  { chatwoot_inbox_id: 4, kind: 'messenger', label: 'EduHero Facebook Page', access: 'open', is_active: true },
  { chatwoot_inbox_id: 9, kind: 'instagram', label: 'eduhero.my', access: 'open', is_active: true },
]

// A small repeatable random, so every load shows the same days.
let seed = 7
function random() {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const between = (low: number, high: number) => Math.round(low + random() * (high - low))
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index)

const today = dayOf(Math.floor(Date.now() / 1000))
const replyDays: Row[] = []
const channelDays: Row[] = []
const runs: Row[] = []
// Who answers which channel: Amin both numbers, Bella the second number and Messenger, Dina Instagram.
const answers: Record<number, string[]> = { 3: ['staff:2', 'phone', 'automation'], 6: ['staff:2', 'staff:3'], 4: ['staff:3'], 9: ['staff:5'] }
const size: Record<number, number> = { 3: 40, 6: 18, 4: 9, 9: 6 }

let chat = 1000
for (let back = 30; back >= 0; back -= 1) {
  const day = addDays(today, -back)
  if (back > 0) runs.push({ day })
  for (const inbox of [3, 6, 4, 9]) {
    const chats = range(chat, between(size[inbox] * 0.6, size[inbox]))
    chat += chats.length
    const replied = chats.filter(() => random() < 0.8)
    const done = replied.filter(() => random() < 0.35)
    const firstWaits = replied.map(() => between(30, 2400))
    channelDays.push({
      day,
      inbox_id: inbox,
      incoming_messages: chats.length * between(2, 4),
      incoming_chat_ids: chats,
      replied_chat_ids: replied,
      done_chat_ids: done,
      first_waits: firstWaits,
      duty_first_waits: firstWaits.map((wait) => Math.round(wait * 0.7)),
    })
    answers[inbox].forEach((replier, index) => {
      const mine = replied.filter((_, at) => at % answers[inbox].length === index)
      if (mine.length === 0) return
      const waits = mine.map(() => between(20, 3000)).sort((a, b) => a - b)
      replyDays.push({
        day,
        replier,
        staff_id: replier.startsWith('staff:') ? Number(replier.slice(6)) : null,
        replies: mine.length * between(2, 3),
        chat_ids: mine,
        waits,
        within_target: waits.filter((wait) => wait <= 1800).length,
        slowest: waits[waits.length - 1],
        duty_waits: waits.map((wait) => Math.round(wait * 0.7)),
        duty_within_target: waits.filter((wait) => wait * 0.7 <= 1800).length,
        duty_slowest: Math.round(waits[waits.length - 1] * 0.7),
        inbox_id: inbox,
        done_chat_ids: done.filter((id) => mine.includes(id)),
      })
    })
  }
}

const store: Record<string, Row[]> = {
  team_reply_days: replyDays.filter((row) => row.day !== today),
  team_channel_days: channelDays.filter((row) => row.day !== today),
  team_reply_day_runs: runs,
  inbox_channels: channels,
}

function query(table: string) {
  let rows = () => store[table] ?? []
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: (column: string, value: string) => {
      const before = rows
      rows = () => before().filter((row) => String(row[column]) >= value)
      return builder
    },
    lte: (column: string, value: string) => {
      const before = rows
      rows = () => before().filter((row) => String(row[column]) <= value)
      return builder
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  }
  return builder
}

function rpc(name: string) {
  const ok = (data: unknown = null) => Promise.resolve({ data, error: null })
  switch (name) {
    case 'team_reply_today':
      return ok(replyDays.filter((row) => row.day === today))
    case 'team_channel_today':
      return ok(channelDays.filter((row) => row.day === today))
    case 'permission_scope':
      return ok('all')
    default:
      return ok([])
  }
}

if (supabase) {
  const client = supabase as unknown as { from: unknown; rpc: unknown }
  client.from = query
  client.rpc = rpc
}

export function TeamRepliesDemo() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <TeamRepliesSection staff={staff} client={null} hoursInUse />
    </div>
  )
}
