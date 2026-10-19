import { useCallback, useEffect, useState } from 'react'
import { fetchPicLinks, linkPic, type PicLink } from '../../lib/staffTeams'

type PicLinksSectionProps = {
  people: { id: number; name: string }[]
}

// Leads > PIC names, each linked to the account it stands for: "only own leads" means the leads whose PIC
// is linked to that person (docs/teams-permissions-design.md, section 6).
export function PicLinksSection({ people }: PicLinksSectionProps) {
  const [pics, setPics] = useState<PicLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setPics(await fetchPicLinks())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the PIC names.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleLink(pic: PicLink, teacherId: number | null) {
    setSavingId(pic.id)
    setError(null)
    try {
      await linkPic(pic.id, teacherId)
      await load()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      setError(/unique|duplicate/i.test(message) ? 'That account already has a PIC name.' : message || "Couldn't link the PIC.")
    } finally {
      setSavingId(null)
    }
  }

  const unlinked = pics.filter((pic) => pic.isActive && pic.teacherId === null).length

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">PIC names and accounts</h2>
        <p className="mt-1 text-sm text-slate-500">
          A lead belongs to the person its PIC is linked to. Someone who may see only their own leads sees only these.
        </p>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {unlinked > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {unlinked === 1 ? '1 PIC name is' : `${unlinked} PIC names are`} not linked to an account yet: their leads belong to nobody.
          </div>
        )}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {pics.length === 0 ? (
          <p className="text-sm text-slate-500">No PIC names yet (Leads page, Manage PIC).</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {pics.map((pic) => (
              <li key={pic.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className={pic.isActive ? 'text-sm font-semibold text-slate-800' : 'text-sm text-slate-400'}>
                  {pic.label}
                  {!pic.isActive && ' (hidden)'}
                </span>
                <select
                  aria-label={`Account of ${pic.label}`}
                  value={pic.teacherId ?? ''}
                  disabled={savingId === pic.id}
                  onChange={(event) => void handleLink(pic, event.target.value === '' ? null : Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] sm:w-64"
                >
                  <option value="">Not linked</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
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
