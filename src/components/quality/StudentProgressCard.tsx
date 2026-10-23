import { useEffect, useMemo, useState } from 'react'
import { Copy, WhatsappLogo } from '@phosphor-icons/react'
import { brand } from '../../lib/brand'
import { useBrandVersion } from '../../lib/branding'
import { cn } from '../../lib/cn'
import { fetchQualitySettings, qualityErrorMessage, DEFAULT_QUALITY_SETTINGS } from '../../lib/classQuality'
import { cardText, fetchCard, markCardSent, monthName, summarizeCard, type CardData } from '../../lib/progressCards'
import { useOpenChat } from '../WhatsAppLink'

// The top of the Progress tab of a student's details: the month on one card and the text for the family. "Send to parent"
// opens the family's chat with the text in the message box; the person reads it and presses send themself.

type StudentProgressCardProps = {
  studentId: number
  // Fixed "today" for tests.
  today?: string
}

// One point per quiz, its score written over it ("4/5"); higher is more of the questions right.
function TrendLine({ points }: { points: { date: string; correct: number; total: number }[] }) {
  if (points.length === 0) {
    return <p className="text-xs text-slate-500">No quiz this month.</p>
  }
  const width = 520
  const left = 24
  const step = points.length > 1 ? (width - left * 2) / (points.length - 1) : 0
  const x = (index: number) => (points.length > 1 ? left + index * step : width / 2)
  const y = (point: { correct: number; total: number }) => 30 + (1 - point.correct / point.total) * 80
  return (
    <svg
      viewBox={`0 0 ${width} 140`}
      className="h-auto w-full"
      role="img"
      aria-label={`Quiz scores: ${points.map((point) => `${point.correct}/${point.total}`).join(', ')}`}
    >
      <line x1={left} x2={width - left} y1={30} y2={30} stroke="#e2e8f0" />
      <line x1={left} x2={width - left} y1={110} y2={110} stroke="#e2e8f0" />
      {points.length > 1 && (
        <polyline fill="none" stroke={brand.primary} strokeWidth="3" points={points.map((point, index) => `${x(index)},${y(point)}`).join(' ')} />
      )}
      {points.map((point, index) => (
        <g key={`${point.date}-${index}`}>
          <circle cx={x(index)} cy={y(point)} r="5" fill={brand.primary} />
          <text x={x(index)} y={y(point) - 10} fontSize="12" fontWeight="700" fill={brand.primaryDark} textAnchor="middle">
            {point.correct}/{point.total}
          </text>
          <text x={x(index)} y={132} fontSize="10" fill="#64748b" textAnchor="middle">
            {point.date.slice(8)}/{point.date.slice(5, 7)}
          </text>
        </g>
      ))}
    </svg>
  )
}

const shortDate = (at: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(at))

export function StudentProgressCard({ studentId, today }: StudentProgressCardProps) {
  const todayDate = today ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  // Redraw when the school's Brand settings (name, colours) arrive.
  useBrandVersion()
  const openChat = useOpenChat()
  const [month, setMonth] = useState(`${todayDate.slice(0, 7)}-01`)
  const [card, setCard] = useState<CardData | null>(null)
  const [template, setTemplate] = useState(DEFAULT_QUALITY_SETTINGS.card_text)
  const [language, setLanguage] = useState(DEFAULT_QUALITY_SETTINGS.parent_language)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    fetchQualitySettings()
      .then((settings) => {
        if (!live) return
        setTemplate(settings.card_text)
        setLanguage(settings.parent_language)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    setNotice(null)
    fetchCard(studentId, month)
      .then((data) => {
        if (live) setCard(data)
      })
      .catch((problem) => {
        if (!live) return
        setCard(null)
        const code = (problem as { code?: string } | null)?.code
        setError(
          code === '42501'
            ? "Only this student's Learning Consultant (or someone who may see everyone's cards) can see this card."
            : qualityErrorMessage(problem, "Could not load this student's card."),
        )
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [studentId, month])

  const summary = useMemo(() => (card ? summarizeCard(card) : null), [card])

  useEffect(() => {
    if (card && summary) setText(cardText(template, card, summary, brand.name, language))
  }, [card, summary, template, language])

  const canOpen = Boolean(openChat && card && (card.student.sendTo.phone || card.student.sendTo.contactId !== null))

  async function send() {
    if (!card) return
    const to = card.student.sendTo
    if (openChat && canOpen) {
      openChat({
        phone: to.phone ?? '',
        name: to.name,
        leadId: null,
        chat: to.contactId !== null ? { conversationId: null, contactId: to.contactId } : undefined,
        message: text,
      })
    }
    const problem = await markCardSent(card.student.id, month)
    if (problem) {
      setNotice(problem)
      return
    }
    setCard((current) => (current ? { ...current, sentAt: new Date().toISOString() } : current))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Copied.')
    } catch {
      setNotice('Could not copy; select the text and copy it.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Month
          <input
            type="month"
            aria-label="Month"
            value={month.slice(0, 7)}
            max={todayDate.slice(0, 7)}
            onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        {card && (
          <span className={cn('text-xs', card.sentAt ? 'font-semibold text-emerald-700' : 'text-slate-500')}>
            {card.sentAt ? `Sent to the family ${shortDate(card.sentAt)}` : 'Not sent this month'}
          </span>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && !card && <p className="text-sm text-slate-500">Loading…</p>}

      {card && summary && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="px-5 py-4 text-white" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})` }}>
              <div className="text-xs uppercase tracking-wide opacity-90">{brand.name} · Monthly progress</div>
              <div className="mt-1 text-2xl font-bold">{card.student.name}</div>
              <div className="text-sm opacity-90">
                {monthName(card.month)}
                {summary.classes.length > 0 ? ` · ${summary.classes.join(', ')}` : ''}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <b className="block text-xl">{summary.lessons > 0 ? `${summary.attended} / ${summary.lessons}` : '–'}</b>
                <span className="text-xs text-slate-500">classes attended</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <b className="block text-xl">{summary.questions > 0 ? `${summary.correct} / ${summary.questions}` : '–'}</b>
                <span className="text-xs text-slate-500">quiz answers right</span>
                {summary.improved !== null && (
                  <span className={cn('block text-xs font-semibold', summary.improved ? 'text-emerald-700' : 'text-slate-500')}>
                    {summary.improved ? '▲ better than last month' : '▼ fewer than last month'}
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <b className="block text-xl">{summary.participation !== null ? `${summary.participation}%` : '–'}</b>
                <span className="text-xs text-slate-500">time in class</span>
              </div>
            </div>
            <div className="px-4">
              <h3 className="text-xs font-semibold text-slate-500">Each quiz</h3>
              <TrendLine points={summary.trend} />
            </div>
            {card.words.length > 0 && (
              <div className="space-y-2 p-4">
                <h3 className="text-xs font-semibold text-slate-500">From the teacher</h3>
                {card.words.slice(0, 2).map((words) => (
                  <div
                    key={`${words.date}-${words.text}`}
                    className="rounded-xl px-3 py-2 text-sm"
                    style={{ background: `color-mix(in srgb, ${brand.primary} 10%, white)` }}
                  >
                    {words.text}
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {words.teacher ?? 'Teacher'} · {words.date}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-900">
              Message
              <textarea
                aria-label="Message to the parent"
                rows={10}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mt-1 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-normal"
              />
            </label>
            <button
              type="button"
              disabled={text.trim() === '' || !canOpen}
              onClick={() => void send()}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: brand.primary }}
            >
              <WhatsappLogo size={16} weight="fill" aria-hidden="true" />
              Send to parent
            </button>
            <p className="text-xs text-slate-500">
              {canOpen
                ? 'Opens the family’s chat in the Inbox with this text in the message box. Read it, change it if you like, and press send yourself.'
                : 'This family has no phone number or chat here; copy the text instead.'}
            </p>
            <button
              type="button"
              disabled={text.trim() === ''}
              onClick={() => void copy()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              <Copy size={14} aria-hidden="true" />
              Copy text
            </button>
            {notice && <p className="text-sm text-slate-600">{notice}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
