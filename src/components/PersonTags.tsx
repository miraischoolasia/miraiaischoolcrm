import { LeadTagChip } from './LeadTagChip'
import { LeadTagPicker } from './LeadTagPicker'
import type { LeadOption } from '../types/domain'

// The tags of one student or parent: the same tags the leads use. Whoever may edit can add (from the
// school's list, or a new one) and take them off; everyone else just sees them.
export function PersonTags({
  tags,
  selectedIds,
  canEdit,
  onChange,
  onCreate,
  compact = false,
  showLabel = true,
}: {
  // Every tag of the school, hidden ones too (a hidden tag already on the person still shows).
  tags: LeadOption[]
  selectedIds: number[]
  canEdit: boolean
  onChange: (ids: number[]) => void
  onCreate: (label: string, color: string) => Promise<LeadOption | null>
  compact?: boolean
  showLabel?: boolean
}) {
  if (canEdit) {
    return <LeadTagPicker tags={tags} selectedIds={selectedIds} onChange={onChange} onCreate={onCreate} compact={compact} showLabel={showLabel} />
  }
  const shown = selectedIds.flatMap((id) => tags.find((tag) => tag.id === id) ?? [])
  return (
    <div className="space-y-2">
      {showLabel && <div className="text-sm font-semibold text-slate-700">Tags</div>}
      {shown.length > 0 ? (
        <div className={compact ? 'flex flex-wrap gap-1' : 'flex flex-wrap gap-1.5'}>
          {shown.map((tag) => (
            <LeadTagChip key={tag.id} tag={tag} compact={compact} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No tags.</p>
      )}
    </div>
  )
}
