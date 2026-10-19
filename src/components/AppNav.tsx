import { useState } from 'react'
import { AppWindow, CaretDown, ChalkboardTeacher, GearSix, Megaphone, UsersThree, type Icon } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import type { AppSection } from '../types/domain'

// The menu: Today on its own, then four groups (Marketing, Teaching, Students,
// Admin). The side bar on a computer, the bar at the bottom on a phone.

export type NavGroupKey = 'marketing' | 'teaching' | 'students' | 'admin'

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
  { key: 'teaching', label: 'Teaching', icon: ChalkboardTeacher },
  { key: 'students', label: 'Students', icon: UsersThree },
  { key: 'admin', label: 'Admin', icon: GearSix },
]

// Entries without a group first, then each group that has something this login may use.
export function groupNav(entries: NavEntry[]) {
  return {
    top: entries.filter((entry) => !entry.group),
    groups: NAV_GROUPS.map((group) => ({ ...group, entries: entries.filter((entry) => entry.group === group.key) })).filter(
      (group) => group.entries.length > 0,
    ),
  }
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
  // One group is open at a time: opening one folds the other. The group of the page that is open is the one
  // open, and it follows the page (a page opened from somewhere else, or the first page settling after the
  // menu loads, moves the open group with it; Today folds them all).
  const groupOfPage = groups.find((group) => group.entries.some((entry) => entry.section === activeSection))?.key ?? null
  const [menu, setMenu] = useState<{ section: AppSection; open: NavGroupKey | null }>({ section: activeSection, open: groupOfPage })
  if (menu.section !== activeSection) {
    setMenu({ section: activeSection, open: groupOfPage })
  }
  const openGroup = menu.section === activeSection ? menu.open : groupOfPage

  function item(entry: NavEntry) {
    const active = entry.section !== undefined && entry.section === activeSection
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onSelect(entry)}
        title={collapsed ? entry.label : undefined}
        aria-label={collapsed ? entry.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex w-full items-center rounded-lg py-2 text-left text-sm font-medium transition',
          collapsed ? 'justify-center px-0' : 'px-3',
          active ? 'bg-white text-[#be185d]' : 'text-white/70 hover:bg-white/5 hover:text-white',
        )}
      >
        <entry.icon size={collapsed ? 22 : 18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
        {!collapsed && <span className="ml-3 flex-1">{entry.label}</span>}
        {!collapsed && opensWindow(entry) && <WindowMark className="ml-2 opacity-60" />}
        {entry.badge && <Badge count={entry.badge.count} noun={entry.badge.noun} corner={collapsed} />}
      </button>
    )
  }

  return (
    <nav aria-label="Menu" className={cn('flex-1 space-y-1', collapsed ? 'px-2 pt-3' : 'px-3')}>
      {top.map(item)}
      {groups.map((group) => {
        // A menu of icons only: each group's pages one after another, a line between groups.
        if (collapsed) {
          return (
            <div key={group.key} className="space-y-1 border-t border-white/10 pt-1">
              {group.entries.map(item)}
            </div>
          )
        }
        const isOpen = openGroup === group.key
        const holdsActive = group.entries.some((entry) => entry.section === activeSection)
        return (
          <div key={group.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setMenu((current) => ({ section: activeSection, open: current.open === group.key ? null : group.key }))}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                !isOpen && holdsActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
              )}
            >
              <group.icon size={18} aria-hidden="true" />
              <span className="ml-3 flex-1">{group.label}</span>
              {!isOpen && <Badge count={badgeTotal(group.entries)} noun="waiting" />}
              <CaretDown size={14} aria-hidden="true" className={cn('ml-2 transition', isOpen && 'rotate-180')} />
            </button>
            {isOpen && <div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">{group.entries.map(item)}</div>}
          </div>
        )
      })}
    </nav>
  )
}

// On a phone: Today and the four groups along the bottom; a group opens a
// small list of its pages above the bar.
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
  const [openGroup, setOpenGroup] = useState<NavGroupKey | null>(null)
  const shownGroup = groups.find((group) => group.key === openGroup) ?? null

  function choose(entry: NavEntry) {
    setOpenGroup(null)
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
      {shownGroup && (
        <>
          <button type="button" aria-label="Close menu" onClick={() => setOpenGroup(null)} className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" />
          <div role="menu" aria-label={shownGroup.label} className="fixed inset-x-2 bottom-[4.75rem] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
            {shownGroup.entries.map((entry) => {
              const active = entry.section !== undefined && entry.section === activeSection
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(entry)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold',
                    active ? 'bg-[#fff1f8] text-[#be185d]' : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <entry.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  <span className="flex-1">{entry.label}</span>
                  {opensWindow(entry) && <WindowMark className="text-slate-400" />}
                  {entry.badge && <Badge count={entry.badge.count} noun={entry.badge.noun} />}
                </button>
              )
            })}
          </div>
        </>
      )}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl gap-1">
          {top.map((entry) =>
            button(entry.id, entry.label, entry.icon, entry.section === activeSection, entry.badge?.count ?? 0, () => choose(entry)),
          )}
          {groups.map((group) =>
            button(
              group.key,
              group.label,
              group.icon,
              openGroup === group.key || group.entries.some((entry) => entry.section === activeSection),
              badgeTotal(group.entries),
              // A group with one page goes straight there.
              () => (group.entries.length === 1 ? choose(group.entries[0]) : setOpenGroup(openGroup === group.key ? null : group.key)),
              group.entries.length > 1 ? openGroup === group.key : undefined,
            ),
          )}
        </div>
      </nav>
    </>
  )
}
