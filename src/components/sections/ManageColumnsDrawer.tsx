import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, DotsSixVertical, Lock, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { LOCKED_COLUMN, moveKey, preferenceFrom, type RosterColumnPref } from '../../lib/rosterColumnPrefs'

type DrawerColumn = { key: string; header: string }

// "Manage columns": a drawer on the right to switch the roster's columns on and off, search them and drag them into the
// order the person likes. The student's name is locked as the first column. Nothing changes until Apply.
export function ManageColumnsDrawer({
  columns,
  hidden,
  onApply,
  onClose,
}: {
  // Every column the school has, in the person's current order.
  columns: DrawerColumn[]
  hidden: string[]
  onApply: (pref: RosterColumnPref) => void
  onClose: () => void
}) {
  const [orderedKeys, setOrderedKeys] = useState(() => columns.map((column) => column.key))
  const [visible, setVisible] = useState(() => new Set(columns.filter((column) => !hidden.includes(column.key)).map((column) => column.key)))
  const [search, setSearch] = useState('')
  const [dragKey, setDragKey] = useState<string | null>(null)
  const headerOf = useMemo(() => new Map(columns.map((column) => [column.key, column.header])), [columns])
  const needle = search.trim().toLowerCase()
  const listed = orderedKeys.filter((key) => !needle || (headerOf.get(key) ?? '').toLowerCase().includes(needle))

  function toggle(key: string) {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function step(key: string, direction: -1 | 1) {
    const index = orderedKeys.indexOf(key)
    const target = orderedKeys[index + direction]
    if (target) {
      setOrderedKeys((current) => moveKey(current, key, target))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Manage columns">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Manage columns</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-slate-200 px-5 py-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search columns"
            aria-label="Search columns"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]"
          />
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {listed.map((key) => {
            const locked = key === LOCKED_COLUMN
            return (
              <li
                key={key}
                draggable={!locked && !needle}
                onDragStart={() => setDragKey(key)}
                onDragOver={(event) => {
                  if (dragKey && !locked) {
                    event.preventDefault()
                  }
                }}
                onDrop={() => {
                  if (dragKey) {
                    setOrderedKeys((current) => moveKey(current, dragKey, key))
                  }
                  setDragKey(null)
                }}
                onDragEnd={() => setDragKey(null)}
                className={cn('flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50', dragKey === key && 'opacity-50')}
              >
                {locked ? (
                  <Lock size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                ) : (
                  <DotsSixVertical size={16} className="shrink-0 cursor-grab text-slate-400" aria-hidden="true" />
                )}
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={locked || visible.has(key)}
                    disabled={locked}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 accent-[#fc0c97]"
                  />
                  <span className="truncate">{headerOf.get(key)}</span>
                </label>
                {!locked && !needle && (
                  <span className="flex shrink-0">
                    <button type="button" aria-label={`Move ${headerOf.get(key)} up`} onClick={() => step(key, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" aria-label={`Move ${headerOf.get(key)} down`} onClick={() => step(key, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      <ArrowDown size={14} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
          {listed.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-500">No column matches.</li>}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setOrderedKeys(columns.map((column) => column.key))
              setVisible(new Set(columns.map((column) => column.key)))
            }}
            className="text-sm font-medium text-[#be185d] hover:underline"
          >
            Show all
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(preferenceFrom(orderedKeys, visible))
                onClose()
              }}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
