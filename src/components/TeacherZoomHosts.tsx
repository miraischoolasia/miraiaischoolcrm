import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type TeacherRow = { id: number; name: string; host: string | null }

// Class Settings > Zoom: the Zoom account each teacher's lessons use first
// (another one only when it is full at that time). Saved as soon as it is picked.
export function TeacherZoomHosts({ hosts }: { hosts: string[] }) {
  const [teachers, setTeachers] = useState<TeacherRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('teachers')
      .select('id, full_name, zoom_host_user')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message)
          return
        }
        setTeachers((data ?? []).map((row) => ({ id: row.id, name: row.full_name, host: row.zoom_host_user })))
      })
  }, [])

  async function change(teacherId: number, host: string | null) {
    if (!supabase) return
    setError(null)
    setSavedId(null)
    const { error: saveError } = await supabase.rpc('set_teacher_zoom_host', { p_teacher_id: teacherId, p_host: host })
    if (saveError) {
      setError(saveError.message || 'Failed to save.')
      return
    }
    setTeachers((current) => (current ?? []).map((row) => (row.id === teacherId ? { ...row, host } : row)))
    setSavedId(teacherId)
  }

  if (teachers === null && !error) return null

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Each teacher's Zoom account</h3>
      <p className="text-sm text-slate-500">
        A teacher's lessons use their account first; only when it is full at that time does the lesson go to another account
        above. Teachers do not sign in to it: "Start as host" in the class console opens the meeting as host.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {teachers && teachers.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {teachers.map((teacher) => {
            const options = Array.from(new Set([...(teacher.host ? [teacher.host] : []), ...hosts]))
            return (
              <li key={teacher.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">{teacher.name}</span>
                <span className="flex items-center gap-2">
                  {savedId === teacher.id && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
                  <select
                    value={teacher.host ?? ''}
                    onChange={(event) => void change(teacher.id, event.target.value || null)}
                    aria-label={`Zoom account for ${teacher.name}`}
                    className="max-w-[260px] rounded-xl border border-slate-200 px-2 py-1 text-sm"
                  >
                    <option value="">Any free account</option>
                    {options.map((host) => (
                      <option key={host} value={host}>
                        {host}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
