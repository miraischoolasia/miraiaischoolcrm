import { useEffect, useState } from 'react'
import { fetchFeeCalculatorEnabled, setFeeCalculatorEnabled } from '../../lib/feeCalculator/api'

// Fired when an admin switches the Fee Calculator, so the menu follows without a reload.
export const FEE_CALCULATOR_SWITCHED = 'fee-calculator-switched'

// Class Settings: the school's Fee Calculator switch (admin). Off unless switched on, as at Mirai. Not tied to the
// school's fee fields (brand.usesFees): EduHero keeps those hidden and uses this.
export function FeeCalculatorSwitch({
  fetchEnabled = fetchFeeCalculatorEnabled,
  setEnabled = setFeeCalculatorEnabled,
}: {
  fetchEnabled?: () => Promise<boolean>
  setEnabled?: (enabled: boolean) => Promise<string | null>
}) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchEnabled().then((value) => {
      if (alive) setOn(value)
    })
    return () => {
      alive = false
    }
  }, [fetchEnabled])

  async function flip(next: boolean) {
    setBusy(true)
    const failure = await setEnabled(next)
    setBusy(false)
    setError(failure)
    if (!failure) {
      setOn(next)
      window.dispatchEvent(new Event(FEE_CALCULATOR_SWITCHED))
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Fee Calculator</h3>
        <p className="text-sm text-slate-500">
          A page under Students that works out tuition, materials, postage and the registration fee for a new student and writes the text for the
          parent. Staff use it with the &quot;Fee Calculator&quot; tick (My Team); its prices are set on the page.
        </p>
      </div>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
        <input type="checkbox" checked={on === true} disabled={on === null || busy} onChange={(e) => void flip(e.target.checked)} />
        Use the Fee Calculator at this school
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
