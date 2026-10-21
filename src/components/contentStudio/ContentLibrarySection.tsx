import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, HandGrabbing } from '@phosphor-icons/react'
import {
  CONTENT_SIZES,
  EMPTY_FILTER,
  KIND_LABELS,
  SIZE_LABELS,
  claimItem,
  claimLabel,
  claimText,
  contentErrorMessage,
  fetchLibrary,
  filterLibrary,
  isFullyClaimed,
  type LibraryFilter,
  type LibraryItem,
} from '../../lib/contentStudio'
import { Chip, Notice, PrimaryButton, SecondaryButton, inputClass, type NoticeValue } from './ui'
import { formatTime, copyText } from './format'

// Marketing > Content Library: the approved posts. Claiming one copies its caption to share on your own
// social media; each post can be claimed by a limited number of people, and everybody sees how many have.
export function ContentLibrarySection() {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const [busy, setBusy] = useState<number | null>(null)
  // A caption the browser would not copy, shown to copy by hand.
  const [manual, setManual] = useState<{ id: number; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await fetchLibrary())
    } catch (failure) {
      setItems([])
      setNotice({ text: contentErrorMessage(failure, 'The library could not be loaded.'), isError: true })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const options = useMemo(() => {
    const briefs = new Map<number, string>()
    const styles = new Map<number, string>()
    const angles = new Map<number, string>()
    for (const item of items ?? []) {
      briefs.set(item.briefId, item.briefTitle)
      if (item.styleId && item.styleName) styles.set(item.styleId, item.styleName)
      if (item.angleId && item.angleName) angles.set(item.angleId, item.angleName)
    }
    return { briefs: [...briefs], styles: [...styles], angles: [...angles] }
  }, [items])

  const shown = filterLibrary(items ?? [], filter)

  async function copyCaption(item: LibraryItem, claimedNow: boolean) {
    const text = claimText(item)
    if (await copyText(text)) {
      setManual(null)
      setNotice({ text: claimedNow ? 'Claimed and copied. Paste it into your post.' : 'Copied again.', isError: false })
    } else {
      setManual({ id: item.id, text })
      setNotice({ text: `${claimedNow ? 'Claimed.' : ''} Copy the caption below by hand.`.trim(), isError: false })
    }
  }

  async function claim(item: LibraryItem) {
    setBusy(item.id)
    setNotice(null)
    try {
      const result = await claimItem(item.id)
      setItems((current) =>
        (current ?? []).map((entry) =>
          entry.id === item.id
            ? { ...entry, claimedCount: result.claimedCount, claimLimit: result.claimLimit, myClaimedAt: result.claimedAt }
            : entry,
        ),
      )
      await copyCaption(item, !result.already)
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, 'The post could not be claimed.'), isError: true })
      await load()
    }
    setBusy(null)
  }

  const select = (label: string, value: string, entries: [string | number, string][], onChange: (value: string) => void) => (
    <label className="space-y-1 text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {entries.map(([key, name]) => (
          <option key={key} value={String(key)}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section className="space-y-4">
      <p className="max-w-2xl text-sm text-slate-600">
        Approved posts to share on your own Facebook, Instagram, Xiaohongshu or WhatsApp status. Press <b>Claim</b> to take
        one and copy its caption. Pictures come in the next update.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {select('Campaign', filter.briefId === null ? '' : String(filter.briefId), options.briefs, (value) => setFilter({ ...filter, briefId: value ? Number(value) : null }))}
        {select('Style', filter.styleId === null ? '' : String(filter.styleId), options.styles, (value) => setFilter({ ...filter, styleId: value ? Number(value) : null }))}
        {select('Angle', filter.angleId === null ? '' : String(filter.angleId), options.angles, (value) => setFilter({ ...filter, angleId: value ? Number(value) : null }))}
        {select(
          'Size / platform',
          filter.size ?? '',
          CONTENT_SIZES.map((size) => [size, SIZE_LABELS[size]]),
          (value) => setFilter({ ...filter, size: (value || null) as LibraryFilter['size'] }),
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Show</span>
          <select className={inputClass} value={filter.show} onChange={(e) => setFilter({ ...filter, show: e.target.value as LibraryFilter['show'] })}>
            <option value="all">Everything</option>
            <option value="open">Still open to claim</option>
            <option value="mine">Claimed by me</option>
          </select>
        </label>
      </div>
      <Notice notice={notice} />
      {items === null && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {items !== null && shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          {items.length === 0 ? 'No approved posts yet.' : 'No posts match.'}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((item) => {
          const full = isFullyClaimed(item)
          const mine = item.myClaimedAt !== null
          return (
            <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`library-item-${item.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="brand">{item.briefTitle}</Chip>
                <Chip>{SIZE_LABELS[item.size]}</Chip>
                <Chip>
                  {KIND_LABELS[item.kind]}
                  {item.kind === 'carousel' ? ` · ${item.pages} pages` : ''}
                </Chip>
                <span className="ml-auto">
                  <Chip tone={full ? 'bad' : mine ? 'good' : 'plain'}>{full ? `Fully claimed · ${claimLabel(item)}` : claimLabel(item)}</Chip>
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{item.headline}</h3>
                {item.subheadline && <p className="text-sm text-slate-600">{item.subheadline}</p>}
              </div>
              {item.posterText && (
                <p className="whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.posterText}</p>
              )}
              <details className="text-sm text-slate-700">
                <summary className="cursor-pointer font-semibold text-slate-800">Caption</summary>
                <p className="mt-2 whitespace-pre-line">{item.caption}</p>
              </details>
              {manual?.id === item.id && (
                <textarea readOnly className={inputClass} rows={6} value={manual.text} onFocus={(e) => e.target.select()} aria-label="Caption to copy" />
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {mine ? (
                  <>
                    <SecondaryButton disabled={busy === item.id} onClick={() => void claim(item)}>
                      <Copy size={16} /> Copy caption again
                    </SecondaryButton>
                    <span className="text-xs text-slate-500">You claimed it {formatTime(item.myClaimedAt)}</span>
                  </>
                ) : full ? (
                  <SecondaryButton disabled>All claimed</SecondaryButton>
                ) : (
                  <PrimaryButton disabled={busy === item.id} onClick={() => void claim(item)}>
                    <HandGrabbing size={16} weight="bold" /> {busy === item.id ? 'Claiming…' : 'Claim & copy caption'}
                  </PrimaryButton>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
