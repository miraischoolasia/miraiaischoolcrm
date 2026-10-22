import { useEffect, useState } from 'react'
import {
  contentErrorMessage,
  fetchUsage,
  fetchUsageToday,
  saveStudioSettings,
  splitLines,
  type ContentProvider,
  type StudioSettings,
  type UsageRow,
  type UsageToday,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { Chip, Field, Notice, PrimaryButton, inputClass, type NoticeValue } from './ui'
import { formatTime } from './format'

type SettingsPanelProps = {
  canEdit: boolean
  isAdmin: boolean
  settings: StudioSettings
  teacherNames: Map<number, string>
  onSaved: () => Promise<void>
}

const ACTION_LABELS: Record<string, string> = {
  plan: 'Post ideas',
  more: 'More ideas',
  analyze: 'Read material',
  read_pdf: 'Read a PDF',
  image: 'Picture',
}

// The school's voice, banned words and must-have lines (with the logo, colours and mascot from Class
// Settings > Brand); an admin also sets the claim limit, the daily AI limit and the AI provider.
export function SettingsPanel({ canEdit, isAdmin, settings, teacherNames, onSaved }: SettingsPanelProps) {
  const [voice, setVoice] = useState(settings.voice)
  const [banned, setBanned] = useState(settings.bannedWords.join('\n'))
  const [mustInclude, setMustInclude] = useState(settings.mustInclude.join('\n'))
  const [claimLimit, setClaimLimit] = useState(settings.claimLimit)
  const [dailyLimit, setDailyLimit] = useState(settings.dailyLimit)
  const [dailyImageLimit, setDailyImageLimit] = useState(settings.dailyImageLimit)
  const [textProvider, setTextProvider] = useState<ContentProvider>(settings.textProvider)
  const [imageProvider, setImageProvider] = useState<ContentProvider>(settings.imageProvider)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const [usage, setUsage] = useState<UsageRow[] | null>(null)
  const [today, setToday] = useState<UsageToday | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchUsage(50), fetchUsageToday()])
      .then(([rows, total]) => {
        if (cancelled) return
        setUsage(rows)
        setToday(total)
      })
      .catch(() => {
        if (!cancelled) setUsage([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setBusy(true)
    setNotice(null)
    try {
      await saveStudioSettings({
        voice: voice.trim(),
        bannedWords: splitLines(banned, true),
        mustInclude: splitLines(mustInclude),
        ...(isAdmin ? { claimLimit, dailyLimit, dailyImageLimit, textProvider, imageProvider } : {}),
      })
      await onSaved()
      setNotice({ text: 'Settings saved. The AI uses them from the next plan.', isError: false })
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, 'The settings could not be saved.'), isError: true })
    }
    setBusy(false)
  }

  const disabled = !canEdit || busy
  return (
    <section className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">How the AI writes for the school</h2>
          <p className="text-sm text-slate-500">The logo, colours and mascot come from Class Settings › Brand.</p>
        </div>
        <Field label="How we talk" hint="The AI writes every caption in this voice, in Malaysian Chinese.">
          <textarea className={inputClass} rows={3} value={voice} maxLength={2000} disabled={disabled} onChange={(e) => setVoice(e.target.value)} />
        </Field>
        <Field label="Words never to use" hint="One per line (or separated by commas). A post that still has one gets a yellow warning.">
          <textarea className={inputClass} rows={3} value={banned} disabled={disabled} onChange={(e) => setBanned(e.target.value)} />
        </Field>
        <Field label="Every caption must have" hint="One per line, e.g. “WhatsApp: 012-345 6789”. Added at the end when the AI leaves one out.">
          <textarea className={inputClass} rows={3} value={mustInclude} disabled={disabled} onChange={(e) => setMustInclude(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Limits and AI</h2>
          {!isAdmin && <p className="text-sm text-slate-500">Only an admin can change these.</p>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="How many staff may use the same post">
            <input type="number" min={1} max={100} className={inputClass} value={claimLimit} disabled={disabled || !isAdmin} onChange={(e) => setClaimLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Post ideas the AI may write per day (whole school)" hint="Stops a wrong click from running up the bill. Resets at midnight, Malaysia time.">
            <input type="number" min={1} max={2000} className={inputClass} value={dailyLimit} disabled={disabled || !isAdmin} onChange={(e) => setDailyLimit(Math.min(2000, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Pictures the AI may draw per day (whole school)" hint="Each page of a carousel is one picture. Resets at midnight, Malaysia time.">
            <input type="number" min={1} max={1000} className={inputClass} value={dailyImageLimit} disabled={disabled || !isAdmin} onChange={(e) => setDailyImageLimit(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <div className="hidden md:block" />
          <Field label="AI that writes the words">
            <select className={inputClass} value={textProvider} disabled={disabled || !isAdmin} onChange={(e) => setTextProvider(e.target.value as ContentProvider)}>
              <option value="gemini">Gemini (Google)</option>
              <option value="openai">ChatGPT (OpenAI) – not connected yet</option>
            </select>
          </Field>
          <Field label="AI that draws the pictures">
            <select className={inputClass} value={imageProvider} disabled={disabled || !isAdmin} onChange={(e) => setImageProvider(e.target.value as ContentProvider)}>
              <option value="gemini">Gemini (Google)</option>
              <option value="openai">ChatGPT (OpenAI) – not connected yet</option>
            </select>
          </Field>
        </div>
      </div>

      <Notice notice={notice} />
      {canEdit && (
        <PrimaryButton disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </PrimaryButton>
      )}

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">AI use (last 50)</h2>
          {today && (
            <p className="text-sm text-slate-600">
              Today: <span className="font-semibold">{today.used}</span> of {today.limit} post ideas · <span className="font-semibold">{today.imagesUsed}</span> of {today.imagesLimit} pictures
            </p>
          )}
        </div>
        {usage === null && <p className="text-sm text-slate-500">Loading…</p>}
        {usage !== null && usage.length === 0 && <p className="text-sm text-slate-500">The AI has not been used yet.</p>}
        {usage !== null && usage.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Who</th>
                  <th className="px-3 py-2">What</th>
                  <th className="px-3 py-2">Ideas</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2">{formatTime(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.teacherId ? (teacherNames.get(row.teacherId) ?? `#${row.teacherId}`) : '—'}</td>
                    <td className="px-3 py-2">{ACTION_LABELS[row.action] ?? row.action}</td>
                    <td className="px-3 py-2">{row.units}</td>
                    <td className={cn('px-3 py-2', !row.ok && 'text-red-700')}>
                      {row.ok ? <Chip tone="good">OK</Chip> : <span title={row.error ?? ''}>Failed{row.error ? `: ${row.error.slice(0, 80)}` : ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
