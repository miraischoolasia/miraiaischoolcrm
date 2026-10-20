import { BrandLogo } from '../components/BrandLogo'
import { BrandMascot } from '../components/BrandMascot'
import { BrandSettings, type BrandSettingsApi } from '../components/BrandSettings'
import { applyBranding, emptyBranding, type CrmBranding } from '../lib/branding'

// Dev server only (/?demo=brand): Class Settings > Brand beside a piece of the CRM, without signing in. Saving
// and uploading stay in this page (pictures as blob: addresses), nothing reaches the database.
let stored: CrmBranding = emptyBranding

const demoApi: BrandSettingsApi = {
  load: async () => ({ settings: stored, isAdmin: true }),
  save: async (settings) => {
    stored = { ...settings, name: settings.name.trim() }
    applyBranding(stored)
    return null
  },
  upload: async (file) => URL.createObjectURL(file),
}

export function BrandDemo() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-[220px] shrink-0 bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-1 border-b border-white/10 px-4 py-4">
          <BrandLogo className="h-24 w-auto" textClassName="text-center text-xl font-bold text-white" />
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Teaching System</div>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          <div className="rounded-xl bg-[#fc0c97] px-3 py-2 font-semibold">Students</div>
          <div className="rounded-xl px-3 py-2 text-white/70">Calendar</div>
          <div className="rounded-xl px-3 py-2 text-white/70">Inbox</div>
        </nav>
      </aside>
      <main className="flex-1 space-y-4 p-6">
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]">
            Add student
          </button>
          <span className="rounded-full bg-[#ffe4f2] px-2.5 py-1 text-xs font-semibold text-[#be185d]">Active</span>
          <span className="rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 text-xs font-semibold text-[#be185d]">
            Trial
          </span>
          <span className="text-sm font-semibold text-[#be185d]">3 classes left</span>
          <span className="rounded-xl border border-[#fc0c97]/40 px-3 py-1.5 text-xs text-slate-600">Outlined</span>
        </section>
        <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
          <BrandMascot name="gordo" className="h-20 w-auto" />
          <span className="text-sm text-slate-500">No students match this filter.</span>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Class Settings · Brand</h2>
          <BrandSettings api={demoApi} />
        </section>
      </main>
    </div>
  )
}
