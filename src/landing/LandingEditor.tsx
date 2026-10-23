import { useEffect, useMemo, useRef, useState } from 'react'
import { migrate, Puck, useGetPuck, type Data, type Viewports } from '@puckeditor/core'
import '@puckeditor/core/no-external.css'
import { ArrowSquareOut, GlobeHemisphereEast, X } from '@phosphor-icons/react'
import { landingConfig } from './config'
import { saveLandingDraft, publishLandingPage, type LandingPageFull } from './landingApi'
import { migrateLandingData, landingPageUrl, type LandingData } from './landingData'
import { landingDictionary } from './dictionary'

// The landing page editor (Puck), full screen over the CRM. This file, the editor package and its styles are only
// downloaded when a page is opened for editing.

const VIEWPORTS: Viewports = [
  { width: 375, label: '手机', icon: 'Smartphone' },
  { width: 768, label: '平板', icon: 'Tablet' },
  { width: 1280, label: '电脑', icon: 'Monitor' },
]

type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed'

const saveStateText: Record<SaveState, string> = {
  saved: '草稿已储存',
  saving: '储存中…',
  unsaved: '还没储存',
  failed: '储存失败，会再试',
}

export function LandingEditor({
  page,
  onClose,
  onPublished,
}: {
  page: LandingPageFull
  onClose: () => void
  onPublished: () => void
}) {
  const initial = useMemo(
    () => migrate(migrateLandingData(page.draft_data, page.data_version) as unknown as Data, landingConfig) as unknown as Data,
    [page.draft_data, page.data_version],
  )
  const latest = useRef<LandingData>(initial as unknown as LandingData)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [publishing, setPublishing] = useState(false)

  async function saveNow() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) {
      return true
    }
    dirty.current = false
    setSaveState('saving')
    try {
      await saveLandingDraft(page.id, latest.current)
      setSaveState(dirty.current ? 'unsaved' : 'saved')
      return true
    } catch {
      dirty.current = true
      setSaveState('failed')
      timer.current = window.setTimeout(() => void saveNow(), 10000)
      return false
    }
  }

  // Each change is saved two seconds after the person stops (and again every ten seconds while it fails).
  function changed(data: Data) {
    latest.current = data as unknown as LandingData
    dirty.current = true
    setSaveState('unsaved')
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
    }
    timer.current = window.setTimeout(() => void saveNow(), 2000)
  }

  async function publish(data: Data) {
    latest.current = data as unknown as LandingData
    dirty.current = true
    setPublishing(true)
    setNotice(null)
    try {
      if (!(await saveNow())) {
        throw new Error('草稿没有储存成功。')
      }
      await publishLandingPage(page.id)
      setNotice({ kind: 'ok', text: `已发布：${landingPageUrl(page.slug)}` })
      onPublished()
    } catch (error) {
      setNotice({ kind: 'error', text: `发布失败：${error instanceof Error ? error.message : '请再试一次。'}` })
    } finally {
      setPublishing(false)
    }
  }

  async function preview() {
    await saveNow()
    window.open(`${landingPageUrl(page.slug)}?preview=1`, '_blank', 'noopener')
  }

  async function close() {
    await saveNow()
    onClose()
  }

  // Leaving the browser tab with changes not saved yet asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    }
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label={`编辑 ${page.title}`} className="fixed inset-0 z-50 flex flex-col bg-white">
      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            notice.kind === 'error'
              ? 'flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm font-medium text-red-700'
              : 'flex items-center justify-between gap-3 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800'
          }
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示" className="rounded p-1 hover:bg-black/5">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Puck
          config={landingConfig}
          data={initial}
          onChange={changed}
          onPublish={(data) => void publish(data)}
          headerTitle={page.title}
          headerPath={`/p/${page.slug}`}
          viewports={VIEWPORTS}
          dictionary={landingDictionary}
          height="100%"
          overrides={{
            // Puck's own Publish is a <span> a keyboard cannot reach, so ours replaces it.
            headerActions: () => (
              <>
                <span aria-live="polite" className="text-xs font-medium whitespace-nowrap text-slate-500">
                  {publishing ? '发布中…' : saveStateText[saveState]}
                </span>
                <button
                  type="button"
                  onClick={() => void preview()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ArrowSquareOut size={16} aria-hidden="true" />
                  预览
                </button>
                <PublishButton busy={publishing} onPublish={(data) => void publish(data)} />
                <button
                  type="button"
                  onClick={() => void close()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <X size={16} aria-hidden="true" />
                  关闭
                </button>
              </>
            ),
          }}
        />
      </div>
    </div>
  )
}

function PublishButton({ busy, onPublish }: { busy: boolean; onPublish: (data: Data) => void }) {
  const getPuck = useGetPuck()
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPublish(getPuck().appState.data)}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
    >
      <GlobeHemisphereEast size={16} aria-hidden="true" />
      {busy ? '发布中…' : '发布'}
    </button>
  )
}
