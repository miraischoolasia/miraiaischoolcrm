import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check, Minus, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

// Small pieces shared by the Content Studio and Content Library pages (MASTER.md: pink only for the main
// action, black/white otherwise, rounded-xl). Every button is at least 44 px high so they line up.

// A box of its own width (add w-20 etc.); inputClass fills the line.
export const smallInputClass =
  'min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#fc0c97] focus:outline-none focus:ring-2 focus:ring-[#fc0c97]/20 disabled:bg-slate-50 disabled:text-slate-500'
export const inputClass = `w-full ${smallInputClass}`

const buttonBase =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc0c97]/40 disabled:cursor-not-allowed disabled:opacity-50'

export function PrimaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn(buttonBase, 'bg-[#fc0c97] text-white hover:bg-[#de0a84]', className)} />
}

export function SecondaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(buttonBase, 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', className)}
    />
  )
}

// A quiet action inside a card (Edit, Remove).
export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn(buttonBase, 'px-3 text-slate-600 hover:bg-slate-100', className)} />
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
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      {children}
    </label>
  )
}

// A white card with a title, one line saying what it is for, and its content.
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'bad' | 'brand' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
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
            'min-h-10 rounded-full px-4 text-sm font-semibold transition-colors',
            value === entry.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}

// The steps of a campaign, with the current one in pink and the finished ones ticked. Every step can be
// opened again.
export function Stepper({
  steps,
  current,
  done,
  onPick,
}: {
  steps: string[]
  current: number
  done: (index: number) => boolean
  onPick: (index: number) => void
}) {
  return (
    <nav aria-label="Campaign steps">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((label, index) => {
          const active = index === current
          const finished = !active && done(index)
          return (
            <li key={label}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onPick(index)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 text-left transition-colors',
                  active ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    active ? 'bg-[#fc0c97] text-white' : finished ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {finished ? <Check size={16} weight="bold" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-500">Step {index + 1}</span>
                  <span className={cn('block truncate text-sm font-semibold', active ? 'text-[#be185d]' : 'text-slate-900')}>
                    {label}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// A big choice between a few ways of doing something.
export function OptionCard({
  selected,
  title,
  description,
  icon,
  onSelect,
  disabled,
}: {
  selected: boolean
  title: string
  description: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          selected ? 'bg-[#fc0c97] text-white' : 'bg-slate-100 text-slate-600',
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-600">{description}</span>
      </span>
    </button>
  )
}

// A number with − and + (0 to max).
export function NumberStepper({
  label,
  value,
  min = 0,
  max,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(next) ? Math.floor(next) : min)))
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={disabled || value <= min}
        onClick={() => set(value - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-l-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Minus size={16} weight="bold" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        className="h-11 w-14 border-x border-slate-200 text-center text-sm font-semibold text-slate-900 focus:outline-none"
        value={value}
        disabled={disabled}
        onChange={(event) => set(Number(event.target.value.replace(/\D/g, '')) || 0)}
      />
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={disabled || value >= max}
        onClick={() => set(value + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Plus size={16} weight="bold" />
      </button>
    </div>
  )
}

export function EmptyState({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold text-slate-900">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  )
}

// The bar at the bottom of a step: Back on the left, the next step on the right.
export function StepFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">{children}</div>
}
