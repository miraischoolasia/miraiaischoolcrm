import { cn } from '../lib/cn'
import { formatDate, getDateMeta } from '../domain/studentStatus'

export function ExpiryCell({
  date,
  meta,
}: {
  date: string
  meta: ReturnType<typeof getDateMeta>
}) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-800">{formatDate(date)}</div>
      <div
        className={cn(
          'text-xs font-medium',
          meta.expired && 'text-red-600',
          !meta.expired && meta.dueSoon && 'text-amber-600',
          !meta.expired && !meta.dueSoon && 'text-slate-500',
        )}
      >
        {meta.expired
          ? `Expired ${Math.abs(meta.daysUntil)}d ago`
          : meta.dueSoon
            ? `Due in ${meta.daysUntil}d`
            : 'Active'}
      </div>
    </div>
  )
}
