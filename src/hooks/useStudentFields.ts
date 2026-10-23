import { useCallback, useEffect, useState } from 'react'
import {
  anyStudentField,
  fetchStudentFields,
  fetchStudentKinds,
  fetchStudentProfileExtras,
  NO_STUDENT_FIELDS,
  saveStudentProfileExtras,
  type StudentExtrasForm,
  type StudentFieldsSetting,
  type StudentKind,
  type StudentProfileExtras,
} from '../lib/studentFields'
import { DEFAULT_ROSTER_COUNTS, fetchFieldOptions, fetchRosterCounts, type FieldOption, type RosterCounts } from '../lib/studentRoster'

// The school's extra student fields (Chinese name, kind, consultant, second parent phone, and the roster fields):
// which are shown, the kinds of student and the other lists of choices, how subjects are counted, and each student's
// values. The values are read only when the school shows at least one field (never before the database update).
export function useStudentFields(signedIn: boolean, loadAttempt: number) {
  const [setting, setSetting] = useState<StudentFieldsSetting>(NO_STUDENT_FIELDS)
  const [kinds, setKinds] = useState<StudentKind[]>([])
  const [extras, setExtras] = useState<Map<number, StudentProfileExtras>>(new Map())
  const [options, setOptions] = useState<FieldOption[]>([])
  const [rosterCounts, setRosterCounts] = useState<RosterCounts>(DEFAULT_ROSTER_COUNTS)

  const loadValues = useCallback(async () => {
    const [nextKinds, nextExtras, nextOptions, nextCounts] = await Promise.all([
      fetchStudentKinds(),
      fetchStudentProfileExtras(),
      fetchFieldOptions(),
      fetchRosterCounts(),
    ])
    setKinds(nextKinds)
    setExtras(nextExtras)
    setOptions(nextOptions)
    setRosterCounts(nextCounts)
  }, [])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void fetchStudentFields().then(async (next) => {
      if (cancelled) return
      setSetting(next)
      if (anyStudentField(next)) await loadValues()
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, loadAttempt, loadValues])

  // After Class Settings switched fields on or off.
  const changeSetting = useCallback(
    (next: StudentFieldsSetting) => {
      setSetting(next)
      if (anyStudentField(next)) void loadValues()
    },
    [loadValues],
  )

  // Saves the shown fields of one student. Throws with a reason to show.
  const saveFor = useCallback(
    async (studentId: number, form: StudentExtrasForm) => {
      if (!anyStudentField(setting)) return
      const next = await saveStudentProfileExtras(studentId, form, extras.get(studentId), setting)
      if (next) setExtras((current) => new Map(current).set(studentId, next))
    },
    [extras, setting],
  )

  return { setting, kinds, setKinds, extras, options, setOptions, rosterCounts, setRosterCounts, changeSetting, saveFor }
}
