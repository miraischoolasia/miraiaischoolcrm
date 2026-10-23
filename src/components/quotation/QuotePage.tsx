import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Bank, ChatCircleText, CheckCircle, Clock, DownloadSimple, WarningCircle } from '@phosphor-icons/react'
import { downloadFile, quotationPdf } from '../../lib/quotationPdf'
import { confirmPublicQuotation, parentSaysPaid, parentSaysWrong, publicQuotationStatus, viewPublicQuotation } from '../../lib/quotationApi'
import type { PublicQuotation } from '../../../supabase/functions/_shared/quotation/logic.ts'

// The parent's quotation page (/?quote=<token>, no login, phone first, in Chinese): who, which classes, the price
// lines, the total; agree to the terms and pay on Razorpay. Coming back from Razorpay (&return=1) the page waits for
// Razorpay's own notice to our server (only that counts), shows that it is paid, and after 3 seconds goes on to the
// EC's after-payment link (§15). The page is read-only: "资料正确" pays (Razorpay) or "我已转账" tells the EC (bank
// transfer); "资料不对，联系顾问" tells the EC and opens their WhatsApp.

export type QuotePageApi = {
  view: typeof viewPublicQuotation
  confirm: typeof confirmPublicQuotation
  status: typeof publicQuotationStatus
  parentPaid: typeof parentSaysPaid
  parentWrong: typeof parentSaysWrong
}

const databaseApi: QuotePageApi = {
  view: viewPublicQuotation,
  confirm: confirmPublicQuotation,
  status: publicQuotationStatus,
  parentPaid: parentSaysPaid,
  parentWrong: parentSaysWrong,
}

const REDIRECT_SECONDS = 3

const money = (n: number) => `RM${n.toFixed(2)}`

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">{children}</div>
    </main>
  )
}

export function QuotePage({
  token,
  returned,
  api = databaseApi,
  goTo = (url: string) => window.location.assign(url),
  pollMs = 3000,
}: {
  token: string
  returned: boolean
  api?: QuotePageApi
  goTo?: (url: string) => void
  pollMs?: number
}) {
  const [quotation, setQuotation] = useState<PublicQuotation | null>(null)
  const [paymentsReady, setPaymentsReady] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(returned)
  const [waitedTooLong, setWaitedTooLong] = useState(false)
  // Paid as our server says, even when that comes before the quotation itself has loaded.
  const [paidAt, setPaidAt] = useState<string | null>(null)
  const [saidPaid, setSaidPaid] = useState(false)
  const [wrongSent, setWrongSent] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void api.view(token).then((reply) => {
      if (!alive) return
      if (reply.ok) {
        setQuotation(reply.quotation)
        setPaymentsReady(reply.paymentsReady)
        setSaidPaid(reply.quotation.parentSaidPaid)
        if (reply.quotation.status === 'paid') setWaiting(false)
      } else {
        setError(reply.error)
      }
    })
    return () => {
      alive = false
    }
  }, [api, token])

  // Back from Razorpay: ask every few seconds until our server has Razorpay's notice (usually seconds), up to a minute.
  useEffect(() => {
    if (!waiting) return
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      void api.status(token).then((reply) => {
        if (reply.ok && reply.status === 'paid') {
          setPaidAt(reply.paidAt ?? new Date().toISOString())
          setWaiting(false)
        }
      })
      if (tries >= Math.ceil(60000 / pollMs)) {
        setWaiting(false)
        setWaitedTooLong(true)
      }
    }, pollMs)
    return () => window.clearInterval(timer)
  }, [api, token, waiting, pollMs])

  // Just paid (back from Razorpay): on to the EC's after-payment link after a few seconds.
  const target = quotation?.afterPayUrl ?? null
  const goToRef = useRef(goTo)
  goToRef.current = goTo
  const justPaid = returned && (paidAt !== null || quotation?.status === 'paid')
  useEffect(() => {
    if (!justPaid || !target) return
    setCountdown(REDIRECT_SECONDS)
    const timer = window.setInterval(() => setCountdown((n) => (n === null || n <= 0 ? n : n - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [justPaid, target])
  useEffect(() => {
    if (countdown === 0 && target) goToRef.current(target)
  }, [countdown, target])

  async function said(kind: 'paid' | 'wrong') {
    setBusy(true)
    setError(null)
    const reply = kind === 'paid' ? await api.parentPaid(token) : await api.parentWrong(token)
    setBusy(false)
    if (!reply.ok) {
      setError(reply.error)
      return
    }
    if (kind === 'paid') {
      setSaidPaid(true)
      return
    }
    setWrongSent(true)
    const contact = reply.contactUrl ?? quotation?.contactUrl
    if (contact) goTo(contact)
  }

  async function pay() {
    setBusy(true)
    setError(null)
    const reply = await api.confirm(token)
    if (reply.ok) {
      goTo(reply.url)
      return
    }
    setBusy(false)
    setError(reply.error)
  }

  if (error && !quotation) {
    return (
      <Shell>
        <div role="alert" className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-700">
          <WarningCircle size={32} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
          {error}
        </div>
      </Shell>
    )
  }
  if (!quotation) {
    return (
      <Shell>
        <p className="text-center text-sm text-slate-500" aria-busy="true">
          载入中…
        </p>
      </Shell>
    )
  }

  const q: PublicQuotation = paidAt && quotation.status !== 'paid' ? { ...quotation, status: 'paid', paidAt } : quotation
  const open = q.status === 'sent' || q.status === 'viewed' || q.status === 'confirmed'

  return (
    <Shell>
      <header className="text-center">
        <h1 className="text-lg font-bold text-slate-900">{q.schoolName}</h1>
        <p className="text-sm text-slate-500">报价单 {q.receiptNo && `· ${q.receiptNo}`}</p>
      </header>

      {q.status === 'paid' && (
        <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <CheckCircle size={36} weight="fill" className="mx-auto mb-1 text-emerald-600" aria-hidden="true" />
          <p className="text-base font-semibold text-emerald-800">已付款 {money(q.total)}</p>
          <p className="mt-1 text-sm text-emerald-800">{q.paidMessage}</p>
          {q.afterPayUrl && (
            <a
              href={q.afterPayUrl}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <ArrowSquareOut size={18} aria-hidden="true" />
              {countdown !== null && countdown > 0 ? `${countdown} 秒后前往，或现在前往` : '前往下一步'}
            </a>
          )}
        </section>
      )}
      {waiting && q.status !== 'paid' && (
        <section role="status" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center text-sm text-sky-800">
          <Clock size={28} className="mx-auto mb-1" aria-hidden="true" />
          付款处理中，请稍候…
        </section>
      )}
      {waitedTooLong && q.status !== 'paid' && (
        <section role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-700">
          我们还在等付款确认。收到后会用 WhatsApp 通知您，不需要再付一次。
        </section>
      )}
      {q.status === 'expired' && (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
          这张报价单已经过期，请联系顾问更新报价。
        </section>
      )}
      {q.status === 'cancelled' && (
        <section role="alert" className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-700">
          这张报价单已经取消。
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <div className="text-xs text-slate-500">学生</div>
          <div className="text-base font-semibold text-slate-900">{q.childName}</div>
          {q.phone && <div className="text-xs text-slate-400">家长电话 {q.phone}</div>}
        </div>
        <div>
          <div className="text-xs text-slate-500">月份</div>
          <div className="text-sm text-slate-800">{q.months}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-500">科目和上课时间</div>
          <ul className="space-y-1.5">
            {q.classes.map((c, i) => (
              <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="font-semibold text-slate-800">{c.subject}</div>
                <div className="text-xs text-slate-500">
                  {c.classroom}
                  {c.when && ` · ${c.when}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <ul className="space-y-1.5 text-sm text-slate-700">
          {q.lines.map((line, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{line.label}</span>
              <span className="shrink-0 tabular-nums">{money(line.amount)}</span>
            </li>
          ))}
          {q.discount && (
            <li className="flex justify-between gap-3 text-emerald-700">
              <span>{q.discount.label}</span>
              <span className="shrink-0 tabular-nums">-{money(q.discount.amount)}</span>
            </li>
          )}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-semibold text-slate-900">总数</span>
          <span className="text-2xl font-bold tabular-nums text-[#be185d]" data-testid="quote-page-total">
            {money(q.total)}
          </span>
        </div>
        {open && <p className="mt-1 text-xs text-slate-500">有效期到 {new Date(q.expiresAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
      </section>

      {open && q.paymentRoute === 'bank_transfer' && q.bank && (
        <section aria-label="银行转账" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bank size={18} aria-hidden="true" /> 银行转账
          </h2>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">银行</dt>
            <dd className="font-semibold text-slate-900">{q.bank.bankName}</dd>
            <dt className="text-slate-500">户口名</dt>
            <dd className="font-semibold text-slate-900">{q.bank.accountName}</dd>
            <dt className="text-slate-500">户口号码</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{q.bank.accountNumber}</dd>
            <dt className="text-slate-500">金额</dt>
            <dd className="font-semibold tabular-nums text-[#be185d]">{money(q.total)}</dd>
            <dt className="text-slate-500">报价单号</dt>
            <dd className="font-semibold text-slate-900">{q.receiptNo}</dd>
          </dl>
          {q.qrUrl && (
            <figure className="flex flex-col items-center gap-1 pt-1">
              <img src={q.qrUrl} alt="银行转账 QR Code" className="h-52 w-52 rounded-xl border border-slate-200 object-contain" />
              <figcaption className="text-xs text-slate-500">扫码转账（可长按存图）</figcaption>
            </figure>
          )}
          {q.bankNote && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{q.bankNote}</p>}
          {q.terms && <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{q.terms}</div>}
          {saidPaid ? (
            <div role="status" className="space-y-2 rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-800">
              <p>谢谢！顾问核对收款后会帮孩子安排上课，并用 WhatsApp 通知您。</p>
              {q.afterPayUrl && (
                <a href={q.afterPayUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">
                  <ArrowSquareOut size={18} aria-hidden="true" /> 前往下一步
                </a>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="min-h-12 w-full rounded-xl bg-[#fc0c97] px-4 py-3 text-base font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
              disabled={busy}
              onClick={() => void said('paid')}
            >
              资料正确，我已转账
            </button>
          )}
        </section>
      )}

      {open && !waiting && q.paymentRoute !== 'bank_transfer' && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          {q.terms && <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{q.terms}</div>}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            我已阅读并同意以上内容和条款
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {!paymentsReady && <p className="text-sm text-amber-700">网上付款还没开通，请联系顾问。</p>}
          <button
            type="button"
            className="min-h-12 w-full rounded-xl bg-[#fc0c97] px-4 py-3 text-base font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
            disabled={!agree || busy || !paymentsReady}
            onClick={() => void pay()}
          >
            {busy ? '正在前往付款…' : `资料正确，前往付款 ${money(q.total)}`}
          </button>
          <p className="text-center text-xs text-slate-400">付款由 Razorpay 处理（网银 FPX、信用卡 / 扣账卡、电子钱包）</p>
        </section>
      )}
      {open && !waiting && (
        wrongSent && !q.contactUrl ? (
          <p role="status" className="text-center text-sm text-slate-600">已通知顾问，他会尽快联系您。</p>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            disabled={busy}
            onClick={() => void said('wrong')}
          >
            <ChatCircleText size={18} aria-hidden="true" /> 资料不对，联系顾问
          </button>
        )
      )}
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        onClick={() => void quotationPdf(q).then(downloadFile).catch(() => setError('无法产生 PDF，请稍后再试。'))}
      >
        <DownloadSimple size={18} aria-hidden="true" /> 下载报价单 PDF
      </button>
      {error && q.paymentRoute === 'bank_transfer' && (
        <p role="alert" className="text-center text-sm text-red-700">
          {error}
        </p>
      )}
    </Shell>
  )
}
