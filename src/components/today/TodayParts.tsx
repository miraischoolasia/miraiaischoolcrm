import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

// The small pieces every Today card is made of, so the role versions look like the rest of the page.

const chipClass = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-slate-100 text-slate-600',
}

export function TodayChip({ tone, children }: { tone: keyof typeof chipClass; children: ReactNode }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', chipClass[tone])}>
      {children}
    </span>
  )
}

export const todayPrimaryButton =
  'rounded-xl bg-[#fc0c97] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]'
export const todaySecondaryButton =
  'rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'

export function TodayCard({
  id,
  title,
  summary,
  children,
}: {
  id: string
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 id={id} className="text-lg font-semibold text-slate-900">
          {title}
        </h3>
        {summary && <p className="text-sm text-slate-500">{summary}</p>}
      </div>
      {children}
    </section>
  )
}

export function TodayRows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-slate-100 px-4">{children}</ul>
}

export function TodayRow({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">{title}</div>
        {sub && <div className="text-sm text-slate-500">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </li>
  )
}

export type Kpi = { label: string; value: string; note?: string }

export function TodayKpis({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 px-3 py-2">
          <dd className="text-2xl font-extrabold tabular-nums text-slate-900">{item.value}</dd>
          <dt className="text-xs text-slate-500">{item.label}</dt>
          {item.note && <div className="text-xs text-slate-400">{item.note}</div>}
        </div>
      ))}
    </dl>
  )
}

export function money(amount: number) {
  return `RM ${amount.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
}
