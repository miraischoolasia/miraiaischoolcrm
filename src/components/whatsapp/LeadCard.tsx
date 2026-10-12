import { LinkBreak } from '@phosphor-icons/react'
import type { Lead } from '../../types/domain'

// Who the chat belongs to, and a way to say it is the wrong lead.
export function LeadHeader({
  lead,
  byPhone,
  isStudent = false,
  onUnlink,
}: {
  lead: Lead
  byPhone: boolean
  // The chat is the student themself.
  isStudent?: boolean
  onUnlink: () => void
}) {
  const name = lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed lead'
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <div className="min-w-0">
        <p className="text-slate-500">
          {isStudent ? 'Lead · the student themself' : 'Lead'}
          {byPhone ? ' (found by phone number)' : ''}
        </p>
        <h4 className="truncate text-sm font-semibold text-slate-900">{name}</h4>
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
