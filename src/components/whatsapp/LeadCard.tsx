import { LinkBreak } from '@phosphor-icons/react'
import { parentDisplayName, realNameOf, leadParentName } from '../../lib/parentLabel'
import { withCodes } from '../../lib/studentCodeLabel'
import type { Lead } from '../../types/domain'

// Who the chat belongs to, and a way to say it is the wrong lead.
export function LeadHeader({
  lead,
  byPhone,
  isStudent = false,
  parentName,
  codes = [],
  onUnlink,
}: {
  lead: Lead
  byPhone: boolean
  // The chat is the student themself.
  isStudent?: boolean
  // Given when the chat is a child's own number: the lead is the family's, called by the parent's name (the
  // family's parent when the lead has no name), never by the child's.
  parentName?: string | null
  // The student codes of this family, shown in front of the name.
  codes?: string[]
  onUnlink: () => void
}) {
  const forChild = parentName !== undefined
  const baseName = forChild
    ? (realNameOf(lead.fullName) ??
      realNameOf(parentName) ??
      parentDisplayName(null, lead.children.map((child) => child.name)) ??
      "Parent's name not saved")
    : isStudent
      ? lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed lead'
      : (leadParentName(lead) ?? (lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed lead'))
  const name = withCodes(baseName, codes)
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <div className="min-w-0">
        <p className="text-slate-500">
          {forChild ? "Family lead · the parent" : isStudent ? 'Lead · the student themself' : 'Lead'}
          {byPhone ? ' (found by phone number)' : ''}
        </p>
        <h4 className="truncate text-sm font-semibold text-slate-900" title={name}>
          {name}
        </h4>
      </div>
      {!byPhone && (
        <button
          type="button"
          onClick={onUnlink}
          title="This is the wrong lead. Unlink this chat."
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
        >
          <LinkBreak size={12} aria-hidden="true" />
          Unlink
        </button>
      )}
    </div>
  )
}
