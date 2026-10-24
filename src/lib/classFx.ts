import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassFxPlay } from './classScreen'
import { supabase } from './supabase'

// Class effects: sounds, background music, stickers and light animations the
// teacher plays from the live class console for every child's class page
// (20261101800000_class_fx_and_look.sql). The library is the school's; the
// buttons on the console are each teacher's own (up to 8). The tables are not
// in types/database.ts yet (a shared file, filled in when the migration is
// pushed), so they are called untyped.

export type ClassFxKind = 'sound' | 'bgm' | 'sticker' | 'animation'

export type ClassFxItem = {
  id: number
  kind: ClassFxKind
  name: string
  url: string | null
  emoji: string | null
  key: string | null
  volume: number
  sort: number
  hidden: boolean
}

export const MAX_PANEL = 8
// Two presses of the same button within this time count once.
export const FX_COOLDOWN_MS = 2000

export const fxKindLabels: Record<ClassFxKind, string> = {
  sound: 'Sounds',
  bgm: 'Music',
  sticker: 'Stickers',
  animation: 'Animations',
}

// A teacher who has not picked any: these, in this order.
const defaultPanelKeys = ['applause', 'correct', 'oops', 'drumroll', 'sticker_great', 'sticker_haha', 'anim_confetti', 'bgm_calm']

function db() {
  return supabase as unknown as SupabaseClient
}

type Row = { id: number; kind: ClassFxKind; name: string; file_url: string | null; emoji: string | null; builtin_key: string | null; default_volume: number | string; sort: number; hidden: boolean }

export function itemFromRow(row: Row): ClassFxItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    url: row.file_url,
    emoji: row.emoji,
    key: row.builtin_key,
    volume: Number(row.default_volume),
    sort: row.sort,
    hidden: row.hidden,
  }
}

export async function fetchClassFx(): Promise<ClassFxItem[]> {
  if (!supabase) return []
  const { data, error } = await db()
    .from('class_fx')
    .select('id, kind, name, file_url, emoji, builtin_key, default_volume, sort, hidden')
    .order('sort')
    .order('id')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).map(itemFromRow)
}

// The teacher's own buttons, in order (ids).
export async function fetchFxPanel(): Promise<number[] | null> {
  if (!supabase) return null
  const { data, error } = await db().from('class_fx_favorites').select('fx_id, position').order('position')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { fx_id: number }[]
  return rows.length > 0 ? rows.map((row) => row.fx_id) : null
}

export async function saveFxPanel(ids: number[]): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { data: teacherId, error: whoError } = await db().rpc('current_teacher_id')
  if (whoError || typeof teacherId !== 'number') return whoError?.message ?? 'Only staff can keep effect buttons.'
  const { error: clearError } = await db().from('class_fx_favorites').delete().eq('teacher_id', teacherId)
  if (clearError) return clearError.message
  if (ids.length === 0) return null
  const { error } = await db()
    .from('class_fx_favorites')
    .insert(ids.slice(0, MAX_PANEL).map((fxId, position) => ({ teacher_id: teacherId, fx_id: fxId, position })))
  return error?.message ?? null
}

export async function updateClassFx(id: number, change: { name?: string; hidden?: boolean }): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await db().from('class_fx').update({ ...change, updated_at: new Date().toISOString() }).eq('id', id)
  return error?.message ?? null
}

// The buttons a teacher sees: their own (hidden ones dropped), else the defaults.
export function panelItems(items: ClassFxItem[], own: number[] | null): ClassFxItem[] {
  const shown = items.filter((item) => !item.hidden)
  const byId = new Map(shown.map((item) => [item.id, item]))
  if (own) return own.map((id) => byId.get(id)).filter((item): item is ClassFxItem => Boolean(item)).slice(0, MAX_PANEL)
  const byKey = new Map(shown.filter((item) => item.key).map((item) => [item.key, item]))
  const defaults = defaultPanelKeys.map((key) => byKey.get(key)).filter((item): item is ClassFxItem => Boolean(item))
  return (defaults.length > 0 ? defaults : shown).slice(0, MAX_PANEL)
}

// Adds or takes off one button (keeps the order; at most 8).
export function togglePanel(current: number[], id: number): number[] {
  if (current.includes(id)) return current.filter((other) => other !== id)
  return current.length >= MAX_PANEL ? current : [...current, id]
}

// What goes to the children when a sound, sticker or animation is played.
export function fxPlay(item: ClassFxItem, seq: number, now: number): ClassFxPlay | null {
  if (item.kind === 'bgm') return null
  return { seq, at: now, kind: item.kind, name: item.name, url: item.url, emoji: item.emoji, key: item.key, volume: item.volume }
}

// Plays a file on this computer (the teacher's listen button). Returns a stop function.
export function previewSound(url: string, volume: number, loop = false): () => void {
  const audio = new Audio(url)
  audio.volume = Math.min(1, Math.max(0, volume))
  audio.loop = loop
  void audio.play().catch(() => undefined)
  return () => {
    audio.pause()
    audio.src = ''
  }
}
