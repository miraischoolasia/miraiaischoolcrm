import { useState } from 'react'
import { cn } from '../../lib/cn'
import {
  PARENT_TEXTS,
  RED_KEYS,
  saveQualitySettings,
  settingsChange,
  type AlertKind,
  type ParentLanguage,
  type QualityNumberKey,
  type QualitySettings,
  type RedKey,
} from '../../lib/classQuality'

type QualitySettingsFormProps = {
  settings: QualitySettings
  canEdit: boolean
  onSaved: (settings: QualitySettings) => void
}

const fieldClass =
  'w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50'

type Part = string | { key: QualityNumberKey; label: string; min: number; max: number }

// Each alert: its switch and the sentence with its numbers in it.
const ALERTS: { group: string; to: string; items: { kind: AlertKind; parts: Part[] }[] }[] = [
  {
    group: 'Class alerts',
    to: 'to the managers (everyone with the Teacher quality tick)',
    items: [
      {
        kind: 'low_score',
        parts: [
          'Answers right below',
          { key: 'low_score_percent', label: 'Percent', min: 1, max: 100 },
          '% in',
          { key: 'low_score_lessons', label: 'Lessons', min: 1, max: 10 },
          'lessons running',
        ],
      },
      {
        kind: 'attendance_drop',
        parts: ['Attendance lower in', { key: 'attendance_drop_lessons', label: 'Lessons', min: 2, max: 10 }, 'lessons running'],
      },
      {
        kind: 'late_start',
        parts: ['The teacher starts more than', { key: 'late_start_minutes', label: 'Minutes', min: 1, max: 120 }, 'minutes late'],
      },
    ],
  },
  {
    group: 'Student care',
    to: "to the student's Learning Consultant (else the PIC)",
    items: [
      { kind: 'absent_streak', parts: ['Missed', { key: 'absent_lessons', label: 'Classes', min: 1, max: 20 }, 'classes in a row'] },
      {
        kind: 'low_participation',
        parts: ['In class less than', { key: 'participation_percent', label: 'Percent', min: 1, max: 100 }, '% of the time'],
      },
      {
        kind: 'leaves_early',
        parts: [
          'Left',
          { key: 'early_minutes', label: 'Minutes early', min: 1, max: 120 },
          'minutes or more early in',
          { key: 'early_lessons', label: 'Times', min: 1, max: 10 },
          'of the last',
          { key: 'early_window', label: 'Lessons looked at', min: 1, max: 20 },
          'classes',
        ],
      },
    ],
  },
  {
    group: 'Good news',
    to: "to the student's Learning Consultant, with a message for the parent",
    items: [
      { kind: 'first_place', parts: ['Came first in a lesson (most answer points)'] },
      { kind: 'all_correct', parts: ['Every answer right, with at least', { key: 'all_correct_min', label: 'Questions', min: 1, max: 50 }, 'questions'] },
      { kind: 'high_rating', parts: ["The teacher's rating at least", { key: 'high_rating_percent', label: 'Percent', min: 1, max: 100 }, '% of full marks'] },
    ],
  },
]

const RED_LABELS: Record<RedKey, string> = {
  attendance: 'Attendance',
  participation: 'Time in class',
  right: 'Answers right',
  on_time: 'Started on time',
  recording: 'Recording on time',
  feedback: 'Attendance sent on time',
}

export function QualitySettingsForm({ settings, canEdit, onSaved }: QualitySettingsFormProps) {
  const [draft, setDraft] = useState(settings)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const change = settingsChange(settings, draft)
  const dirty = Object.keys(change).length > 0

  const setNumber = (key: QualityNumberKey, value: string) => setDraft((current) => ({ ...current, [key]: Math.round(Number(value) || 0) }))

  // Another language for parents: a text still at the old language's default changes with it; a school's own text stays.
  function setLanguage(language: ParentLanguage) {
    setDraft((current) => {
      const old = PARENT_TEXTS[current.parent_language]
      const next = PARENT_TEXTS[language]
      return {
        ...current,
        parent_language: language,
        card_text: current.card_text === old.card ? next.card : current.card_text,
        good_news_draft: current.good_news_draft === old.goodNews ? next.goodNews : current.good_news_draft,
      }
    })
  }

  async function save() {
    setSaving(true)
    setNotice(null)
    const result = await saveQualitySettings(change)
    setSaving(false)
    if (typeof result === 'string') {
      setNotice({ text: result, error: true })
      return
    }
    setDraft(result)
    onSaved(result)
    setNotice({ text: 'Saved. The next check (every 10 minutes) uses the new settings.', error: false })
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={!canEdit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Messages to parents</legend>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Written in</span>
          <select
            aria-label="Language of messages to parents"
            value={draft.parent_language}
            onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'zh')}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
          >
            <option value="zh">Chinese (华文)</option>
            <option value="en">English</option>
          </select>
          <span className="text-xs text-slate-500">The progress card and the good news message. The screens stay in English.</span>
        </label>
      </fieldset>
      {ALERTS.map((group) => (
        <fieldset key={group.group} disabled={!canEdit} className="rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">
            {group.group} <span className="font-normal text-slate-500">— {group.to}</span>
          </legend>
          <div className="space-y-2">
            {group.items.map((item) => (
              <div key={item.kind} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  aria-label={`Alert: ${item.parts.filter((part): part is string => typeof part === 'string').join(' … ')}`}
                  checked={draft.alerts[item.kind]}
                  onChange={(event) => setDraft((current) => ({ ...current, alerts: { ...current.alerts, [item.kind]: event.target.checked } }))}
                  className="h-4 w-4 accent-[#fc0c97]"
                />
                {item.parts.map((part, index) =>
                  typeof part === 'string' ? (
                    <span key={index} className={cn(!draft.alerts[item.kind] && 'text-slate-400')}>
                      {part}
                    </span>
                  ) : (
                    <input
                      key={part.key}
                      type="number"
                      aria-label={part.label}
                      min={part.min}
                      max={part.max}
                      value={draft[part.key]}
                      onChange={(event) => setNumber(part.key, event.target.value)}
                      className={fieldClass}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
          {group.group === 'Good news' && (
            <label className="mt-3 block text-sm text-slate-700">
              <span className="font-semibold">Suggested message to the parent</span>
              <textarea
                aria-label="Suggested message to the parent"
                rows={2}
                maxLength={500}
                value={draft.good_news_draft}
                onChange={(event) => setDraft((current) => ({ ...current, good_news_draft: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <span className="text-xs text-slate-500">
                {'{parent}'}, {'{child}'} and {'{news}'} (what happened, e.g. "在 F1 Math（10月23日）拿到第一名") are filled in, in
                the language above. The Learning Consultant copies it into the chat and sends it themself.
              </span>
            </label>
          )}
        </fieldset>
      ))}

      <fieldset disabled={!canEdit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Scorecard</legend>
        <p className="text-xs text-slate-500">A number below its line is shown in red.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {RED_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="flex-1">{RED_LABELS[key]}</span>
              <input
                type="number"
                aria-label={`Red line: ${RED_LABELS[key]}`}
                min={0}
                max={100}
                value={draft.red[key]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, red: { ...current.red, [key]: Math.round(Number(event.target.value) || 0) } }))
                }
                className={fieldClass}
              />
              <span>%</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Attendance counts as on time when sent within</span>
          <input
            type="number"
            aria-label="Hours for the attendance"
            min={1}
            max={336}
            value={draft.feedback_hours}
            onChange={(event) => setNumber('feedback_hours', event.target.value)}
            className={fieldClass}
          />
          <span>hours of the end of the lesson; a recording within</span>
          <input
            type="number"
            aria-label="Hours for the recording"
            min={1}
            max={336}
            value={draft.recording_hours}
            onChange={(event) => setNumber('recording_hours', event.target.value)}
            className={fieldClass}
          />
          <span>hours.</span>
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Progress card text</legend>
        <textarea
          aria-label="Progress card text"
          rows={8}
          maxLength={1500}
          value={draft.card_text}
          onChange={(event) => setDraft((current) => ({ ...current, card_text: event.target.value }))}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
        />
        <p className="text-xs text-slate-500">
          Filled in for each student: {'{child} {month} {classes} {attended} {lessons} {score} {right_change} {points} {time} {teacher} {remark} {school}'}.
          {'{score}'} is the quiz answers right of all questions, like 8/10. A line with nothing to fill (for example no
          quiz this month, or no remark from the teacher) is left out.
        </p>
      </fieldset>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {notice && <span className={cn('text-sm', notice.error ? 'text-red-700' : 'text-emerald-700')}>{notice.text}</span>}
        </div>
      )}
      {!canEdit && <p className="text-sm text-slate-500">Only someone who may edit Teacher quality can change these.</p>}
    </div>
  )
}
