import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { ArrowSquareOut, Copy, Eye, FileDashed, PencilSimple, Plus, Trash, ArrowDown } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  createLandingPage,
  deleteLandingPage,
  listLandingPages,
  loadLandingPage,
  updateLandingPageInfo,
  type LandingPageFull,
  type LandingPageRow,
  type LandingPageStatus,
} from './landingApi'
import { landingPageUrl, slugFromTitle, slugProblem } from './landingData'
import { landingTemplates } from './templates'

// Marketing > Landing Page: the school's pages, a new one from a template, and the editor (downloaded only when a
// page is opened).

type EditorProps = { page: LandingPageFull; onClose: () => void; onPublished: () => void }

const statusLabel: Record<LandingPageStatus, string> = {
  draft: '草稿',
  published: '已发布',
  unpublished: '已下架',
}

const statusClass: Record<LandingPageStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-50 text-emerald-700',
  unpublished: 'bg-amber-50 text-amber-800',
}

function formatWhen(value: string | null) {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function LandingPagesSection({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [pages, setPages] = useState<LandingPageRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<LandingPageFull | null>(null)
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPages(await listLandingPages())
      setProblem(null)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '页面清单载入失败。')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function open(id: string) {
    setOpening(id)
    setProblem(null)
    try {
      const [page, module] = await Promise.all([loadLandingPage(id), import('./LandingEditor')])
      if (!page) {
        throw new Error('这个页面已经不在了。')
      }
      setEditor(() => module.LandingEditor)
      setEditing(page)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '编辑器打不开，请再试一次。')
    } finally {
      setOpening(null)
    }
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(landingPageUrl(slug))
      setMessage('连结已复制。')
    } catch {
      setMessage(landingPageUrl(slug))
    }
  }

  async function unpublish(page: LandingPageRow) {
    if (!window.confirm(`把「${page.title}」下架？家长打开连结会看到「页面不存在」。之后可以再发布。`)) {
      return
    }
    try {
      await updateLandingPageInfo(page.id, { status: 'unpublished' })
      setMessage(`「${page.title}」已下架。`)
      await refresh()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '下架失败。')
    }
  }

  async function remove(page: LandingPageRow) {
    if (!window.confirm(`永久删除「${page.title}」？连结会失效，不能复原。`)) {
      return
    }
    try {
      await deleteLandingPage(page.id)
      setMessage(`「${page.title}」已删除。`)
      await refresh()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '删除失败。')
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">用积木拖出招生、卖书、活动页面，发布后家长打开 /p/网址 就看得到。</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#fc0c97] px-4 text-sm font-semibold text-white hover:bg-[#de0a84]"
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            新页面
          </button>
        )}
      </div>

      {problem && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {problem}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      {pages === null ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">载入中…</p>
      ) : pages.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <FileDashed size={36} className="text-slate-400" aria-hidden="true" />
          <p className="font-semibold text-slate-900">还没有页面</p>
          <p className="text-sm text-slate-500">{canEdit ? '按「新页面」，选一个模板开始。' : '有编辑权限的同事做好页面后会出现在这里。'}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{page.title}</h3>
                  <p className="truncate text-sm text-slate-500">/p/{page.slug}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', statusClass[page.status])}>
                  {statusLabel[page.status]}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">浏览</dt>
                  <dd className="font-semibold text-slate-900">{page.views}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">最后修改</dt>
                  <dd className="font-semibold text-slate-900">{formatWhen(page.updated_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">发布</dt>
                  <dd className="font-semibold text-slate-900">{formatWhen(page.published_at)}</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => void open(page.id)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
                  >
                    <PencilSimple size={16} aria-hidden="true" />
                    {opening === page.id ? '打开中…' : '编辑'}
                  </button>
                ) : null}
                <a
                  href={`${landingPageUrl(page.slug)}?preview=1`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Eye size={16} aria-hidden="true" />
                  预览草稿
                </a>
                {page.status === 'published' && (
                  <>
                    <a
                      href={landingPageUrl(page.slug)}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowSquareOut size={16} aria-hidden="true" />
                      打开
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyLink(page.slug)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy size={16} aria-hidden="true" />
                      复制连结
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void unpublish(page)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                        下架
                      </button>
                    )}
                  </>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(page)}
                    aria-label={`删除 ${page.title}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash size={16} aria-hidden="true" />
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewPageDialog
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            void refresh()
            void open(id)
          }}
        />
      )}

      {editing && Editor && (
        <Editor
          page={editing}
          onClose={() => {
            setEditing(null)
            void refresh()
          }}
          onPublished={() => void refresh()}
        />
      )}
    </section>
  )
}

function NewPageDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [template, setTemplate] = useState(landingTemplates[1]?.key ?? 'blank')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const shownSlug = slugTouched ? slug : slugFromTitle(title)
  const slugError = shownSlug ? slugProblem(shownSlug) : null

  async function create() {
    if (!title.trim()) {
      setProblem('请填页面名称。')
      return
    }
    const finalSlug = shownSlug
    const error = finalSlug ? slugProblem(finalSlug) : '请填网址（英文、数字和「-」）。'
    if (error) {
      setProblem(error)
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      const chosen = landingTemplates.find((item) => item.key === template) ?? landingTemplates[0]
      const page = await createLandingPage(title, finalSlug, chosen.data())
      onCreated(page.id)
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : '新页面没有建立成功。')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="new-landing-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="new-landing-title" className="text-lg font-semibold text-slate-900">
          新页面
        </h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">页面名称</span>
          <input
            autoFocus
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：2026 年终书展"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="space-y-1.5">
          <label htmlFor="new-landing-slug" className="block text-sm font-semibold text-slate-900">
            网址
          </label>
          <div className="flex items-center rounded-xl border border-slate-200 focus-within:border-[#fc0c97]">
            <span className="pl-3 text-sm text-slate-400">/p/</span>
            <input
              id="new-landing-slug"
              aria-describedby="new-landing-slug-hint"
              value={shownSlug}
              maxLength={60}
              onChange={(event) => {
                setSlugTouched(true)
                setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }}
              placeholder="book-fair-2026"
              aria-invalid={slugError ? true : undefined}
              className="w-full rounded-xl px-1 py-2 text-sm outline-none"
            />
          </div>
          <span id="new-landing-slug-hint" className={cn('block text-xs', slugError ? 'text-red-600' : 'text-slate-500')}>
            {slugError ?? '小写英文、数字和「-」。发布后改网址，旧连结会失效。'}
          </span>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-900">从哪个模板开始</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {landingTemplates.map((item) => (
              <label
                key={item.key}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm',
                  template === item.key ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="radio"
                    name="landing-template"
                    value={item.key}
                    checked={template === item.key}
                    onChange={() => setTemplate(item.key)}
                    className="accent-[#fc0c97]"
                  />
                  {item.label}
                </span>
                <span className="text-xs text-slate-500">{item.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {problem && (
          <p role="alert" className="text-sm text-red-600">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void create()}
            className="min-h-10 rounded-xl bg-[#fc0c97] px-4 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
          >
            {saving ? '建立中…' : '建立并编辑'}
          </button>
        </div>
      </div>
    </div>
  )
}
