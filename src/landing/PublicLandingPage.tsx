import { useEffect, useState } from 'react'
import { brand } from '../lib/brand'
import { LandingRender } from './LandingRender'
import { fetchPublishedLandingPage, loadLandingDraftBySlug, recordLandingView } from './landingApi'
import { migrateLandingData, type LandingData } from './landingData'

// /p/<slug>: a published landing page for parents, without the CRM. With ?preview=1 a signed-in staff member
// sees the draft instead (the editor's "Preview" button).

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'problem' }
  | { kind: 'page'; data: LandingData; title: string; preview: boolean }

const VIEWED_KEY = 'landing-viewed:'

function countVisitOnce(slug: string) {
  try {
    if (window.sessionStorage.getItem(VIEWED_KEY + slug)) {
      return
    }
    window.sessionStorage.setItem(VIEWED_KEY + slug, '1')
  } catch {
    // Without storage every opening counts; the database still limits how often.
  }
  void recordLandingView(slug).catch(() => undefined)
}

export function PublicLandingPage({ slug, preview }: { slug: string; preview: boolean }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        if (preview) {
          const draft = await loadLandingDraftBySlug(slug)
          if (alive) {
            setState(
              draft
                ? { kind: 'page', data: migrateLandingData(draft.draft_data, draft.data_version), title: draft.title, preview: true }
                : { kind: 'missing' },
            )
          }
          return
        }
        const page = await fetchPublishedLandingPage(slug)
        if (!alive) {
          return
        }
        if (!page) {
          setState({ kind: 'missing' })
          return
        }
        setState({ kind: 'page', data: migrateLandingData(page.data, page.data_version), title: page.seo_title || page.title, preview: false })
        countVisitOnce(slug)
      } catch {
        if (alive) {
          setState({ kind: 'problem' })
        }
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [slug, preview])

  useEffect(() => {
    if (state.kind === 'page') {
      document.title = state.title ? `${state.title} · ${brand.name}` : brand.name
    }
  }, [state])

  if (state.kind === 'loading') {
    return <div className="grid min-h-screen place-items-center bg-white text-sm text-slate-500">载入中…</div>
  }

  if (state.kind !== 'page') {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-6 text-center">
        <div className="max-w-sm space-y-3">
          {brand.logo ? <img src={brand.logo} alt={brand.name} className="mx-auto h-14 w-auto" /> : null}
          <h1 className="text-xl font-semibold text-slate-900">
            {state.kind === 'missing' ? '这个页面不存在，或已经下架' : '页面暂时打不开'}
          </h1>
          <p className="text-sm text-slate-500">
            {state.kind === 'missing'
              ? preview
                ? '预览要先登入 CRM，而且要有 Landing Page 的权限。'
                : '请跟学校确认连结是否正确。'
              : '请检查网路后重新整理。'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <>
      {state.preview && (
        <div role="status" className="sticky top-0 z-30 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950">
          草稿预览：家长看不到，按「发布」后才会更新公开页。
        </div>
      )}
      <main>
        <LandingRender data={state.data} />
      </main>
    </>
  )
}
