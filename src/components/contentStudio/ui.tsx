import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

// Small pieces shared by the Content Studio and Content Library pages (MASTER.md: pink for the main action,
// black/white otherwise, rounded-xl).

// A box of its own width (add w-20 etc.); inputClass fills the line.
export const smallInputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#fc0c97] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'
export const inputClass = `w-full ${smallInputClass}`

export function PrimaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}

export function SecondaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}

export type NoticeValue = { text: string; isError: boolean } | null

export function Notice({ notice }: { notice: NoticeValue }) {
  if (!notice) return null
  return (
    <p
      role={notice.isError ? 'alert' : 'status'}
      className={cn(
        'rounded-xl px-4 py-3 text-sm',
        notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
      )}
    >
      {notice.text}
    </p>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      {children}
    </label>
  )
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'bad' | 'brand' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'good' && 'bg-emerald-50 text-emerald-700',
        tone === 'bad' && 'bg-red-50 text-red-700',
        tone === 'brand' && 'bg-[#fff1f8] text-[#be185d]',
        tone === 'warn' && 'bg-amber-50 text-amber-800',
        tone === 'plain' && 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </span>
  )
}

export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string
  tabs: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((entry) => (
        <button
          key={entry.key}
          type="button"
          role="tab"
          aria-selected={value === entry.key}
          onClick={() => onChange(entry.key)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-semibold',
            value === entry.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
