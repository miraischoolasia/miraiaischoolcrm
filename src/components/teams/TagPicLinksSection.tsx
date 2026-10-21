import { useCallback, useEffect, useState } from 'react'
import { fetchTagPicRules, setTagPicLink, type PicChoice, type TagPicRow } from '../../lib/familyHandler'

// Leads > tags that name a person in charge: a lead that gets such a tag, and has no PIC yet, is given that PIC.
// Each school sets its own (EduHero's WhatsApp labels Violet, Crystal ... name the staff who look after those families).
export function TagPicLinksSection() {
  const [tags, setTags] = useState<TagPicRow[]>([])
  const [pics, setPics] = useState<PicChoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await fetchTagPicRules()
      setTags(next.tags)
      setPics(next.pics)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the tags.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleChange(tag: TagPicRow, picOptionId: number | null) {
    setSavingId(tag.id)
    setError(null)
    try {
      await setTagPicLink(tag.id, picOptionId)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Tags that name a person in charge</h2>
        <p className="mt-1 text-sm text-slate-500">
          When a lead gets one of these tags and has no PIC yet, it is given that PIC. A lead that already has a PIC keeps it; two tags
          naming different PICs are left for the team to decide.
        </p>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {tags.length === 0 ? (
          <p className="text-sm text-slate-500">No tags yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {tags.map((tag) => (
              <li key={tag.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className={tag.isActive ? 'text-sm font-semibold text-slate-800' : 'text-sm text-slate-400'}>
                  {tag.label}
                  {!tag.isActive && ' (hidden)'}
                </span>
                <select
                  aria-label={`PIC of the tag ${tag.label}`}
                  value={tag.picOptionId ?? ''}
                  disabled={savingId === tag.id}
                  onChange={(event) => void handleChange(tag, event.target.value === '' ? null : Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] sm:w-64"
                >
                  <option value="">No PIC</option>
                  {pics.map((pic) => (
                    <option key={pic.id} value={pic.id}>
                      {pic.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
