import { useEffect, useState } from 'react'
import { cohortEntries, fetchFeeCalculatorData, subjectOptions, type FeeCalculatorData } from '../../lib/feeCalculator/api'
import type { Lead, Student } from '../../types/domain'
import { FeeCalculatorForm, type FeeCalculatorSelection } from '../feeCalculator/FeeCalculatorForm'
import { feeLevelOf } from '../../lib/inboxFees'

type Props = {
  lead: Lead | null
  // The students the chat is tied to (their grade, when the lead has none).
  students: Student[]
  load?: () => Promise<FeeCalculatorData | null>
  // "Use for a quotation": the Quotation tab opens with these fees filled in (left out where quotations are off).
  onUseForQuotation?: (selection: FeeCalculatorSelection) => void
}

// Inbox side panel, Fees tab: the Fee Team's calculator (the same form as the Fee Calculator page, its maths
// untouched), starting on the family's level when the grade is known, so an EC works out the fees without leaving
// the chat.
export function InboxFeeCalculator({ lead, students, load = fetchFeeCalculatorData, onUseForQuotation }: Props) {
  const [data, setData] = useState<FeeCalculatorData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    let alive = true
    void load().then((next) => {
      if (!alive) return
      setData(next)
      setState(next ? 'ready' : 'missing')
    })
    return () => {
      alive = false
    }
  }, [load])

  if (state === 'loading') {
    return (
      <p className="text-xs text-slate-500" aria-busy="true">
        Loading the prices…
      </p>
    )
  }
  if (!data) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        The Fee Calculator&apos;s prices could not be read.
      </p>
    )
  }
  const level = feeLevelOf(lead, students, new Date().toISOString().slice(0, 10))
  return (
    // The side panel is narrow: the form and its result stack in one column whatever the screen width, with less
    // padding round each card.
    <div className="space-y-2 text-sm [&_.lg\:grid-cols-2]:grid-cols-1 [&_.sm\:grid-cols-2]:grid-cols-1 [&_section]:rounded-xl! [&_section]:p-3!">
      {level && (
        <p className="text-xs text-slate-500">Started on {level} from the child&apos;s grade.</p>
      )}
      <FeeCalculatorForm
        key={`${lead?.id ?? 'chat'}:${data.cohorts.map((c) => `${c.id}${c.isActive}`).join()}`}
        cohorts={cohortEntries(data)}
        globalRates={data.globalRates}
        primarySubjects={subjectOptions(data, 'primary')}
        secondarySubjects={subjectOptions(data, 'secondary')}
        bioChePhySubjects={subjectOptions(data, 'bio_che_phy')}
        invoiceTemplate={data.invoiceTemplate}
        initialLevel={level ?? undefined}
        onUse={onUseForQuotation}
      />
    </div>
  )
}
