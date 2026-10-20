import { useEffect, useMemo, useRef, useState } from 'react'
import { createWaConnect, type WaConnect, type WaLinkState, type WaQr } from '../../lib/waConnect'

// How often the panel looks at the code WhatsApp has now. Looking does not make a new code: WhatsApp makes one by
// itself about every 20 seconds, and the picture changes only when it has. (Before, the panel asked for a code every
// 20 seconds and the link every 3: more asking, and a linking that had ended was started again each time.)
export const QR_LOOK_MS = 4_000
// Every this many looks, also whether the phone got linked (the code answer says so too, when it can).
const STATE_EVERY = 5
// A try stops by itself after this long: too many codes in a row and WhatsApp refuses to link for a while.
export const QR_TRY_MS = 2 * 60_000

type Phase = 'idle' | 'running' | 'stopped'

// Admin: link the school's WhatsApp number by scanning a QR code with the phone. Nothing is asked of WhatsApp
// until the admin presses the button, a try lasts at most 2 minutes, and nothing shows when this school has no
// such door.
// instance: which of the school's numbers (its Evolution name), with title its name on screen; left out for a school
// with one number.
export function LinkWhatsAppPanel({
  apiUrl,
  connect,
  instance = null,
  title = 'WhatsApp phone',
  autoStart = false,
}: {
  apiUrl: string
  connect?: WaConnect
  instance?: string | null
  title?: string
  // A number the admin has just added: its QR code shows at once, without pressing the button.
  autoStart?: boolean
}) {
  const api = useMemo(() => connect ?? createWaConnect(apiUrl, undefined, instance), [apiUrl, connect, instance])
  const [state, setState] = useState<WaLinkState | 'checking'>('checking')
  const [phase, setPhase] = useState<Phase>('idle')
  const [qr, setQr] = useState<WaQr | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(QR_TRY_MS / 1000)
  const stopped = useRef(false)

  // Linked or not, once, when the panel opens. Nothing else is asked until the button is pressed.
  useEffect(() => {
    stopped.current = false
    api
      .state()
      .then((next) => {
        if (!stopped.current) {
          setState(next)
          if (autoStart && (next === 'close' || next === 'connecting')) {
            setPhase('running')
          }
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
    // autoStart counts only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  // While a try is going on: look at the current code every few seconds (the picture changes only when WhatsApp
  // made a new one), see whether the phone got linked, and stop after 2 minutes, when the linking has ended, when
  // the tab is hidden, or when the panel closes.
  useEffect(() => {
    if (phase !== 'running') {
      return
    }
    let cancelled = false
    let lastCount: number | null = null
    let looks = 0
    const startedAt = Date.now()
    const stop = () => {
      if (!cancelled) {
        setPhase('stopped')
        setQr(null)
      }
    }
    const linked = () => {
      if (!cancelled) {
        setState('open')
        setPhase('idle')
        setQr(null)
      }
    }
    const look = () => {
      api
        .qr()
        .then((next) => {
          if (cancelled) {
            return
          }
          if (next.linked) {
            linked()
            return
          }
          // The count started again: the linking had ended and asking began a new one. Once is enough.
          if (next.count !== null && lastCount !== null && next.count < lastCount) {
            stop()
            return
          }
          lastCount = next.count ?? lastCount
          setError(null)
          setQr((shown) => (shown && shown.key !== null && shown.key === next.key ? shown : next))
        })
        .catch((problem: unknown) => {
          if (!cancelled) {
            setError(problem instanceof Error ? problem.message : 'Could not get a QR code.')
          }
        })
    }
    const tick = () => {
      if (Date.now() - startedAt >= QR_TRY_MS || document.hidden) {
        stop()
        return
      }
      setSecondsLeft(Math.max(0, Math.ceil((QR_TRY_MS - (Date.now() - startedAt)) / 1000)))
      looks += 1
      if (looks % STATE_EVERY === 0) {
        api
          .state()
          .then((next) => {
            if (next === 'open') {
              linked()
            }
          })
          .catch(() => undefined)
      }
      look()
    }
    look()
    const timer = window.setInterval(tick, QR_LOOK_MS)
    const onHidden = () => {
      if (document.hidden) {
        stop()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [api, phase])

  if (state === 'checking') {
    return null
  }
  // This school's inbox server has no door for linking from here (Mirai's, on 2026-10-19). The Numbers window is
  // the admin's, so they are told rather than shown nothing; a number already linked keeps working as before.
  if (state === 'unavailable') {
    return (
      <section className="rounded-xl border border-slate-200 px-4 py-3" aria-label={`Link ${title}`}>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">
          Linking the phone from the CRM is not turned on for this school yet (the inbox server needs it). A number that
          is already linked keeps sending and receiving as before.
        </p>
      </section>
    )
  }

  const start = () => {
    setQr(null)
    setError(null)
    setSecondsLeft(QR_TRY_MS / 1000)
    setPhase('running')
  }

  return (
    <section className="rounded-xl border border-slate-200 px-4 py-3" aria-label={`Link ${title}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            {state === 'open'
              ? 'Linked. Messages come into this inbox.'
              : 'Not linked yet. Link the school phone by scanning a QR code.'}
          </p>
        </div>
        {state === 'open' ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Linked</span>
        ) : (
          phase !== 'running' && (
            <button
              type="button"
              onClick={start}
              className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e00b88]"
            >
              Show QR code
            </button>
          )
        )}
      </div>

      {phase === 'stopped' && state !== 'open' && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">
          <p className="font-semibold text-slate-800">Stopped. Press the button to try again.</p>
          <p className="mt-1">
            If the phone says it couldn't link: update WhatsApp on the phone to the newest version; a phone can have at
            most 4 linked devices; after several failed scans, wait 30 minutes before trying again.
          </p>
        </div>
      )}

      {phase === 'running' && (
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
            <li>Point the phone at this QR code. WhatsApp gives a new code by itself every 20 seconds or so.</li>
          </ol>
          <p className="text-xs text-slate-500">Stops by itself in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}.</p>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      )}
    </section>
  )
}
