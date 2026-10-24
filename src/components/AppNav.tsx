import { useState } from 'react'
import { AppWindow, ChalkboardTeacher, GearSix, ImagesSquare, Megaphone, SquaresFour, UsersThree, type Icon } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import type { AppSection } from '../types/domain'

// The menu: Today on its own, then the categories (Marketing, Media, My Course, Students, Admin). The side bar
// lists only the categories; a category's pages are tabs along the top of the page (PageTabs). On a phone the
// bar at the bottom has Today, the busiest categories and "More".

export type NavGroupKey = 'marketing' | 'media' | 'course' | 'students' | 'admin'

export type NavEntry = {
  id: string
  label: string
  icon: Icon
  group?: NavGroupKey
  // A page of the CRM, or (for a window such as Packages) what to open instead.
  section?: AppSection
  onSelect?: () => void
  badge?: { count: number; noun: string }
}

export const NAV_GROUPS: { key: NavGroupKey; label: string; icon: Icon }[] = [
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'media', label: 'Media', icon: ImagesSquare },
  { key: 'course', label: 'My Course', icon: ChalkboardTeacher },
  { key: 'students', label: 'Students', icon: UsersThree },
  { key: 'admin', label: 'Admin', icon: GearSix },
]

// On a phone these categories sit in the bottom bar; the others are under "More".
const PHONE_BAR: NavGroupKey[] = ['marketing', 'course', 'students']

// Entries without a group first, then each group that has something this login may use (a category with no
// page this login may use is not shown).
export function groupNav(entries: NavEntry[]) {
  return {
    top: entries.filter((entry) => !entry.group),
    groups: NAV_GROUPS.map((group) => ({ ...group, entries: entries.filter((entry) => entry.group === group.key) })).filter(
      (group) => group.entries.length > 0,
    ),
  }
}

// Where a category goes when it is chosen: its first page (not a window such as Package), else its first entry.
export function firstEntry(entries: NavEntry[]) {
  return entries.find((entry) => entry.section !== undefined) ?? entries[0]
}

// The category the open page belongs to.
export function groupOf(entries: NavEntry[], activeSection: AppSection) {
  return entries.find((entry) => entry.section === activeSection)?.group ?? null
}

// An entry that opens a window over the page (Packages, Class Settings) instead of going to a page.
const opensWindow = (entry: NavEntry) => entry.section === undefined && entry.onSelect !== undefined

// A small window sign after such an entry's name, so it is not mistaken for a page.
function WindowMark({ className }: { className?: string }) {
  return (
    <span title="Opens in a window" className={cn('inline-flex shrink-0', className)}>
      <AppWindow size={14} aria-hidden="true" />
    </span>
  )
}

function badgeTotal(entries: NavEntry[]) {
  return entries.reduce((sum, entry) => sum + (entry.badge?.count ?? 0), 0)
}

function Badge({ count, noun, corner = false }: { count: number; noun: string; corner?: boolean }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} ${noun}`}
      className={cn(
        'min-w-5 rounded-full bg-[#fc0c97] px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white',
        corner ? 'absolute right-1 top-0.5 min-w-4 px-1 text-[10px]' : 'ml-2',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function SideNav({
  entries,
  activeSection,
  collapsed,
  onSelect,
}: {
  entries: NavEntry[]
  activeSection: AppSection
  collapsed: boolean
  onSelect: (entry: NavEntry) => void
}) {
  const { top, groups } = groupNav(entries)
  const openGroup = groupOf(entries, activeSection)

  const row = (key: string, label: string, Glyph: Icon, active: boolean, count: number, onClick: () => void, windowMark = false) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex w-full items-center rounded-lg py-2 text-left text-sm font-medium transition',
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-white text-[#be185d]' : 'text-white/70 hover:bg-white/5 hover:text-white',
      )}
    >
      <Glyph size={collapsed ? 22 : 18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
      {!collapsed && <span className="ml-3 flex-1">{label}</span>}
      {!collapsed && windowMark && <WindowMark className="ml-2 opacity-60" />}
      <Badge count={count} noun="waiting" corner={collapsed} />
    </button>
  )

  return (
    <nav aria-label="Menu" className={cn('flex-1 space-y-1', collapsed ? 'px-2 pt-3' : 'px-3')}>
      {top.map((entry) =>
        row(entry.id, entry.label, entry.icon, entry.section !== undefined && entry.section === activeSection, entry.badge?.count ?? 0, () => onSelect(entry), opensWindow(entry)),
      )}
      {groups.map((group) =>
        row(group.key, group.label, group.icon, openGroup === group.key, badgeTotal(group.entries), () => onSelect(firstEntry(group.entries))),
      )}
    </nav>
  )
}

// The open category's pages as tabs, on the same row as the page's title (Today and a category with one page
// have none). The tabs sit on the header's bottom line; on a phone they go under the title and scroll sideways.
export function PageTabs({
  entries,
  activeSection,
  onSelect,
}: {
  entries: NavEntry[]
  activeSection: AppSection
  onSelect: (entry: NavEntry) => void
}) {
  const key = groupOf(entries, activeSection)
  const group = groupNav(entries).groups.find((entry) => entry.key === key)
  if (!group || group.entries.length < 2) return null
  return (
    <nav aria-label={`${group.label} pages`} className="-mx-4 -mb-px flex min-w-0 px-4 md:mx-0 md:px-0">
      <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
        {group.entries.map((entry) => {
          const active = entry.section !== undefined && entry.section === activeSection
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-[3px] px-3 text-sm font-semibold whitespace-nowrap transition',
                active ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              <entry.icon size={17} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              {entry.label}
              {opensWindow(entry) && <WindowMark className="opacity-60" />}
              {entry.badge && <Badge count={entry.badge.count} noun={entry.badge.noun} />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// On a phone: Today and the busiest categories along the bottom, the others under "More" (a small list above the
// bar). A category goes to its first page; its other pages are the tabs at the top of the page.
export function MobileNav({
  entries,
  activeSection,
  onSelect,
}: {
  entries: NavEntry[]
  activeSection: AppSection
  onSelect: (entry: NavEntry) => void
}) {
  const { top, groups } = groupNav(entries)
  const [moreOpen, setMoreOpen] = useState(false)
  const pageGroup = groupOf(entries, activeSection)
  const inBar = groups.filter((group) => PHONE_BAR.includes(group.key))
  const inMore = groups.filter((group) => !PHONE_BAR.includes(group.key))

  function choose(entry: NavEntry) {
    setMoreOpen(false)
    onSelect(entry)
  }

  const button = (key: string, label: string, Glyph: Icon, active: boolean, dot: number, onClick: () => void, expanded?: boolean) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition',
        active ? 'bg-[#fff1f8] text-[#be185d]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
      )}
    >
      <span className="relative">
        <Glyph size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
        {dot > 0 && <span aria-label={`${dot} waiting`} className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#fc0c97]" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )

  return (
    <>
      {moreOpen && (
        <>
          <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)} className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" />
          <div role="menu" aria-label="More" className="fixed inset-x-2 bottom-[4.75rem] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
            {inMore.map((group) => {
              const active = pageGroup === group.key
              return (
                <button
                  key={group.key}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(firstEntry(group.entries))}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold',
                    active ? 'bg-[#fff1f8] text-[#be185d]' : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <group.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  <span>{group.label}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-xs font-medium text-slate-400">
                    {group.entries.map((entry) => entry.label).join(' · ')}
                  </span>
                  <Badge count={badgeTotal(group.entries)} noun="waiting" />
                </button>
              )
            })}
          </div>
        </>
      )}
      {/* Solid white, no blur: an iPhone re-blurs what scrolls under a blurred bar on every frame. */}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-xl gap-1">
          {top.map((entry) =>
            button(entry.id, entry.label, entry.icon, entry.section === activeSection, entry.badge?.count ?? 0, () => choose(entry)),
          )}
          {inBar.map((group) =>
            button(group.key, group.label, group.icon, pageGroup === group.key, badgeTotal(group.entries), () => choose(firstEntry(group.entries))),
          )}
          {inMore.length > 0 &&
            button(
              'more',
              'More',
              SquaresFour,
              moreOpen || inMore.some((group) => group.key === pageGroup),
              inMore.reduce((sum, group) => sum + badgeTotal(group.entries), 0),
              () => setMoreOpen((open) => !open),
              moreOpen,
            )}
        </div>
      </nav>
    </>
  )
}
