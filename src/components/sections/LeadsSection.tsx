import { useState } from 'react'
import { HiddenNumberNote, LeadChannelLines } from '../LeadChannelLines'
import {
  channelsByLead,
  isHiddenNumberName,
  CHANNEL_LABEL,
  matchesChannelFilter,
  NO_CHANNEL_FILTER,
  placeChoices,
  type ChannelFilter,
  type LeadChannel,
  type LeadChannelKind,
} from '../../lib/leadChannels'
import { cn } from '../../lib/cn'
import { leadParentName } from '../../lib/parentLabel'
import { codesLabel, withCodes } from '../../lib/studentCodeLabel'
import { formatDate, getTodayString, parseLocalDate } from '../../domain/studentStatus'
import { leadStatusOptions } from '../../lib/constants'
import { stageStyle } from '../../lib/leadStages'
import { useAgeDisplay, type AgeDisplayMode } from '../../lib/ageDisplay'
import { GRADE_OPTIONS, gradeTextOn } from '../../lib/grade'
import { LeadStageBadge, MoreChildStages } from '../LeadStageBadge'
import { SummaryBar } from '../SummaryBar'
import { LeadTrendChart } from '../LeadTrendChart'
import { LeadKanbanBoard } from '../LeadKanbanBoard'
import { LeadBulkBar } from '../LeadBulkBar'
import { LeadTagChip } from '../LeadTagChip'
import { downloadCsv } from '../../lib/downloadFile'
import { buildLeadsExportCsv } from '../../lib/leadExport'
import { WhatsAppLink } from '../WhatsAppLink'
import { buildChildRows, CHILD_AGE_GROUPS } from '../../lib/leadChildren'
import { BrandMascot } from '../BrandMascot'
import {
  CaretLeft,
  CaretRight,
  ChartLineUp,
  GearSix,
  Kanban,
  ListChecks,
  UsersThree,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  UploadSimple,
  UserPlus,
} from '@phosphor-icons/react'
import type {
  Lead,
  LeadBulkAction,
  LeadChild,
  LeadOption,
  LeadStatus,
} from '../../types/domain'


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

function childLabel(child: LeadChild, mode: AgeDisplayMode = 'age') {
  const grade = mode === 'grade' ? gradeTextOn(child.gradeLevel, child.gradeYear, getTodayString()) : null
  if (grade) {
    return child.name ? `${child.name} (${grade})` : grade
  }
  return child.name ? `${child.name} (${child.age})` : `${child.age} yrs`
}

function formatChildren(children: LeadChild[], mode: AgeDisplayMode = 'age') {
  if (children.length === 0) {
    return '-'
  }
  return children.map((child) => childLabel(child, mode)).join(', ')
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
  // Opens the stages manager (an admin sets up the stages leads go through).
  onOpenStages?: () => void
  // The leads that came with form answers get a small "Form" tag that opens them.
  leadIdsWithForms?: Set<number>
  onOpenFormAnswers?: (leadId: number) => void
  // Does one action to the selected leads (the page asks to confirm first) and
  // says whether it went through.
  onBulkAction?: (action: LeadBulkAction, leadIds: number[]) => Promise<boolean>
  // The chats each lead has (WhatsApp numbers, Messenger Pages, Instagram): shown under the phone number and
  // filterable.
  leadChannels?: LeadChannel[]
  // The name of an enrolled student, so a parent with no name of their own is called by the student they have
  // ("KEW KAYDEN's Parent") when no child is written on the lead.
  studentNameOf?: (studentId: number) => string | null
  // The student codes of a lead (the student it became and its brothers and sisters), shown in front of the name and found by search.
  codeOf?: (lead: Lead) => string[]
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
  onOpenStages,
  leadIdsWithForms,
  onOpenFormAnswers,
  onBulkAction,
  leadChannels = [],
  studentNameOf,
  codeOf,
}: LeadsSectionProps) {
  // The parent as the lists call them: the real name, else "<children>'s Parent"; null leaves the number as it was.
  const parentNameOf = (lead: Lead) =>
    leadParentName(lead, lead.convertedStudentId !== null ? (studentNameOf?.(lead.convertedStudentId) ?? null) : null)
  // The contact as the lists show them: "S1234567 · name" for a family with a student, the name alone otherwise.
  const contactOf = (lead: Lead, fallback = '') => withCodes(parentNameOf(lead) ?? (lead.fullName || fallback), codeOf?.(lead) ?? [])
  const [view, setView] = useState<'pipeline' | 'board' | 'children' | 'dashboard'>('pipeline')
  // The Children view: one row per child. '' = every age.
  const [childAge, setChildAge] = useState('')
  const [childPage, setChildPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>(NO_CHANNEL_FILTER)
  const [stageFilter, setStageFilter] = useState<LeadStatus | 'all'>('all')
  const todayString = getTodayString()
  const ageMode = useAgeDisplay()
  // What was picked only counts in the mode it was picked in (an age group means nothing for grades, and the other way).
  const childFilter = ageMode === 'grade' ? (/^\d+$/.test(childAge) ? childAge : '') : CHILD_AGE_GROUPS.some((group) => group.key === childAge) ? childAge : ''
  const [dateFrom, setDateFrom] = useState(() => getOneMonthAgo(todayString))
  const [dateTo, setDateTo] = useState(() => todayString)
  // 'all', 'none' (no PIC yet) or a PIC option id.
  const [picFilter, setPicFilter] = useState('all')
  // 'all', 'none' (no tag) or a tag option id.
  const [tagFilter, setTagFilter] = useState('all')
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
  // In the school's tag order (Sources, PIC & Tags), not the order they were put on.
  const tagsOf = (lead: Lead) => tagOptions.filter((option) => lead.tagIds.includes(option.id))
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

  const channelsOfLead = channelsByLead(leadChannels)
  const matchesChannel = (lead: Lead) =>
    matchesChannelFilter(channelFilter, channelsOfLead.get(lead.id) ?? [], Boolean(lead.phone && lead.phone.trim()))
  const pagePlaces = placeChoices(leadChannels, channelFilter.channel)

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
            matchesText(codesLabel(codeOf?.(lead) ?? [])) ||
            matchesPhone(lead.phone) ||
            lead.children.some((child) => matchesText(child.name) || matchesPhone(child.phone)),
        )
      : leads
  )
    .filter(matchesPic)
    .filter(matchesTag)
    .filter(matchesChannel)
  // Search, PIC and date apply to both Pipeline and Board; the stage filter
  // only to Pipeline (the board's columns are the stages).
  const datedLeads = searchedLeads.filter(
    (lead) => (!dateFrom || lead.addedDate >= dateFrom) && (!dateTo || lead.addedDate <= dateTo),
  )
  const filteredLeads = datedLeads.filter((lead) => (stageFilter === 'all' ? true : lead.status === stageFilter))

  // The Children view: the same stage, PIC, tag and date filters, then the search and age on each child.
  const leadsForChildren = leads
    .filter(matchesPic)
    .filter(matchesTag)
    .filter(matchesChannel)
    .filter((lead) => (!dateFrom || lead.addedDate >= dateFrom) && (!dateTo || lead.addedDate <= dateTo))
    .filter((lead) => (stageFilter === 'all' ? true : lead.status === stageFilter))
  const childRows = view === 'children' ? buildChildRows(leadsForChildren, {
        search: searchTerm,
        ageGroup: ageMode === 'grade' ? '' : childFilter,
        grade: ageMode === 'grade' && childFilter !== '' ? Number(childFilter) : null,
        today: todayString,
      }) : []
  const childPageCount = Math.max(1, Math.ceil(childRows.length / LEADS_PAGE_SIZE))
  const childCurrentPage = Math.min(childPage, childPageCount)
  const pagedChildRows = childRows.slice((childCurrentPage - 1) * LEADS_PAGE_SIZE, childCurrentPage * LEADS_PAGE_SIZE)
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))

  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * LEADS_PAGE_SIZE
  const pagedLeads = filteredLeads.slice(pageStart, pageStart + LEADS_PAGE_SIZE)
  const filterKey = JSON.stringify([
    searchTerm,
    picFilter,
    tagFilter,
    channelFilter,
    stageFilter,
    dateFrom,
    dateTo,
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
    downloadCsv(`leads-${day}.csv`, buildLeadsExportCsv(selectedLeads, leadOptions))
  }

  // Any filter change starts again from page 1.
  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
      setChildPage(1)
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
    color: stageStyle(option.key).chart,
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
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Leads</h2>
              <p className="mt-1 text-sm text-slate-500">
                Track prospective students from first inquiry through to enrollment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
              <>
              <button
                type="button"
                onClick={onOpenCreateLead}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                <UserPlus size={16} weight="bold" aria-hidden="true" />
                Add Lead
              </button>
              <button
                type="button"
                onClick={onOpenLeadOptions}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <GearSix size={16} aria-hidden="true" />
                Sources, PIC &amp; Tags
              </button>
              {onOpenStages && (
                <button
                  type="button"
                  onClick={onOpenStages}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ListChecks size={16} aria-hidden="true" />
                  Manage stages
                </button>
              )}
              <button
                type="button"
                onClick={onOpenBulkImportLeads}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <UploadSimple size={16} weight="bold" aria-hidden="true" />
                Bulk Import
              </button>
              </>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
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
                  onClick={() => setView('children')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    view === 'children'
                      ? 'bg-white text-[#be185d] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <UsersThree size={16} aria-hidden="true" />
                  Children
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
          </div>

          {(view === 'pipeline' || view === 'board' || view === 'children') && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-64">
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
                  className="h-10 w-full rounded-xl border border-slate-200 pl-9! pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => withPageReset(setDateFrom)(event.target.value)}
                  max={dateTo || undefined}
                  aria-label="From date"
                  className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
                />
                <span className="text-sm text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => withPageReset(setDateTo)(event.target.value)}
                  min={dateFrom || undefined}
                  aria-label="To date"
                  className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
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
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <select
                value={picFilter}
                aria-label="Filter by PIC"
                onChange={(event) => withPageReset(setPicFilter)(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
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
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
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

              <select
                value={channelFilter.channel}
                aria-label="Filter by channel"
                onChange={(event) =>
                  withPageReset(setChannelFilter)({ channel: event.target.value as ChannelFilter['channel'], place: 'all' })
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
              >
                <option value="all">All channels</option>
                {(Object.keys(CHANNEL_LABEL) as LeadChannelKind[]).map((key) => (
                  <option key={key} value={key}>
                    {CHANNEL_LABEL[key]}
                  </option>
                ))}
              </select>

              {pagePlaces.length > 0 && (
                <select
                  value={channelFilter.place}
                  aria-label="Filter by Page or number"
                  onChange={(event) => withPageReset(setChannelFilter)({ ...channelFilter, place: event.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
                >
                  <option value="all">
                    {channelFilter.channel === 'whatsapp'
                      ? 'All numbers'
                      : channelFilter.channel === 'all'
                        ? 'All Pages and numbers'
                        : 'All Pages'}
                  </option>
                  {pagePlaces.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                </select>
              )}

              {view === 'children' && (
                <select
                  value={childFilter}
                  onChange={(event) => {
                    setChildAge(event.target.value)
                    setChildPage(1)
                  }}
                  aria-label={ageMode === 'grade' ? 'Child grade' : 'Child age'}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
                >
                  <option value="">{ageMode === 'grade' ? 'All grades' : 'All ages'}</option>
                  {ageMode === 'grade'
                    ? GRADE_OPTIONS.map((option) => (
                        <option key={option.level} value={String(option.level)}>
                          {option.label}
                        </option>
                      ))
                    : CHILD_AGE_GROUPS.map((group) => (
                        <option key={group.key} value={group.key}>
                          {group.label}
                        </option>
                      ))}
                </select>
              )}

              {(view === 'pipeline' || view === 'children') && (
              <>
              <select
                value={stageFilter}
                onChange={(event) =>
                  withPageReset(setStageFilter)(event.target.value as LeadStatus | 'all')
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97]"
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

        {view === 'children' && !isLoading && (
          <div className="overflow-x-auto">
            {childRows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">
                No children match this search or filter. Children are the ones written on a lead.
              </p>
            ) : (
              <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Child</th>
                    <th className="px-6 py-4">Age</th>
                    <th className="px-6 py-4">Contact Name</th>
                    <th className="px-6 py-4">Stage</th>
                    <th className="px-6 py-4">Source</th>
                    <th className="px-6 py-4">PIC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedChildRows.map((row) => {
                    const lead = leadById.get(row.leadId)
                    if (!lead) {
                      return null
                    }
                    return (
                      <tr
                        key={row.key}
                        tabIndex={0}
                        aria-label={`Open the lead of ${row.childName || 'this child'}`}
                        onClick={(event) => {
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
                        className="cursor-pointer align-top transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                      >
                        <td className="px-6 py-4 text-sm">
                          <div className="font-semibold text-slate-900">{row.childName || 'No name given'}</div>
                          {row.childPhone && <div className="text-xs text-slate-500">{row.childPhone}</div>}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                          {(ageMode === 'grade' ? gradeTextOn(row.gradeLevel, row.gradeYear, todayString) : null) ?? `${row.age} yrs`}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {row.parentName && <div className="font-medium text-slate-900">{withCodes(row.parentName, codeOf?.(lead) ?? [])}</div>}
                          <span className="inline-flex items-center gap-1">
                            {row.parentPhone || '-'}
                            <WhatsAppLink phone={row.parentPhone} name={row.parentName} leadId={lead.id} />
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <LeadStageBadge status={lead.status} kids={lead.children} />
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{sourceLabel(lead)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{picLabel(lead)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {childRows.length > 0 && (
              <nav
                aria-label="Children pages"
                className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:px-6"
              >
                <span>
                  Showing {(childCurrentPage - 1) * LEADS_PAGE_SIZE + 1}-
                  {(childCurrentPage - 1) * LEADS_PAGE_SIZE + pagedChildRows.length} of {childRows.length} children
                </span>
                <div className={cn('flex items-center gap-1', childPageCount <= 1 && 'hidden')}>
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={childCurrentPage === 1}
                    onClick={() => setChildPage(childCurrentPage - 1)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretLeft size={14} aria-hidden="true" />
                  </button>
                  <span className="px-2">
                    {childCurrentPage} / {childPageCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={childCurrentPage === childPageCount}
                    onClick={() => setChildPage(childCurrentPage + 1)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <CaretRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            )}
          </div>
        )}

        {view === 'pipeline' && !isLoading && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <BrandMascot name="gordo" className="h-24 w-auto" />
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
                      <div className="font-semibold text-slate-900" title={contactOf(lead, 'Unnamed Lead')}>
                        {contactOf(lead, 'Unnamed Lead')}
                        {parentNameOf(lead) === null && isHiddenNumberName(lead.fullName, lead.phone) && <HiddenNumberNote />}
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
                    <span className="shrink-0">
                      <LeadStageBadge status={lead.status} kids={lead.children} className="py-1" />
                    </span>
                  </div>

                  <dl className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">
                        {channelsOfLead.has(lead.id) ? 'Chats' : 'Phone'}
                      </dt>
                      <dd className="min-w-0 text-slate-700">
                        {lead.phone || channelsOfLead.has(lead.id) ? (
                          <LeadChannelLines
                            phone={lead.phone}
                            leadId={lead.id}
                            channels={channelsOfLead.get(lead.id) ?? []}
                            showPlaces={false}
                            phoneAction={<WhatsAppLink phone={lead.phone} name={lead.fullName} leadId={lead.id} />}
                          />
                        ) : (
                          '-'
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Children</dt>
                      <dd className="text-right text-slate-700">
                        {formatChildren(lead.children, ageMode)}
                        <LeadTags tags={tagsOf(lead)} align="end" />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">PIC</dt>
                      <dd className="text-slate-700">{picLabel(lead)}</dd>
                    </div>
                  </dl>

                  <select
                    value={lead.status}
                    onChange={(event) =>
                      onChangeStatus(lead.id, event.target.value as LeadStatus)
                    }
                    disabled={!canEdit || lead.status === 'converted'}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {leadStatusOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <MoreChildStages status={lead.status} kids={lead.children} />

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
                        {contactOf(lead) && (
                          <div className="max-w-[260px] truncate font-semibold text-slate-900" title={contactOf(lead)}>
                            {contactOf(lead)}
                            {parentNameOf(lead) === null && isHiddenNumberName(lead.fullName, lead.phone) && <HiddenNumberNote />}
                          </div>
                        )}
                        {lead.phone || channelsOfLead.has(lead.id) ? (
                          <LeadChannelLines
                            phone={lead.phone}
                            leadId={lead.id}
                            channels={channelsOfLead.get(lead.id) ?? []}
                            showPlaces={false}
                            phoneAction={<WhatsAppLink phone={lead.phone} name={lead.fullName} leadId={lead.id} />}
                            className="text-sm text-slate-600"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            -
                            <WhatsAppLink phone={lead.phone} name={lead.fullName} leadId={lead.id} />
                          </span>
                        )}
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
                              <li key={index}>{childLabel(child, ageMode)}</li>
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
                        <div className="flex flex-wrap items-center gap-1">
                          <select
                            value={lead.status}
                            onChange={(event) =>
                              onChangeStatus(lead.id, event.target.value as LeadStatus)
                            }
                            disabled={!canEdit || lead.status === 'converted'}
                            className={cn(
                              'rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold outline-none disabled:cursor-not-allowed',
                              stageStyle(lead.status).badge,
                            )}
                          >
                            {leadStatusOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <MoreChildStages status={lead.status} kids={lead.children} />
                        </div>
                      </td>
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

            {filteredLeads.length > 0 && (
              <nav
                aria-label="Leads pages"
                className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:px-6"
              >
                {/* The total is always shown, so a filter says at once how many leads match. */}
                <span>
                  Showing {pageStart + 1}-{pageStart + pagedLeads.length} of {filteredLeads.length}
                  {filteredLeads.length !== leads.length ? ` (${leads.length} leads in all)` : ''}
                </span>
                <div hidden={pageCount <= 1} className={cn('flex items-center gap-1', pageCount <= 1 && 'hidden')}>
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
