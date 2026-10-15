import { useEffect, useMemo, useRef, useState } from 'react'
import { createWaConnect, type WaConnect, type WaLinkState, type WaQr } from '../../lib/waConnect'

const QR_REFRESH_MS = 20_000
const STATE_POLL_MS = 3_000

// Admin: link the school's WhatsApp number by scanning a QR code with the phone. Nothing is asked of
// WhatsApp until the admin presses the button, and nothing shows when this school has no such door.
export function LinkWhatsAppPanel({ apiUrl, connect }: { apiUrl: string; connect?: WaConnect }) {
  const api = useMemo(() => connect ?? createWaConnect(apiUrl), [apiUrl, connect])
  const [state, setState] = useState<WaLinkState | 'checking'>('checking')
  const [showing, setShowing] = useState(false)
  const [qr, setQr] = useState<WaQr | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    api
      .state()
      .then((next) => {
        if (!stopped.current) {
          setState(next)
        }
      })
      .catch(() => {
        if (!stopped.current) {
          setState('unavailable')
        }
      })
    return () => {
      stopped.current = true
    }
  }, [api])

  // While the code is on screen: a fresh code every 20 seconds, and a look at the link every 3.
  useEffect(() => {
    if (!showing) {
      return
    }
    let cancelled = false
    const loadQr = () => {
      api
        .qr()
        .then((next) => {
          if (!cancelled) {
            setQr(next)
            setError(null)
          }
        })
        .catch((problem: unknown) => {
          if (!cancelled) {
            setError(problem instanceof Error ? problem.message : 'Could not get a QR code.')
          }
        })
    }
    const checkLink = () => {
      api
        .state()
        .then((next) => {
          if (cancelled) {
            return
          }
          setState(next)
          if (next === 'open') {
            setShowing(false)
          }
        })
        .catch(() => undefined)
    }
    loadQr()
    const qrTimer = window.setInterval(loadQr, QR_REFRESH_MS)
    const stateTimer = window.setInterval(checkLink, STATE_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(qrTimer)
      window.clearInterval(stateTimer)
    }
  }, [api, showing])

  if (state === 'checking' || state === 'unavailable') {
    return null
  }

  return (
    <section className="rounded-xl border border-slate-200 px-4 py-3" aria-label="Link a WhatsApp phone">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">WhatsApp phone</p>
          <p className="text-xs text-slate-500">
            {state === 'open'
              ? 'Linked. Messages come into this inbox.'
              : 'Not linked yet. Link the school phone by scanning a QR code.'}
          </p>
        </div>
        {state === 'open' ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Linked</span>
        ) : (
          !showing && (
            <button
              type="button"
              onClick={() => {
                setQr(null)
                setError(null)
                setShowing(true)
              }}
              className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e00b88]"
            >
              Show QR code
            </button>
          )
        )}
      </div>

      {showing && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {qr?.image ? (
            <img src={qr.image} alt="WhatsApp QR code" className="h-56 w-56 rounded-lg border border-slate-200" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
              {error ?? 'Getting the QR code...'}
            </div>
          )}
          {qr?.pairingCode && (
            <p className="text-xs text-slate-600">
              Or link with a code: <span className="font-mono font-semibold">{qr.pairingCode}</span>
            </p>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-left text-xs text-slate-600">
            <li>On the phone, open WhatsApp.</li>
            <li>Go to Settings, then Linked devices, then Link a device.</li>
            <li>Point the phone at this QR code. A new code appears by itself every 20 seconds.</li>
          </ol>
          <button
            type="button"
            onClick={() => setShowing(false)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      )}
    </section>
  )
}
