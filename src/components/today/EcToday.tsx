import type { ReactNode } from 'react'
import { fetchTodayEc, type TodayEc } from '../../lib/today'
import { useTodayData } from '../../hooks/useTodayData'
import {
  money,
  TodayCard,
  TodayChip,
  TodayKpis,
  TodayRow,
  TodayRows,
  todayPrimaryButton,
  todaySecondaryButton,
} from './TodayParts'

const quotationStatus: Record<string, string> = {
  needs_approval: 'Waiting for approval',
  sent: 'Sent',
  viewed: 'Parent looked',
  confirmed: 'Parent confirmed',
}

type EcTodayProps = {
  // Null: the signed-in person; an admin looking at somebody's Today passes their id.
  personId: number | null
  // The school's word for this role ("EC").
  roleName: string
  // The follow-up work list (FollowUpWorklist) for this person, built by the page that owns the calendar items.
  followUps?: ReactNode
  onOpenLead: (leadId: number) => void
  onOpenLeads: () => void
  // For tests; otherwise the database is asked.
  preloaded?: TodayEc | null
}

// The sales (EC) version of Today: what to follow up, today's trials, quotations not paid yet, this month. Only the
// person's own leads (the database does the choosing). A card with nothing in it is not drawn.
export function EcToday({ personId, roleName, followUps, onOpenLead, onOpenLeads, preloaded }: EcTodayProps) {
  const fetched = useTodayData(fetchTodayEc, personId)
  const data = preloaded === undefined ? fetched.data : preloaded
  const trials = data?.trialsToday ?? []
  const quotations = data?.quotations ?? []
  const wrong = quotations.filter((quote) => quote.parentSaidWrong).length

  return (
    <div className="space-y-4">
      {followUps}

      {trials.length > 0 && (
        <TodayCard id="ec-trials" title="Trials today" summary={`${trials.length} of your leads`}>
          <TodayRows>
            {trials.map((trial) => (
              <TodayRow
                key={`${trial.leadId}-${trial.childName}-${trial.startTime}`}
                title={`${trial.startTime} · ${trial.childName}`}
                sub={trial.className}
                actions={
                  trial.leadId !== null ? (
                    <button type="button" className={todaySecondaryButton} onClick={() => onOpenLead(trial.leadId as number)}>
                      Open lead
                    </button>
                  ) : undefined
                }
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {quotations.length > 0 && (
        <TodayCard
          id="ec-quotations"
          title="Quotations not paid yet"
          summary={wrong > 0 ? `${wrong} where the parent said the details are wrong` : `${quotations.length} open`}
        >
          <TodayRows>
            {quotations.map((quote) => (
              <TodayRow
                key={quote.reference}
                title={`${quote.childName} · ${money(quote.total)}`}
                sub={`${quote.reference} · sent ${quote.sentOn}`}
                actions={
                  <>
                    {quote.parentSaidWrong ? (
                      <TodayChip tone="bad">Details wrong</TodayChip>
                    ) : (
                      <TodayChip tone={quote.status === 'needs_approval' ? 'warn' : 'info'}>
                        {quotationStatus[quote.status] ?? quote.status}
                      </TodayChip>
                    )}
                    {quote.leadId !== null && (
                      <button type="button" className={todayPrimaryButton} onClick={() => onOpenLead(quote.leadId as number)}>
                        Open lead
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {data?.available && (
        <TodayCard id="ec-month" title={`My ${roleName} month`}>
          <TodayKpis
            items={[
              { label: 'Open leads', value: String(data.leadsOpen) },
              { label: 'New today', value: String(data.leadsNewToday) },
              { label: 'Leads this month', value: String(data.leadsMonth) },
              { label: 'Converted this month', value: String(data.convertedMonth) },
              { label: 'Paid this month', value: money(data.revenueMonth) },
            ]}
          />
          <div className="px-4 pb-4">
            <button type="button" className={todaySecondaryButton} onClick={onOpenLeads}>
              Open Leads
            </button>
          </div>
        </TodayCard>
      )}
    </div>
  )
}
