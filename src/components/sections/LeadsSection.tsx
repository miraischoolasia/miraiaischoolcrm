import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatDate, getTodayString, parseLocalDate } from '../../domain/studentStatus'
import { leadStatusOptions } from '../../lib/constants'
import { getCheckColumns, type CheckFilter } from '../../lib/leadTags'
import { SummaryBar } from '../SummaryBar'
import { LeadTrendChart } from '../LeadTrendChart'
import { LeadKanbanBoard } from '../LeadKanbanBoard'
import { LeadBulkBar } from '../LeadBulkBar'
import { LeadTagChip } from '../LeadTagChip'
import { downloadCsv } from '../../lib/downloadFile'
import { buildLeadsExportCsv } from '../../lib/leadExport'
import { WhatsAppLink } from '../WhatsAppLink'
import mascotGordo from '../../assets/mascot-gordo.png'
import {
  CaretLeft,
  CaretRight,
  ChartLineUp,
  GearSix,
  Kanban,
  ListChecks,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  UploadSimple,
  UserPlus,
} from '@phosphor-icons/react'
import type {
  Lead,
  LeadBulkAction,
  LeadCheckSlot,
  LeadChild,
  LeadOption,
  LeadStatus,
} from '../../types/domain'

const stageToneClass: Record<LeadStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  contacted: 'bg-sky-50 text-sky-700',
  trial_scheduled: 'bg-amber-50 text-amber-700',
  trial_completed: 'bg-violet-50 text-violet-700',
  converted: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-red-50 text-red-700',
}

const stageChartColor: Record<LeadStatus, string> = {
  new: '#94a3b8',
  contacted: '#0ea5e9',
  trial_scheduled: '#f59e0b',
  trial_completed: '#8b5cf6',
  converted: '#10b981',
  lost: '#ef4444',
}

export const LEADS_PAGE_SIZE = 25

function toDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getOneMonthAgo(todayString: string) {
  const date = parseLocalDate(todayString)
  date.setMonth(date.getMonth() - 1)
  return toDateString(date)
}

// "Oct 6" with the year under it, smaller, so the date takes two short lines.
function formatDayMonth(dateString: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    parseLocalDate(dateString),
  )
}

function childLabel(child: LeadChild) {
  return child.name ? `${child.name} (${child.age})` : `${child.age} yrs`
}

function formatChildren(children: LeadChild[]) {
  if (children.length === 0) {
    return '-'
  }
  return children.map(childLabel).join(', ')
}

type LeadsSectionProps = {
  isLoading: boolean
  leads: Lead[]
  // From the account's Leads permission. Converting also needs Students edit.
  canEdit?: boolean
  canDelete?: boolean
  canConvert?: boolean
  onChangeStatus: (leadId: number, status: LeadStatus) => void
  onConvertLead: (leadId: number) => void
  onEditLead: (leadId: number) => void
  onOpenCreateLead: () => void
  onOpenBulkImportLeads: () => void
  onOpenFollowUp: (leadId: number) => void
  onDeleteLead: (leadId: number) => void
  deletingLeadId: number | null
  leadOptions: LeadOption[]
  onOpenLeadOptions: () => void
  // The leads that came with form answers get a small "Form" tag that opens them.
  leadIdsWithForms?: Set<number>
  onOpenFormAnswers?: (leadId: number) => void
  // Ticks or unticks one of the three columns of boxes on a lead.
  onToggleCheck?: (leadId: number, slot: LeadCheckSlot, checked: boolean) => void
  // Who ticked a box, shown when the pointer rests on it.
  teacherNames?: Map<number, string>
  // Does one action to the selected leads (the page asks to confirm first) and
  // says whether it went through.
  onBulkAction?: (action: LeadBulkAction, leadIds: number[]) => Promise<boolean>
}

export function LeadsSection({
  isLoading,
  leads,
  canEdit = true,
  canDelete = true,
  canConvert = true,
  onChangeStatus,
  onConvertLead,
  onEditLead,
  onOpenCreateLead,
  onOpenBulkImportLeads,
  onOpenFollowUp,
  onDeleteLead,
  deletingLeadId,
  leadOptions,
  onOpenLeadOptions,
  leadIdsWithForms,
  onOpenFormAnswers,
  onToggleCheck,
  teacherNames,
  onBulkAction,
}: LeadsSectionProps) {
  const [view, setView] = useState<'pipeline' | 'board' | 'dashboard'>('pipeline')
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState<LeadStatus | 'all'>('all')
  const todayString = getTodayString()
  const [dateFrom, setDateFrom] = useState(() => getOneMonthAgo(todayString))
  const [dateTo, setDateTo] = useState(() => todayString)
  // 'all', 'none' (no PIC yet) or a PIC option id.
  const [picFilter, setPicFilter] = useState('all')
  // 'all', 'none' (no tag) or a tag option id.
  const [tagFilter, setTagFilter] = useState('all')
  const [checkFilters, setCheckFilters] = useState<Record<LeadCheckSlot, CheckFilter>>({
    1: 'all',
    2: 'all',
    3: 'all',
  })
  const [page, setPage] = useState(1)
  // The ticked leads. A selection belongs to the filters it was made with: once
  // they change it is gone, so nothing hidden is ever acted on.
  const [selection, setSelection] = useState<{ key: string; ids: Set<number> }>({
    key: '',
    ids: new Set(),
  })

  const optionLabelById = new Map(leadOptions.map((option) => [option.id, option.label]))
  const sourceOptions = leadOptions.filter((option) => option.kind === 'source')
  const picOptions = leadOptions.filter((option) => option.kind === 'pic')
  const tagOptions = leadOptions.filter((option) => option.kind === 'tag')
  const checkColumns = getCheckColumns(leadOptions)
  const tagById = new Map(tagOptions.map((option) => [option.id, option]))
  const tagsOf = (lead: Lead) => lead.tagIds.flatMap((id) => tagById.get(id) ?? [])
  const sourceLabel = (lead: Lead) =>
    (lead.sourceId !== null && optionLabelById.get(lead.sourceId)) || '-'
  const picLabel = (lead: Lead) =>
    (lead.picId !== null && optionLabelById.get(lead.picId)) || '-'
  const matchesPic = (lead: Lead) =>
    picFilter === 'all'
      ? true
      : picFilter === 'none'
        ? lead.picId === null
        : lead.picId === Number(picFilter)

  const matchesTag = (lead: Lead) =>
    tagFilter === 'all'
      ? true
      : tagFilter === 'none'
        ? lead.tagIds.length === 0
        : lead.tagIds.includes(Number(tagFilter))

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const searchDigits = normalizedSearch.replace(/\D/g, '')
  function matchesText(value: string | null) {
    return (value ?? '').toLowerCase().includes(normalizedSearch)
  }
  function matchesPhone(value: string | null) {
    return (
      matchesText(value) ||
      (searchDigits.length > 0 && (value ?? '').replace(/\D/g, '').includes(searchDigits))
    )
  }
  const searchedLeads = (
    normalizedSearch
      ? leads.filter(
          (lead) =>
            matchesText(lead.fullName) ||
            matchesPhone(lead.phone) ||
            lead.children.some((child) => matchesText(child.name) || matchesPhone(child.phone)),
        )
      : leads
  )
    .filter(matchesPic)
    .filter(matchesTag)
  // Search, PIC and date apply to both Pipeline and Board; the stage filter
  // only to Pipeline (the board's columns are the stages).
  const datedLeads = searchedLeads.filter(
    (lead) => (!dateFrom || lead.addedDate >= dateFrom) && (!dateTo || lead.addedDate <= dateTo),
  )
  // The tick columns' filters, like the stage filter, belong to the list.
  const filteredLeads = datedLeads
    .filter((lead) => (stageFilter === 'all' ? true : lead.status === stageFilter))
    .filter((lead) =>
      checkColumns.every(({ slot }) => {
        const wanted = checkFilters[slot]
        return wanted === 'all' || (wanted === 'on') === Boolean(lead.checks[slot])
      }),
    )

  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * LEADS_PAGE_SIZE
  const pagedLeads = filteredLeads.slice(pageStart, pageStart + LEADS_PAGE_SIZE)
  const filterKey = JSON.stringify([
    searchTerm,
    picFilter,
    tagFilter,
    stageFilter,
    dateFrom,
    dateTo,
    checkFilters,
  ])
  // Only leads still in the list count (one just deleted, say, no longer does).
  const selectedLeads =
    selection.key === filterKey ? filteredLeads.filter((lead) => selection.ids.has(lead.id)) : []
  const selectedIds = new Set(selectedLeads.map((lead) => lead.id))
  const pageSelectedCount = pagedLeads.filter((lead) => selectedIds.has(lead.id)).length
  const allOnPageSelected = pagedLeads.length > 0 && pageSelectedCount === pagedLeads.length

  function select(ids: Set<number>) {
    setSelection({ key: filterKey, ids })
  }
  function toggleLead(leadId: number) {
    const next = new Set(selectedIds)
    if (!next.delete(leadId)) {
      next.add(leadId)
    }
    select(next)
  }
  function togglePage() {
    const next = new Set(selectedIds)
    for (const lead of pagedLeads) {
      if (allOnPageSelected) {
        next.delete(lead.id)
      } else {
        next.add(lead.id)
      }
    }
    select(next)
  }

  async function runBulkAction(action: LeadBulkAction) {
    if (onBulkAction && (await onBulkAction(action, selectedLeads.map((lead) => lead.id)))) {
      select(new Set())
    }
  }

  function exportSelected() {
    const day = getTodayString()
    downloadCsv(`leads-${day}.csv`, buildLeadsExportCsv(selectedLeads, leadOptions, checkColumns))
  }

  // Any filter change starts again from page 1.
  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  const openLeads = leads.filter(
    (lead) => lead.status !== 'converted' && lead.status !== 'lost',
  )

  const convertedLeads = leads.filter((lead) => lead.status === 'converted')
  const conversionRate =
    leads.length > 0 ? Math.round((convertedLeads.length / leads.length) * 100) : 0
  const avgFollowUpsToConvert =
    convertedLeads.length > 0
      ? (
          convertedLeads.reduce((sum, lead) => sum + lead.followUps.length, 0) /
          convertedLeads.length
        ).toFixed(1)
      : '-'

  const stageChartData = leadStatusOptions.map((option) => ({
    label: option.label,
    value: leads.filter((lead) => lead.status === option.key).length,
    color: stageChartColor[option.key],
  }))

  // Hidden names still count for leads that use them.
  const sourceChartData = sourceOptions
    .map((option) => ({
      label: option.label,
      value: leads.filter((lead) => lead.sourceId === option.id).length,
      isActive: option.isActive,
    }))
    .filter((entry) => entry.isActive || entry.value > 0)

  const picChartData = [
    ...picOptions.map((option) => ({
      label: option.label,
      value: leads.filter((lead) => lead.picId === option.id).length,
    })),
    { label: 'Not assigned', value: leads.filter((lead) => lead.picId === null).length },
  ].filter((entry) => entry.value > 0)

  return (
    <div className="space-y-4">
      <SummaryBar
        metrics={[
          { label: 'Total Leads', value: leads.length },
          {
            label: 'New',
            value: leads.filter((lead) => lead.status === 'new').length,
            tone: 'blue',
          },
          { label: 'In Pipeline', value: openLeads.length, tone: 'orange' },
          {
            label: 'Converted',
            value: leads.filter((lead) => lead.status === 'converted').length,
            tone: 'green',
          },
        ]}
      />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Leads</h2>
              <p className="mt-1 text-sm text-slate-500">
                Track prospective students from first inquiry through to enrollment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setView('pipeline')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    view === 'pipeline'
                      ? 'bg-white text-[#be185d] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <ListChecks size={16} aria-hidden="true" />
                  Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => setView('board')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    view === 'board'
                      ? 'bg-white text-[#be185d] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <Kanban size={16} aria-hidden="true" />
                  Board
                </button>
                <button
                  type="button"
                  onClick={() => setView('dashboard')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    view === 'dashboard'
                      ? 'bg-white text-[#be185d] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <ChartLineUp size={16} aria-hidden="true" />
                  Dashboard
                </button>
              </div>
              {canEdit && (
              <>
              <button
                type="button"
                onClick={onOpenLeadOptions}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <GearSix size={16} aria-hidden="true" />
                Sources, PIC &amp; Tags
              </button>
              <button
                type="button"
                onClick={onOpenBulkImportLeads}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <UploadSimple size={16} weight="bold" aria-hidden="true" />
                Bulk Import
              </button>
              <button
                type="button"
                onClick={onOpenCreateLead}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                <UserPlus size={16} weight="bold" aria-hidden="true" />
                Add Lead
              </button>
              </>
              )}
            </div>
          </div>

          {(view === 'pipeline' || view === 'board') && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => withPageReset(setSearchTerm)(event.target.value)}
                  placeholder="Search leads by name, phone, or child's name..."
                  className="w-full max-w-xs rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
                />
              </div>

              <select
                value={picFilter}
                aria-label="Filter by PIC"
                onChange={(event) => withPageReset(setPicFilter)(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] sm:w-44"
              >
                <option value="all">All PICs</option>
                <option value="none">Not assigned</option>
                {picOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              {tagOptions.length > 0 && (
                <select
                  value={tagFilter}
                  aria-label="Filter by tag"
                  onChange={(event) => withPageReset(setTagFilter)(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] sm:w-44"
                >
                  <option value="all">All tags</option>
                  <option value="none">No tag</option>
                  {tagOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}

              {view === 'pipeline' && (
              <>
              <select
                value={stageFilter}
                onChange={(event) =>
                  withPageReset(setStageFilter)(event.target.value as LeadStatus | 'all')
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] sm:w-52"
              >
                <option value="all">All Stages</option>
                {leadStatusOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              </>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => withPageReset(setDateFrom)(event.target.value)}
                  max={dateTo || undefined}
                  aria-label="From date"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] sm:w-40"
                />
                <span className="text-sm text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => withPageReset(setDateTo)(event.target.value)}
                  min={dateFrom || undefined}
                  aria-label="To date"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] sm:w-40"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                      setPage(1)
                    }}
                    className="text-sm font-medium text-slate-400 transition hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {view === 'board' && (
          <LeadKanbanBoard
            // A new filter starts every column back on its first page.
            key={`${normalizedSearch}|${picFilter}|${tagFilter}|${dateFrom}|${dateTo}`}
            leads={datedLeads}
            picLabel={(lead) => (lead.picId === null ? null : picLabel(lead))}
            canEdit={canEdit}
            canConvert={canConvert}
            onChangeStatus={onChangeStatus}
            onConvertLead={onConvertLead}
            onEditLead={onEditLead}
            onOpenFollowUp={onOpenFollowUp}
            leadIdsWithForms={leadIdsWithForms}
            onOpenFormAnswers={onOpenFormAnswers}
          />
        )}

        {view === 'dashboard' && (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">Total Leads</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {leads.length}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">In Pipeline</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {openLeads.length}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">Conversion Rate</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-600">
                  {conversionRate}%
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">
                  Avg Follow-ups to Convert
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {avgFollowUpsToConvert}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Leads by Stage
                </div>
                <LeadTrendChart data={stageChartData} />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Leads by Source
                </div>
                <LeadTrendChart data={sourceChartData} />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Leads by PIC
                </div>
                <LeadTrendChart data={picChartData} />
              </div>
            </div>
          </div>
        )}

        {view === 'pipeline' && !isLoading && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-24 w-auto" />
            <p className="text-sm text-slate-500">
              {leads.length === 0
                ? 'No leads yet. Add the first inquiry to get started.'
                : 'No leads match this search or stage.'}
            </p>
          </div>
        )}

        {view === 'pipeline' && filteredLeads.length > 0 && (
          <>
            {selectedLeads.length > 0 && (
              <div className="hidden md:block">
                <LeadBulkBar
                  count={selectedLeads.length}
                  total={filteredLeads.length}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  pics={picOptions.filter((option) => option.isActive)}
                  sources={sourceOptions.filter((option) => option.isActive)}
                  tags={tagOptions.filter((option) => option.isActive)}
                  onSelectAll={() => select(new Set(filteredLeads.map((lead) => lead.id)))}
                  onClear={() => select(new Set())}
                  onAction={(action) => void runBulkAction(action)}
                  onExport={exportSelected}
                />
              </div>
            )}
            <ul className="divide-y divide-slate-200 md:hidden">
              {pagedLeads.map((lead) => (
                <li key={lead.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {lead.fullName || 'Unnamed Lead'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                        <SourceLink
                          label={sourceLabel(lead)}
                          onOpen={
                            leadIdsWithForms?.has(lead.id) && onOpenFormAnswers
                              ? () => onOpenFormAnswers(lead.id)
                              : undefined
                          }
                        />
                        <span>· Added {formatDate(lead.addedDate)}</span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        stageToneClass[lead.status],
                      )}
                    >
                      {leadStatusOptions.find((option) => option.key === lead.status)?.label}
                    </span>
                  </div>

                  <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Phone</dt>
                      <dd className="inline-flex items-center gap-1 text-slate-700">
                        {lead.phone || '-'}
                        <WhatsAppLink phone={lead.phone} name={lead.fullName} leadId={lead.id} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Children</dt>
                      <dd className="text-right text-slate-700">
                        {formatChildren(lead.children)}
                        <LeadTags tags={tagsOf(lead)} align="end" />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">PIC</dt>
                      <dd className="text-slate-700">{picLabel(lead)}</dd>
                    </div>
                    {checkColumns.map((column) => (
                      <div key={column.slot} className="flex items-center justify-between gap-3">
                        <dt className="text-xs font-medium text-slate-500">{column.label}</dt>
                        <dd>
                          <CheckBox
                            lead={lead}
                            slot={column.slot}
                            label={column.label}
                            disabled={!canEdit || !onToggleCheck}
                            teacherNames={teacherNames}
                            onToggle={onToggleCheck}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <select
                    value={lead.status}
                    onChange={(event) =>
                      onChangeStatus(lead.id, event.target.value as LeadStatus)
                    }
                    disabled={!canEdit || lead.status === 'converted'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {leadStatusOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onEditLead(lead.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilSimple size={16} aria-hidden="true" />
                      {canEdit ? 'Edit' : 'View'}
                    </button>
                    {canDelete && (
                    <button
                      type="button"
                      disabled={deletingLeadId === lead.id}
                      onClick={() => onDeleteLead(lead.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash size={16} aria-hidden="true" />
                      {deletingLeadId === lead.id ? 'Deleting...' : 'Delete'}
                    </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="w-8" style={{ padding: '0.625rem 0 0.625rem 1rem' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all leads on this page"
                        checked={allOnPageSelected}
                        ref={(box) => {
                          if (box) {
                            box.indeterminate = pageSelectedCount > 0 && !allOnPageSelected
                          }
                        }}
                        onChange={togglePage}
                        style={{ width: 16, height: 16, minHeight: 0, padding: 0 }}
                        className="cursor-pointer rounded accent-[#fc0c97]"
                      />
                    </th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4" style={{ paddingRight: '0.5rem' }}>
                      Children
                    </th>
                    <th className="px-6 py-4" style={{ paddingLeft: '0.25rem' }}>
                      PIC
                    </th>
                    <th className="px-6 py-4">Stage</th>
                    {checkColumns.map((column) => (
                      <th
                        key={column.slot}
                        className="w-20 text-center align-top"
                        style={{ padding: '0.5rem 0.25rem' }}
                      >
                        <div className="whitespace-nowrap text-[11px] tracking-normal">{column.label}</div>
                        <select
                          value={checkFilters[column.slot]}
                          aria-label={`Filter ${column.label}`}
                          onChange={(event) => {
                            const value = event.target.value as CheckFilter
                            setCheckFilters((current) => ({ ...current, [column.slot]: value }))
                            setPage(1)
                          }}
                          style={{
                            minHeight: 0,
                            padding: '1px 2px',
                            fontSize: '10px',
                            lineHeight: '14px',
                            borderRadius: '6px',
                          }}
                          className="mt-1 w-full border border-slate-200 bg-white font-medium normal-case tracking-normal text-slate-500 outline-none focus:border-[#fc0c97]"
                        >
                          <option value="all">All</option>
                          <option value="on">Ticked</option>
                          <option value="off">Not ticked</option>
                        </select>
                      </th>
                    ))}
                    {canDelete && <th className="px-6 py-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {pagedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      tabIndex={0}
                      aria-label={`${canEdit ? 'Edit' : 'View'} ${lead.fullName || lead.phone || 'lead'}`}
                      onClick={(event) => {
                        // A tick, a link, the stage list and the other buttons do their own thing.
                        if (!(event.target as HTMLElement).closest('a, button, input, select, textarea, label')) {
                          onEditLead(lead.id)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault()
                          onEditLead(lead.id)
                        }
                      }}
                      className={cn(
                        'cursor-pointer align-top transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none',
                        selectedIds.has(lead.id) && 'bg-[#fff8fc]',
                      )}
                    >
                      <td className="w-8 align-top" style={{ padding: '1.25rem 0 0 1rem' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${lead.fullName || lead.phone || 'this lead'}`}
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          style={{ width: 16, height: 16, minHeight: 0, padding: 0 }}
                          className="cursor-pointer rounded accent-[#fc0c97]"
                        />
                      </td>
                      <td className="whitespace-nowrap text-slate-600">
                        <div className="text-sm leading-5">{formatDayMonth(lead.addedDate)}</div>
                        <div className="text-[11px] leading-4 text-slate-400">
                          {parseLocalDate(lead.addedDate).getFullYear()}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {lead.fullName && (
                          <div className="font-semibold text-slate-900">{lead.fullName}</div>
                        )}
                        <span className="inline-flex items-center gap-1">
                          {lead.phone || '-'}
                          <WhatsAppLink phone={lead.phone} name={lead.fullName} leadId={lead.id} />
                        </span>
                        <div className="mt-1">
                          <SourceLink
                            label={sourceLabel(lead)}
                            onOpen={
                              leadIdsWithForms?.has(lead.id) && onOpenFormAnswers
                                ? () => onOpenFormAnswers(lead.id)
                                : undefined
                            }
                          />
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600" style={{ paddingRight: '0.5rem' }}>
                        {lead.children.length === 0 ? (
                          '-'
                        ) : (
                          <ul>
                            {lead.children.map((child, index) => (
                              <li key={index}>{childLabel(child)}</li>
                            ))}
                          </ul>
                        )}
                        <LeadTags tags={tagsOf(lead)} />
                      </td>
                      <td
                        className="whitespace-nowrap px-6 py-5 text-sm text-slate-600"
                        style={{ paddingLeft: '0.25rem' }}
                      >
                        {picLabel(lead)}
                      </td>
                      <td className="px-6 py-5">
                        <select
                          value={lead.status}
                          onChange={(event) =>
                            onChangeStatus(lead.id, event.target.value as LeadStatus)
                          }
                          disabled={!canEdit || lead.status === 'converted'}
                          className={cn(
                            'rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold outline-none disabled:cursor-not-allowed',
                            stageToneClass[lead.status],
                          )}
                        >
                          {leadStatusOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {checkColumns.map((column) => (
                        <td
                          key={column.slot}
                          className="text-center"
                          style={{ padding: '1.25rem 0.25rem' }}
                        >
                          <CheckBox
                            lead={lead}
                            slot={column.slot}
                            label={column.label}
                            disabled={!canEdit || !onToggleCheck}
                            teacherNames={teacherNames}
                            onToggle={onToggleCheck}
                          />
                        </td>
                      ))}
                      {canDelete && (
                        <td className="px-6 py-5 text-right">
                          <button
                            type="button"
                            disabled={deletingLeadId === lead.id}
                            onClick={() => onDeleteLead(lead.id)}
                            aria-label="Delete lead"
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash size={16} aria-hidden="true" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <nav
                aria-label="Leads pages"
                className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:px-6"
              >
                <span>
                  Showing {pageStart + 1}-{pageStart + pagedLeads.length} of {filteredLeads.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretLeft size={14} aria-hidden="true" />
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                    <button
                      key={number}
                      type="button"
                      aria-current={number === currentPage ? 'page' : undefined}
                      onClick={() => setPage(number)}
                      className={cn(
                        'min-w-9 rounded-lg border px-2.5 py-1.5 font-semibold transition',
                        number === currentPage
                          ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// A lead's tags as small pills, under whatever is above them.
function LeadTags({ tags, align = 'start' }: { tags: LeadOption[]; align?: 'start' | 'end' }) {
  if (tags.length === 0) {
    return null
  }
  return (
    <div className={cn('mt-1.5 flex flex-wrap gap-1', align === 'end' && 'justify-end')}>
      {tags.map((tag) => (
        <LeadTagChip key={tag.id} tag={tag} />
      ))}
    </div>
  )
}

// One of the three boxes on a lead. Resting on a ticked one says who ticked it
// and when.
function CheckBox({
  lead,
  slot,
  label,
  disabled,
  teacherNames,
  onToggle,
}: {
  lead: Lead
  slot: LeadCheckSlot
  label: string
  disabled: boolean
  teacherNames?: Map<number, string>
  onToggle?: (leadId: number, slot: LeadCheckSlot, checked: boolean) => void
}) {
  const stamp = lead.checks[slot]
  const who = stamp?.by != null ? teacherNames?.get(stamp.by) : undefined
  const when = stamp?.at ? formatDate(stamp.at.slice(0, 10)) : ''
  const title = stamp ? ['Ticked', who && `by ${who}`, when && `on ${when}`].filter(Boolean).join(' ') : undefined

  return (
    <input
      type="checkbox"
      checked={Boolean(stamp)}
      disabled={disabled}
      title={title}
      aria-label={`${label} for ${lead.fullName || lead.phone || 'this lead'}`}
      onChange={(event) => onToggle?.(lead.id, slot, event.target.checked)}
      style={{ width: 16, height: 16, minHeight: 0, padding: 0 }}
      className="cursor-pointer rounded accent-[#fc0c97] disabled:cursor-not-allowed"
    />
  )
}

// Where the lead came from, small enough to stay on one line. For a lead that
// came with form answers the name is a button that opens them.
function SourceLink({ label, onOpen }: { label: string; onOpen?: () => void }) {
  const text = 'block max-w-[17rem] truncate text-[11px] leading-4'

  if (!onOpen) {
    return (
      <span title={label} className={cn(text, 'text-slate-500')}>
        {label}
      </span>
    )
  }
  // table-cell-link keeps the table from padding and resizing the button; the
  // text size comes from here, and the one-line cut-off from the span inside.
  return (
    <div className="max-w-[17rem] text-[11px] leading-4">
      <button
        type="button"
        onClick={onOpen}
        title={`${label} - view the form answers`}
        aria-label={`View form answers: ${label}`}
        className="table-cell-link block max-w-full text-left font-medium text-[#be185d] underline-offset-2 hover:underline"
      >
        <span className="block truncate whitespace-nowrap">{label}</span>
      </button>
    </div>
  )
}
