import { useEffect, useState } from 'react'
import {
  defaultPortalSettings,
  fetchPortalSettings,
  savePortalSettings,
  studentHomeThemes,
  type PortalSettings,
  type PortalVisibility,
} from '../lib/portal'
import { DEFAULT_LOGIN_MESSAGE, fillLoginMessage } from '../lib/portalLogins'
import { AppChatSetting } from './appChat/AppChatSetting'
import { PortalConsentSettings } from './PortalConsentSettings'
import { StudentDailySettings } from './StudentDailySettings'
import { PortalTermsSettings } from './PortalTermsSettings'

const sections: Array<[keyof PortalVisibility, string]> = [
  ['schedule', 'Classes and their Zoom link'],
  ['points', 'Points and level'],
  ['scores', "The teacher's ratings (never the remarks)"],
  ['package', 'Lessons left and expiry'],
  ['report', "The teacher's report (only when a teacher shares it)"],
  ['recordings', 'Class recordings (from Zoom)'],
]

// Class Settings > Student app: the school's name and colour in the app, and
// what a child's login and a parent's login may see.
export function StudentAppSettings() {
  const [saved, setSaved] = useState<PortalSettings | null>(null)
  const [draft, setDraft] = useState<PortalSettings>(defaultPortalSettings)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchPortalSettings()
      .then((settings) => {
        setSaved(settings)
        setDraft(settings)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
  }, [])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(draft.accent_color)
  const linkOk = draft.app_url.trim() === '' || /^https?:\/\/\S+$/.test(draft.app_url.trim())
  const homeOk =
    (draft.home_style === 'classic' || studentHomeThemes.some((theme) => theme.key === draft.home_theme)) &&
    Number.isInteger(draft.level_points) &&
    draft.level_points >= 10 &&
    draft.level_points <= 1000
  const whatsappDigits = draft.support_whatsapp.replace(/\D/g, '')
  const whatsappOk = whatsappDigits === '' || /^[0-9]{8,15}$/.test(whatsappDigits)
  const preview = fillLoginMessage(draft.login_message, {
    school: draft.school_name,
    childNames: ['Ethan Lim'],
    link: draft.app_url,
    logins: [
      { kind: 'parent', name: 'Parent', username: 'ethan.lim.parent', password: 'sunny-panda-47' },
      { kind: 'student', name: 'Ethan Lim', username: 'ethan.lim', password: 'brave-otter-12' },
    ],
  })

  function change(next: PortalSettings) {
    setDone(false)
    setDraft(next)
  }

  async function save() {
    const failure = await savePortalSettings({ ...draft, school_name: draft.school_name.trim() })
    setError(failure)
    if (!failure) {
      setSaved(draft)
      setDone(true)
    }
  }

  if (saved === null && !error) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Children and parents sign in to the student app with the logins made on each student's page or on Students &gt; App
        Logins. Remarks teachers write are never shown in the app.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">School name in the app</span>
          <input
            type="text"
            value={draft.school_name}
            maxLength={60}
            placeholder="e.g. Mirai AI School"
            onChange={(event) => change({ ...draft, school_name: event.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Colour</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={colorOk ? draft.accent_color : '#fc0c97'}
              aria-label="Colour"
              onChange={(event) => change({ ...draft, accent_color: event.target.value })}
              className="h-9 w-12 rounded border border-slate-200"
            />
            <span className="font-mono text-xs text-slate-500">{draft.accent_color}</span>
          </span>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-slate-900">The app's web address</span>
        <input
          type="url"
          value={draft.app_url}
          maxLength={200}
          placeholder="e.g. https://mirai-student-app.vercel.app"
          onChange={(event) => change({ ...draft, app_url: event.target.value })}
          className={`w-full rounded-xl border px-3 py-2 text-sm ${linkOk ? 'border-slate-200' : 'border-red-300'}`}
        />
        <span className="block text-xs text-slate-500">Sent to families with their login, so they know where to sign in.</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Home page on a computer</span>
          <select
            value={draft.home_style}
            onChange={(event) =>
              change({
                ...draft,
                home_style: event.target.value === 'lobby' ? 'lobby' : 'classic',
                home_theme: event.target.value === 'lobby' ? draft.home_theme || studentHomeThemes[0].key : draft.home_theme,
              })
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="classic">Classic list</option>
            <option value="lobby">Game lobby</option>
          </select>
        </label>
        {draft.home_style === 'lobby' && (
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">Lobby pictures</span>
            <select
              value={draft.home_theme}
              onChange={(event) => change({ ...draft, home_theme: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {studentHomeThemes.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Points for one level</span>
          <input
            type="number"
            min={10}
            max={1000}
            value={draft.level_points}
            onChange={(event) => change({ ...draft, level_points: Number(event.target.value) })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5 sm:col-span-3">
          <span className="text-sm font-semibold text-slate-900">School WhatsApp for families</span>
          <input
            type="tel"
            value={draft.support_whatsapp}
            maxLength={20}
            placeholder="e.g. 60123456789"
            onChange={(event) => change({ ...draft, support_whatsapp: event.target.value })}
            className={`w-full rounded-xl border px-3 py-2 text-sm ${whatsappOk ? 'border-slate-200' : 'border-red-300'}`}
          />
          <span className="block text-xs text-slate-500">
            Country code first, no + or spaces. The game lobby's sign-in page shows "Forgot password?" and "Contact the school" with
            it; leave empty to hide them.
          </span>
        </label>
        <span className="block text-xs text-slate-500 sm:col-span-3">
          The game lobby shows on a computer only; phones keep the classic list. The level (Lv) counts all the points a child has
          earned.
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Message sent with a new login</span>
          <textarea
            value={draft.login_message || DEFAULT_LOGIN_MESSAGE}
            maxLength={1500}
            rows={9}
            onChange={(event) => change({ ...draft, login_message: event.target.value === DEFAULT_LOGIN_MESSAGE ? '' : event.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <span className="block text-xs text-slate-500">
            {'{school}'} school name · {'{child}'} child's name · {'{link}'} the web address · {'{logins}'} the login names and passwords
          </span>
        </label>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">How it looks</span>
          <pre className="whitespace-pre-wrap rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 font-sans text-sm text-slate-800">{preview}</pre>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2 font-semibold">Shows</th>
              <th className="py-2 text-center font-semibold">Child login</th>
              <th className="py-2 text-center font-semibold">Parent login</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([key, label]) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="py-2 text-slate-700">{label}</td>
                {(['student_sees', 'parent_sees'] as const).map((viewer) => (
                  <td key={viewer} className="py-2 text-center">
                    <input
                      type="checkbox"
                      checked={draft[viewer][key]}
                      aria-label={`${viewer === 'student_sees' ? 'Child' : 'Parent'} sees ${label}`}
                      onChange={(event) => change({ ...draft, [viewer]: { ...draft[viewer], [key]: event.target.checked } })}
                      className="h-4 w-4 accent-[#fc0c97]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!dirty || !colorOk || !linkOk || !homeOk || !whatsappOk}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <PortalTermsSettings />

      <PortalConsentSettings />

      <StudentDailySettings />

      <AppChatSetting />
    </div>
  )
}
