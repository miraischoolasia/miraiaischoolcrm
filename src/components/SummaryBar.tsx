import { cn } from '../lib/cn'

export type SummaryMetric = {
  label: string
  value: number
  tone?: 'default' | 'brand' | 'blue' | 'orange' | 'green'
}

export function SummaryBar({ metrics }: { metrics: SummaryMetric[] }) {
  const toneClass = {
    default: 'text-slate-900',
    brand: 'text-[#be185d]',
    blue: 'text-sky-600',
    orange: 'text-orange-500',
    green: 'text-emerald-600',
  }

  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            'flex min-h-16 items-center justify-between gap-3 px-4 py-2.5',
            index % 2 !== 0 && 'border-l border-slate-200',
            index >= 2 && 'border-t border-slate-200 md:border-t-0',
            index > 0 && 'md:border-l md:border-slate-200',
          )}
        >
          <div className="text-xs font-medium text-slate-500">{metric.label}</div>
          <div className={cn('text-xl font-semibold', toneClass[metric.tone ?? 'default'])}>
            {metric.value}
          </div>
        </div>
      ))}
    </section>
  )
}
