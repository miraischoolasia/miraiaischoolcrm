import { useEffect, useRef, useState, type ReactNode } from 'react'
import { UploadSimple, Warning } from '@phosphor-icons/react'
import { deploymentBrand } from '../lib/brand'
import {
  applyBranding,
  BRAND_PICTURE_TYPES,
  brandContrast,
  brandPictureProblem,
  brandVariables,
  emptyBranding,
  fetchCrmBranding,
  isHexColor,
  saveCrmBranding,
  suggestDarkColor,
  uploadBrandPicture,
  type CrmBranding,
} from '../lib/branding'
import { shadeVariable } from '../lib/brandShades'
import { supabase } from '../lib/supabase'
import mascotEggy from '../assets/mascot-eggy.png'

export type PictureKind = 'logo' | 'favicon' | 'mascot'
const pictureField: Record<PictureKind, 'logo_url' | 'favicon_url' | 'mascot_url'> = {
  logo: 'logo_url',
  favicon: 'favicon_url',
  mascot: 'mascot_url',
}

async function checkIsAdmin() {
  if (!supabase) {
    return false
  }
  const rpc = supabase.rpc as unknown as (name: string) => PromiseLike<{ data: unknown; error: unknown }>
  const { data, error } = await rpc.call(supabase, 'is_admin')
  return !error && data === true
}

// Where the Brand page reads, saves and uploads (the database; /?demo=brand passes made-up ones).
export type BrandSettingsApi = {
  load: () => Promise<{ settings: CrmBranding; isAdmin: boolean }>
  save: (settings: CrmBranding) => Promise<string | null>
  upload: (file: File, kind: PictureKind) => Promise<string>
}

const databaseApi: BrandSettingsApi = {
  load: async () => {
    const [settings, isAdmin] = await Promise.all([fetchCrmBranding(), checkIsAdmin()])
    return { settings, isAdmin }
  },
  save: saveCrmBranding,
  upload: uploadBrandPicture,
}

// Class Settings > Brand: the school's name, logo, tab icon, colours and mascot (admin only). Changes show in
// the preview at once; "Try on the whole CRM" puts them on this page for a look; Save makes them everyone's.
export function BrandSettings({ api = databaseApi }: { api?: BrandSettingsApi }) {
  const [saved, setSaved] = useState<CrmBranding | null>(null)
  const [draft, setDraft] = useState<CrmBranding>(emptyBranding)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [trying, setTrying] = useState(false)
  const [uploading, setUploading] = useState<PictureKind | null>(null)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef<CrmBranding | null>(null)

  useEffect(() => {
    api
      .load()
      .then(({ settings, isAdmin: admin }) => {
        savedRef.current = settings
        setSaved(settings)
        setDraft(settings)
        setIsAdmin(admin)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
    // Leaving the page while trying a look on puts the saved look back.
    return () => {
      if (savedRef.current) {
        applyBranding(savedRef.current)
      }
    }
  }, [api])

  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const colorsOk = (!draft.primary || isHexColor(draft.primary)) && (!draft.primary_dark || isHexColor(draft.primary_dark))
  const variables = colorsOk ? brandVariables(draft) : {}
  const primary = variables[shadeVariable('#fc0c97')] ?? deploymentBrand.primary
  const dark = variables[shadeVariable('#be185d')] ?? deploymentBrand.primaryDark
  const tint = variables[shadeVariable('#ffe4f2')] ?? '#ffe4f2'
  const contrast = brandContrast(primary, dark)
  const logo = draft.logo_url || deploymentBrand.logo
  const name = draft.name.trim() || deploymentBrand.name
  const mascot = !draft.mascot_on
    ? null
    : draft.mascot_url || (deploymentBrand.mascot === 'mirai' ? mascotEggy : deploymentBrand.mascot)

  function change(next: CrmBranding) {
    setDone(false)
    setDraft(next)
    if (trying) {
      applyBranding(next)
    }
  }

  async function pickPicture(kind: PictureKind, file: File | undefined) {
    if (!file) {
      return
    }
    const problem = brandPictureProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setUploading(kind)
    try {
      const url = await api.upload(file, kind)
      change({ ...draft, [pictureField[kind]]: url, ...(kind === 'mascot' ? { mascot_on: true } : {}) })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The picture could not be uploaded.')
    } finally {
      setUploading(null)
    }
  }

  function tryOn(on: boolean) {
    setTrying(on)
    applyBranding(on ? draft : (saved ?? emptyBranding))
  }

  async function save() {
    setSaving(true)
    const failure = await api.save(draft)
    setSaving(false)
    setError(failure)
    if (!failure) {
      const next = { ...draft, name: draft.name.trim() }
      savedRef.current = next
      setSaved(next)
      setDraft(next)
      setTrying(false)
      setDone(true)
    }
  }

  function cancel() {
    if (saved) {
      setDraft(saved)
      if (trying) {
        applyBranding(saved)
      }
    }
    setTrying(false)
    setError(null)
  }

  if (saved === null && !error) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
  }

  if (isAdmin === false) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Only an admin can change the school's logo, name, colours and mascot.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        How the CRM looks for everyone: the sign-in page, the menu, the tab in the browser, public forms and reports. Anything
        left empty keeps today's look.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">School name</span>
            <input
              type="text"
              value={draft.name}
              maxLength={60}
              placeholder={deploymentBrand.name}
              onChange={(event) => change({ ...draft, name: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <PictureField
              label="Logo"
              hint="Wide PNG with a see-through background works best."
              url={draft.logo_url}
              fallback={deploymentBrand.logo}
              busy={uploading === 'logo'}
              onPick={(file) => void pickPicture('logo', file)}
              onReset={() => change({ ...draft, logo_url: '' })}
            />
            <PictureField
              label="Tab icon"
              hint="A small square picture. Empty: the logo."
              url={draft.favicon_url}
              fallback={null}
              busy={uploading === 'favicon'}
              onPick={(file) => void pickPicture('favicon', file)}
              onReset={() => change({ ...draft, favicon_url: '' })}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-900">Colours</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField
                label="Main colour"
                hint="Buttons and highlights"
                value={draft.primary}
                fallback={deploymentBrand.primary}
                onChange={(value) => change({ ...draft, primary: value })}
              />
              <ColorField
                label="Words colour"
                hint="Coloured words on white"
                value={draft.primary_dark}
                fallback={draft.primary && isHexColor(draft.primary) ? suggestDarkColor(draft.primary) : deploymentBrand.primaryDark}
                onChange={(value) => change({ ...draft, primary_dark: value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.primary && isHexColor(draft.primary) && (
                <button
                  type="button"
                  onClick={() => change({ ...draft, primary_dark: suggestDarkColor(draft.primary) })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Work out a words colour for me
                </button>
              )}
              {(draft.primary || draft.primary_dark) && (
                <button
                  type="button"
                  onClick={() => change({ ...draft, primary: '', primary_dark: '' })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to today's colours
                </button>
              )}
            </div>
            {colorsOk && contrast.onButton < 3 && (
              <ContrastWarning>
                White words on the main colour are hard to read ({contrast.onButton.toFixed(1)} : 1). A deeper main colour
                reads better. You can still save.
              </ContrastWarning>
            )}
            {colorsOk && contrast.onWhite < 4.5 && (
              <ContrastWarning>
                The words colour is light on a white page ({contrast.onWhite.toFixed(1)} : 1; 4.5 reads well). You can still
                save.
              </ContrastWarning>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <input
                type="checkbox"
                checked={draft.mascot_on}
                onChange={(event) => change({ ...draft, mascot_on: event.target.checked })}
                className="h-4 w-4 accent-[#fc0c97]"
              />
              Show a mascot
            </label>
            {draft.mascot_on && (
              <PictureField
                label="Mascot picture"
                hint="One picture for every place a mascot shows: empty pages, the thank-you page of forms, error notes."
                url={draft.mascot_url}
                fallback={deploymentBrand.mascot === 'mirai' ? mascotEggy : deploymentBrand.mascot}
                busy={uploading === 'mascot'}
                onPick={(file) => void pickPicture('mascot', file)}
                onReset={() => change({ ...draft, mascot_url: '' })}
              />
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.student_app_follows}
              onChange={(event) => change({ ...draft, student_app_follows: event.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
            />
            <span>
              <span className="font-semibold text-slate-900">The student app uses the same name and colour</span>
              <span className="block text-xs text-slate-500">Untick to keep the name and colour set on the Student app tab.</span>
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-semibold text-slate-900">Preview</span>
          <div aria-label="Brand preview" className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex flex-col items-center gap-1 bg-[#0a0a0a] px-4 py-4 text-white">
              {logo ? <img src={logo} alt={name} className="h-14 w-auto" /> : <span className="text-lg font-bold">{name}</span>}
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Teaching System</span>
            </div>
            <div className="space-y-3 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: dark }}>
                {name}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>
                  Save
                </span>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: tint, color: dark }}>
                  Active
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                {mascot && <img src={mascot} alt="" className="h-12 w-auto" />}
                <span className="text-xs text-slate-500">No students yet.</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={!colorsOk}
            onClick={() => tryOn(!trying)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {trying ? 'Stop trying it on' : 'Try it on the whole CRM'}
          </button>
          {trying && (
            <span className="block text-xs text-slate-500">Only you see this until you save; others keep today's look.</span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved. Everyone sees it when they open the CRM again.</span>}
        {dirty && (
          <button
            type="button"
            onClick={cancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel changes
          </button>
        )}
        <button
          type="button"
          disabled={!dirty || !colorsOk || saving || uploading !== null}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function PictureField({
  label,
  hint,
  url,
  fallback,
  busy,
  onPick,
  onReset,
}: {
  label: string
  hint: string
  url: string
  fallback: string | null
  busy: boolean
  onPick: (file: File | undefined) => void
  onReset: () => void
}) {
  const shown = url || fallback
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          {shown ? <img src={shown} alt={label} className="max-h-12 max-w-[4.5rem]" /> : <span className="text-xs text-slate-400">None</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <UploadSimple size={14} aria-hidden="true" />
            {busy ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              accept={BRAND_PICTURE_TYPES.join(',')}
              aria-label={`Upload ${label.toLowerCase()}`}
              disabled={busy}
              className="sr-only"
              onChange={(event) => {
                onPick(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Use today's
            </button>
          )}
        </div>
      </div>
      <span className="block text-xs text-slate-500">{hint} PNG, JPG or WebP, up to 2 MB.</span>
    </div>
  )
}

function ColorField({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string
  hint: string
  value: string
  fallback: string
  onChange: (value: string) => void
}) {
  const ok = !value || isHexColor(value)
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-semibold text-slate-700">
        {label} <span className="font-normal text-slate-500">· {hint}</span>
      </span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value && ok ? value : fallback}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 shrink-0 rounded border border-slate-200"
        />
        <input
          type="text"
          value={value}
          placeholder={fallback}
          maxLength={7}
          aria-label={`${label} code`}
          onChange={(event) => onChange(event.target.value.trim().toLowerCase())}
          className={`w-full rounded-xl border px-3 py-2 font-mono text-sm ${ok ? 'border-slate-200' : 'border-red-300'}`}
        />
      </span>
    </label>
  )
}

function ContrastWarning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
