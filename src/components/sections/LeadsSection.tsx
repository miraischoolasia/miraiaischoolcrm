import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatDate } from '../../domain/studentStatus'
import { MAX_LEAD_FOLLOW_UPS, leadSourceOptions, leadStatusOptions } from '../../lib/constants'
import { SummaryBar } from '../SummaryBar'
import mascotGordo from '../../assets/mascot-gordo.png'
import {
  ArrowRight,
  MagnifyingGlass,
  PencilSimple,
  Phone,
  UserPlus,
} from '@phosphor-icons/react'
import type { Lead, LeadChild, LeadStatus } from '../../types/domain'

const stageToneClass: Record<LeadStatus, string> = {
  new: 'bg-slate-100 text-slate-700',
  contacted: 'bg-sky-50 text-sky-700',
  trial_scheduled: 'bg-amber-50 text-amber-700',
  trial_completed: 'bg-violet-50 text-violet-700',
  converted: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-red-50 text-red-700',
}

const sourceLabelMap = new Map(leadSourceOptions.map((option) => [option.key, option.label]))

function formatChildren(children: LeadChild[]) {
  if (children.length === 0) {
    return '-'
  }
  return children
    .map((child) => (child.name ? `${child.name} (${child.age})` : `${child.age} yrs`))
    .join(', ')
}

type LeadsSectionProps = {
  isLoading: boolean
  leads: Lead[]
  onChangeStatus: (leadId: number, status: LeadStatus) => void
  onConvertLead: (leadId: number) => void
  onEditLead: (leadId: number) => void
  onOpenCreateLead: () => void
  onOpenFollowUp: (leadId: number) => void
}

export function LeadsSection({
  isLoading,
  leads,
  onChangeStatus,
  onConvertLead,
  onEditLead,
  onOpenCreateLead,
  onOpenFollowUp,
}: LeadsSectionProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState<LeadStatus | 'all'>('all')

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = normalizedSearch
      ? (lead.fullName ?? '').toLowerCase().includes(normalizedSearch) ||
        (lead.phone ?? '').toLowerCase().includes(normalizedSearch) ||
        lead.children.some((child) => child.name.toLowerCase().includes(normalizedSearch))
      : true
    const matchesStage = stageFilter === 'all' ? true : lead.status === stageFilter
    return matchesSearch && matchesStage
  })

  const openLeads = leads.filter(
    (lead) => lead.status !== 'converted' && lead.status !== 'lost',
  )

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
            <button
              type="button"
              onClick={onOpenCreateLead}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <UserPlus size={16} weight="bold" aria-hidden="true" />
              Add Lead
            </button>
          </div>

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
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search leads by name, phone, or child's name..."
                className="w-full max-w-xs rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(event) =>
                setStageFilter(event.target.value as LeadStatus | 'all')
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
          </div>
        </div>

        {!isLoading && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-24 w-auto" />
            <p className="text-sm text-slate-500">
              {leads.length === 0
                ? 'No leads yet. Add the first inquiry to get started.'
                : 'No leads match this search or stage.'}
            </p>
          </div>
        )}

        {filteredLeads.length > 0 && (
          <>
            <ul className="divide-y divide-slate-200 md:hidden">
              {filteredLeads.map((lead) => (
                <li key={lead.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {lead.fullName || 'Unnamed Lead'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {sourceLabelMap.get(lead.source) ?? lead.source} · Added{' '}
                        {formatDate(lead.addedDate)}
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
                      <dd className="text-slate-700">{lead.phone || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Children</dt>
                      <dd className="text-right text-slate-700">
                        {formatChildren(lead.children)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-xs font-medium text-slate-500">Follow-up</dt>
                      <dd className="text-slate-700">
                        {lead.followUps.length}/{MAX_LEAD_FOLLOW_UPS}
                      </dd>
                    </div>
                  </dl>

                  <select
                    value={lead.status}
                    onChange={(event) =>
                      onChangeStatus(lead.id, event.target.value as LeadStatus)
                    }
                    disabled={lead.status === 'converted'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {leadStatusOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => onEditLead(lead.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilSimple size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFollowUp(lead.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Phone size={16} aria-hidden="true" />
                      Follow Up
                    </button>
                    <button
                      type="button"
                      disabled={lead.status === 'converted'}
                      onClick={() => onConvertLead(lead.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowRight size={16} aria-hidden="true" />
                      {lead.status === 'converted' ? 'Converted' : 'Convert'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Lead</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Children</th>
                    <th className="px-6 py-4">Source</th>
                    <th className="px-6 py-4">Stage</th>
                    <th className="px-6 py-4">Added</th>
                    <th className="px-6 py-4">Follow-up</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="align-top">
                      <td className="px-6 py-5">
                        <div className="font-semibold text-slate-900">
                          {lead.fullName || 'Unnamed Lead'}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {lead.phone || '-'}
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {formatChildren(lead.children)}
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {sourceLabelMap.get(lead.source) ?? lead.source}
                      </td>
                      <td className="px-6 py-5">
                        <select
                          value={lead.status}
                          onChange={(event) =>
                            onChangeStatus(lead.id, event.target.value as LeadStatus)
                          }
                          disabled={lead.status === 'converted'}
                          className={cn(
                            'rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none disabled:cursor-not-allowed',
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
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {formatDate(lead.addedDate)}
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600">
                        {lead.followUps.length}/{MAX_LEAD_FOLLOW_UPS}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEditLead(lead.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <PencilSimple size={16} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFollowUp(lead.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Phone size={16} aria-hidden="true" />
                            Follow Up
                          </button>
                          <button
                            type="button"
                            disabled={lead.status === 'converted'}
                            onClick={() => onConvertLead(lead.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowRight size={16} aria-hidden="true" />
                            {lead.status === 'converted' ? 'Converted' : 'Convert'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
