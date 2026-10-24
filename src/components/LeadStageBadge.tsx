import { cn } from '../lib/cn'
import { otherChildStages } from '../lib/childStages'
import { stageLabel, stageStyle } from '../lib/leadStages'
import type { LeadChild } from '../types/domain'

type Kids = Pick<LeadChild, 'name' | 'stage'>[]

// The stage of a lead as the lists show it: the family's stage (the child who still needs following up), and
// "+N" when N other children are at a different stage; hover or tap shows whose.
export function LeadStageBadge({
  status,
  kids,
  className,
}: {
  status: string
  // The lead's children.
  kids: Kids
  className?: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', stageStyle(status).badge, className)}>
        {stageLabel(status)}
      </span>
      <MoreChildStages status={status} kids={kids} />
    </span>
  )
}

// Only the "+N" (for a place that shows the stage as a pick list of its own).
export function MoreChildStages({ status, kids }: { status: string; kids: Kids }) {
  const others = otherChildStages(kids, status)
  if (others.length === 0) {
    return null
  }
  return (
    <span
      className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
      title={others.map((entry) => `${entry.name}: ${entry.label}`).join('\n')}
      aria-label={`${others.length} more: ${others.map((entry) => `${entry.name} ${entry.label}`).join(', ')}`}
    >
      +{others.length}
    </span>
  )
}
