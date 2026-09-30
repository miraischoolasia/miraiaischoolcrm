import { useRef, useState } from 'react'
import { CaretLeft, CaretRight, PencilSimple, Phone } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { getTodayString } from '../domain/studentStatus'
import { leadStatusOptions } from '../lib/constants'
import type { Lead, LeadChild, LeadStatus } from '../types/domain'

function formatChildren(children: LeadChild[]) {
  if (children.length === 0) {
    return null
  }
  return children
    .map((child) => (child.name ? `${child.name} (${child.age})` : `${child.age} yrs`))
    .join(', ')
}

// Each column shows this many leads at a time, with its own pager.
export const BOARD_PAGE_SIZE = 15

const columnAccentClass: Record<LeadStatus, string> = {
  new: 'border-t-slate-400',
  contacted: 'border-t-sky-400',
  trial_scheduled: 'border-t-amber-400',
  trial_completed: 'border-t-violet-400',
  converted: 'border-t-emerald-400',
  lost: 'border-t-red-400',
}

function getReminderBadge(lead: Lead, todayString: string) {
  const soonCutoff = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const incomplete = lead.tasks.filter((task) => !task.completed)

  if (incomplete.length === 0) {
    return null
  }

  const earliest = incomplete.reduce((min, task) => (task.dueDate < min.dueDate ? task : min))

  if (earliest.dueDate < todayString) {
    return { tone: 'overdue' as const, label: 'Overdue' }
  }

  if (earliest.dueDate <= soonCutoff) {
    return { tone: 'soon' as const, label: `Due ${earliest.dueDate === todayString ? 'today' : 'soon'}` }
  }

  return null
}

type LeadKanbanBoardProps = {
  leads: Lead[]
  onChangeStatus: (leadId: number, status: LeadStatus) => void
  onConvertLead: (leadId: number) => void
  onEditLead: (leadId: number) => void
  onOpenFollowUp: (leadId: number) => void
  // The lead's PIC name, or null when nobody is assigned.
  picLabel?: (lead: Lead) => string | null
}

export function LeadKanbanBoard({
  leads,
  onChangeStatus,
  onConvertLead,
  onEditLead,
  onOpenFollowUp,
  picLabel,
}: LeadKanbanBoardProps) {
  const todayString = getTodayString()
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null)
  const [draggingLeadId, setDraggingLeadId] = useState<number | null>(null)
  const [pageByStage, setPageByStage] = useState<Partial<Record<LeadStatus, number>>>({})
  const boardRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)

  // Press on the board's background and drag to scroll it sideways, instead
  // of reaching for the scrollbar at the bottom. Cards keep their own drag
  // (to change stage), and buttons/fields keep their clicks.
  function startPan(event: React.MouseEvent<HTMLDivElement>) {
    const board = boardRef.current
    const target = event.target as HTMLElement
    if (
      !board ||
      event.button !== 0 ||
      target.closest('[draggable="true"], button, a, input, select, textarea')
    ) {
      return
    }

    event.preventDefault()
    const startX = event.clientX
    const startScrollLeft = board.scrollLeft
    setIsPanning(true)

    function onMove(moveEvent: MouseEvent) {
      board!.scrollLeft = startScrollLeft - (moveEvent.clientX - startX)
    }
    function onUp() {
      setIsPanning(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={boardRef}
      data-testid="lead-board"
      onMouseDown={startPan}
      className={cn(
        'flex gap-4 overflow-x-auto p-5 sm:p-6',
        isPanning ? 'cursor-grabbing select-none' : 'cursor-grab',
      )}
    >
      {leadStatusOptions.map((stage) => {
        const allStageLeads = leads.filter((lead) => lead.status === stage.key)
        const pageCount = Math.max(1, Math.ceil(allStageLeads.length / BOARD_PAGE_SIZE))
        const page = Math.min(pageByStage[stage.key] ?? 1, pageCount)
        const stageLeads = allStageLeads.slice(
          (page - 1) * BOARD_PAGE_SIZE,
          page * BOARD_PAGE_SIZE,
        )
        const goToPage = (next: number) =>
          setPageByStage((current) => ({ ...current, [stage.key]: next }))

        return (
          <div
            key={stage.key}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverStage(stage.key)
            }}
            onDragLeave={() => setDragOverStage((current) => (current === stage.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverStage(null)
              const leadId = Number(event.dataTransfer.getData('text/plain'))
              if (!Number.isFinite(leadId)) {
                return
              }
              const lead = leads.find((entry) => entry.id === leadId)
              if (stage.key === 'converted') {
                if (lead && lead.status !== 'converted') {
                  onConvertLead(leadId)
                }
                return
              }
              onChangeStatus(leadId, stage.key)
            }}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-2xl border-t-4 bg-slate-50 transition',
              columnAccentClass[stage.key],
              dragOverStage === stage.key && 'bg-[#fff1f8] ring-2 ring-[#fc0c97]',
            )}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                {allStageLeads.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 px-3 pb-3">
              {stageLeads.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                  No leads
                </div>
              )}

              {stageLeads.map((lead) => {
                const reminder = getReminderBadge(lead, todayString)
                const childSummary = formatChildren(lead.children)

                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(lead.id))
                      event.dataTransfer.effectAllowed = 'move'
                      setDraggingLeadId(lead.id)
                    }}
                    onDragEnd={() => setDraggingLeadId(null)}
                    className={cn(
                      'cursor-grab space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition active:cursor-grabbing',
                      draggingLeadId === lead.id && 'opacity-40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {lead.phone || lead.fullName || 'No phone'}
                      </span>
                      {reminder && (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            reminder.tone === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {reminder.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {childSummary || 'No children listed'}
                    </div>
                    {picLabel?.(lead) && (
                      <div className="text-xs font-medium text-[#be185d]">
                        PIC: {picLabel(lead)}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditLead(lead.id)}
                        aria-label="Edit lead"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <PencilSimple size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenFollowUp(lead.id)}
                        aria-label="Follow up"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Phone size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between px-3 pb-3 text-xs text-slate-500">
                <button
                  type="button"
                  aria-label={`${stage.label}: previous page`}
                  disabled={page === 1}
                  onClick={() => goToPage(page - 1)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <CaretLeft size={12} aria-hidden="true" />
                </button>
                <span>
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label={`${stage.label}: next page`}
                  disabled={page === pageCount}
                  onClick={() => goToPage(page + 1)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <CaretRight size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
