import { DownloadSimple, Trash, X } from '@phosphor-icons/react'
import { leadStatusOptions } from '../lib/constants'
import type { LeadBulkAction, LeadOption, LeadStatus } from '../types/domain'

// Converting needs a student record made, so it is never done in bulk.
const bulkStageOptions = leadStatusOptions.filter((option) => option.key !== 'converted')

const selectClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97]'

type LeadBulkBarProps = {
  // How many leads are selected, and how many match the filters in all.
  count: number
  total: number
  canEdit: boolean
  canDelete: boolean
  // The names that can be handed out; hidden ones are left out by the caller.
  pics: LeadOption[]
  sources: LeadOption[]
  tags: LeadOption[]
  onSelectAll: () => void
  onClear: () => void
  onAction: (action: LeadBulkAction) => void
  onExport: () => void
}

// What can be done to the leads that are ticked in the list. Choosing a value
// in a list starts that action (the page asks to confirm first).
export function LeadBulkBar({
  count,
  total,
  canEdit,
  canDelete,
  pics,
  sources,
  tags,
  onSelectAll,
  onClear,
  onAction,
  onExport,
}: LeadBulkBarProps) {
  // Each list springs back to its title, ready for the next choice.
  function choose(event: React.ChangeEvent<HTMLSelectElement>, toAction: (value: string) => LeadBulkAction) {
    const value = event.target.value
    event.target.value = ''
    if (value) {
      onAction(toAction(value))
    }
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="space-y-3 border-b border-pink-100 bg-[#fff8fc] px-5 py-3 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-slate-900">
          {count} {count === 1 ? 'lead' : 'leads'} selected
        </span>
        {count < total ? (
          <button
            type="button"
            onClick={onSelectAll}
            className="font-semibold text-[#be185d] hover:text-[#9d174d]"
          >
            Select all {total} leads that match the filters
          </button>
        ) : (
          total > 1 && <span className="text-slate-500">That is every lead that matches the filters.</span>
        )}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-800"
        >
          <X size={12} aria-hidden="true" />
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <select
              aria-label="Change stage"
              defaultValue=""
              onChange={(event) =>
                choose(event, (value) => ({ type: 'stage', status: value as LeadStatus }))
              }
              className={selectClass}
            >
              <option value="">Change stage...</option>
              {bulkStageOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Set PIC"
              defaultValue=""
              onChange={(event) =>
                choose(event, (value) => ({
                  type: 'pic',
                  picId: value === 'none' ? null : Number(value),
                }))
              }
              className={selectClass}
            >
              <option value="">Set PIC...</option>
              <option value="none">Not assigned</option>
              {pics.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Set source"
              defaultValue=""
              onChange={(event) =>
                choose(event, (value) => ({ type: 'source', sourceId: Number(value) }))
              }
              className={selectClass}
            >
              <option value="">Set source...</option>
              {sources.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            {tags.length > 0 && (
              <>
                <select
                  aria-label="Add tag"
                  defaultValue=""
                  onChange={(event) =>
                    choose(event, (value) => ({ type: 'tag-add', tagId: Number(value) }))
                  }
                  className={selectClass}
                >
                  <option value="">Add tag...</option>
                  {tags.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Remove tag"
                  defaultValue=""
                  onChange={(event) =>
                    choose(event, (value) => ({ type: 'tag-remove', tagId: Number(value) }))
                  }
                  className={selectClass}
                >
                  <option value="">Remove tag...</option>
                  {tags.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <DownloadSimple size={16} aria-hidden="true" />
          Export CSV
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={() => onAction({ type: 'delete' })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            <Trash size={16} aria-hidden="true" />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
