import { useEffect, useState } from 'react'
import { fetchQuotationSettings } from '../lib/quotationApi'

// Whether the school switched quotations on (app_settings 'quotations'); false until read, before the database
// update, and when signed out.
export function useQuotationsEnabled(signedIn: boolean) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    void fetchQuotationSettings().then((settings) => {
      if (alive) setEnabled(settings.enabled)
    })
    return () => {
      alive = false
    }
  }, [signedIn])

  return signedIn && enabled
}
