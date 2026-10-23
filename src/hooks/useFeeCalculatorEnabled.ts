import { useEffect, useState } from 'react'
import { fetchFeeCalculatorEnabled } from '../lib/feeCalculator/api'
import { FEE_CALCULATOR_SWITCHED } from '../components/feeCalculator/FeeCalculatorSwitch'

// Whether the school switched the Fee Calculator on (app_settings 'fee_calculator'); false until read, before the
// database update, and when signed out. Read again when an admin flips the switch in Class Settings.
export function useFeeCalculatorEnabled(signedIn: boolean) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    const read = () =>
      void fetchFeeCalculatorEnabled().then((value) => {
        if (alive) setEnabled(value)
      })
    read()
    window.addEventListener(FEE_CALCULATOR_SWITCHED, read)
    return () => {
      alive = false
      window.removeEventListener(FEE_CALCULATOR_SWITCHED, read)
    }
  }, [signedIn])

  return signedIn && enabled
}
