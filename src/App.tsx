import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Database } from './types/database'

type Student = {
  id: number
  name: string
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
}

type FilterKey = 'all' | 'hours' | 'accountFee' | 'mirai' | 'normal'

type RenewalFormState = {
  addHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
}

type StatusTag = {
  label: string
  tone: 'critical' | 'healthy'
}

type StudentRow = Pick<
  Database['public']['Tables']['students']['Row'],
  | 'id'
  | 'full_name'
  | 'remaining_hours'
  | 'lesson_expiry_date'
  | 'account_fee_expiry_date'
  | 'mirai_club_expiry_date'
>

const warningWindowDays = 14

const filterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'hours', label: 'Hours Low / Expired' },
  { key: 'accountFee', label: 'Account Fee Due' },
  { key: 'mirai', label: 'Mirai Club Due' },
  { key: 'normal', label: 'All Normal' },
]

const sidebarItems = [
  'Dashboard',
  'Students',
  'Calendar',
  'Attendance',
  'Finance',
  'Settings',
]

function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(dateString))
}

function getDayDifference(dateString: string, todayString: string) {
  const current = parseLocalDate(todayString).getTime()
  const target = parseLocalDate(dateString).getTime()
  return Math.round((target - current) / 86400000)
}

function getDateMeta(dateString: string, todayString: string) {
  const daysUntil = getDayDifference(dateString, todayString)
  const expired = daysUntil < 0
  const dueSoon = !expired && daysUntil < warningWindowDays

  return { daysUntil, expired, dueSoon }
}

function getStudentStatus(student: Student, todayString: string) {
  const hoursLow = student.remainingHours <= 2
  const lessonExpiry = getDateMeta(student.lessonExpiryDate, todayString)
  const accountFeeExpiry = getDateMeta(student.accountFeeExpiryDate, todayString)
  const miraiClubExpiry = getDateMeta(student.miraiClubExpiryDate, todayString)

  const tags: StatusTag[] = []

  if (hoursLow) {
    tags.push({ label: 'Hours Low', tone: 'critical' })
  }

  if (lessonExpiry.expired) {
    tags.push({ label: 'Lesson Expired', tone: 'critical' })
  }

  if (accountFeeExpiry.expired || accountFeeExpiry.dueSoon) {
    tags.push({ label: 'Renew Account Fee', tone: 'critical' })
  }

  if (miraiClubExpiry.expired || miraiClubExpiry.dueSoon) {
    tags.push({ label: 'Renew Mirai Club', tone: 'critical' })
  }

  if (tags.length === 0) {
    tags.push({ label: 'Normal', tone: 'healthy' })
  }

  return {
    hoursLow,
    lessonExpired: lessonExpiry.expired,
    accountFeeNeedsAttention: accountFeeExpiry.expired || accountFeeExpiry.dueSoon,
    miraiClubNeedsAttention:
      miraiClubExpiry.expired || miraiClubExpiry.dueSoon,
    lessonExpiry,
    accountFeeExpiry,
    miraiClubExpiry,
    tags,
    isNormal: tags.length === 1 && tags[0].label === 'Normal',
  }
}

function mapStudentRow(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.full_name,
    remainingHours: row.remaining_hours,
    lessonExpiryDate: row.lesson_expiry_date,
    accountFeeExpiryDate: row.account_fee_expiry_date,
    miraiClubExpiryDate: row.mirai_club_expiry_date,
  }
}

async function fetchStudentsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('students')
    .select(
      'id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date',
    )
    .order('full_name')

  if (error) {
    throw error
  }

  return data.map(mapStudentRow)
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function StatusChip({ label, tone }: StatusTag) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
        tone === 'critical' && 'border-[#fecdd3] bg-[#fff1f8] text-[#be185d]',
        tone === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {label}
    </span>
  )
}

function ExpiryCell({
  date,
  meta,
}: {
  date: string
  meta: ReturnType<typeof getDateMeta>
}) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-800">{formatDate(date)}</div>
      <div
        className={cn(
          'text-xs font-medium',
          meta.expired && 'text-red-600',
          !meta.expired && meta.dueSoon && 'text-amber-600',
          !meta.expired && !meta.dueSoon && 'text-slate-500',
        )}
      >
        {meta.expired
          ? `Expired ${Math.abs(meta.daysUntil)}d ago`
          : meta.dueSoon
            ? `Due in ${meta.daysUntil}d`
            : 'Active'}
      </div>
    </div>
  )
}

function App() {
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [formState, setFormState] = useState<RenewalFormState>({
    addHours: '0',
    lessonExpiryDate: '',
    accountFeeExpiryDate: '',
    miraiClubExpiryDate: '',
  })

  const todayString = getTodayString()
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null

  useEffect(() => {
    if (!selectedStudent) {
      return
    }

    setFormState({
      addHours: '0',
      lessonExpiryDate: selectedStudent.lessonExpiryDate,
      accountFeeExpiryDate: selectedStudent.accountFeeExpiryDate,
      miraiClubExpiryDate: selectedStudent.miraiClubExpiryDate,
    })
  }, [selectedStudent])

  useEffect(() => {
    let cancelled = false

    async function loadStudents() {
      if (!isSupabaseConfigured) {
        setLoadError(
          'Supabase is not configured yet. Fill in .env.local, then restart npm run dev.',
        )
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setLoadError(null)
        const nextStudents = await fetchStudentsFromSupabase()

        if (!cancelled) {
          setStudents(nextStudents)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load students.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadStudents()

    return () => {
      cancelled = true
    }
  }, [])

  const studentsWithStatus = students.map((student) => ({
    student,
    status: getStudentStatus(student, todayString),
  }))

  const filteredStudents = studentsWithStatus.filter(({ status }) => {
    if (activeFilter === 'hours') {
      return status.hoursLow || status.lessonExpired
    }

    if (activeFilter === 'accountFee') {
      return status.accountFeeNeedsAttention
    }

    if (activeFilter === 'mirai') {
      return status.miraiClubNeedsAttention
    }

    if (activeFilter === 'normal') {
      return status.isNormal
    }

    return true
  })

  const totalStudents = studentsWithStatus.length
  const hoursAlertCount = studentsWithStatus.filter(
    ({ status }) => status.hoursLow || status.lessonExpired,
  ).length
  const accountFeeAlertCount = studentsWithStatus.filter(
    ({ status }) => status.accountFeeNeedsAttention,
  ).length
  const miraiAlertCount = studentsWithStatus.filter(
    ({ status }) => status.miraiClubNeedsAttention,
  ).length

  function toggleFilter(nextFilter: FilterKey) {
    setActiveFilter((currentFilter) =>
      currentFilter === nextFilter ? 'all' : nextFilter,
    )
  }

  function updateForm<K extends keyof RenewalFormState>(
    key: K,
    value: RenewalFormState[K],
  ) {
    setFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function closeModal() {
    setSelectedStudentId(null)
    setSaveError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedStudent || !supabase) {
      return
    }

    const parsedHours = Number.parseInt(formState.addHours, 10)
    const hoursToAdd =
      Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 0

    try {
      setIsSaving(true)
      setSaveError(null)

      const { data, error } = await supabase
        .from('students')
        .update({
          remaining_hours: selectedStudent.remainingHours + hoursToAdd,
          lesson_expiry_date:
            formState.lessonExpiryDate || selectedStudent.lessonExpiryDate,
          account_fee_expiry_date:
            formState.accountFeeExpiryDate || selectedStudent.accountFeeExpiryDate,
          mirai_club_expiry_date:
            formState.miraiClubExpiryDate || selectedStudent.miraiClubExpiryDate,
        })
        .eq('id', selectedStudent.id)
        .select(
          'id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date',
        )
        .single()

      if (error) {
        throw error
      }

      const updatedStudent = mapStudentRow(data)

      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student.id === updatedStudent.id ? updatedStudent : student,
        ),
      )

      closeModal()
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save renewal.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 bg-[#2f2f2f] text-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center border-b border-white/10 px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fc0c97] text-lg font-bold">
              M
            </div>
            <div className="ml-3">
              <div className="text-sm font-semibold">Mirai Admin</div>
              <div className="text-xs text-white/60">Teaching System</div>
            </div>
          </div>

          <div className="px-4 py-5">
            <div className="rounded-2xl bg-[#fc0c97] px-4 py-3">
              <div className="text-sm font-semibold">Admin Workspace</div>
              <div className="mt-1 text-xs text-white/85">
                Student hours and expiry overview
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {sidebarItems.map((item) => {
              const active = item === 'Dashboard'
              return (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition',
                    active
                      ? 'bg-white text-[#fc0c97]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  <span className="ml-3">{item}</span>
                </button>
              )
            })}
          </nav>

          <div className="border-t border-white/10 px-6 py-5 text-xs text-white/50">
            Supabase phase 2 · Admin only
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#fc0c97]">
                  Dashboard
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                  Student Hours & Expiry
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 sm:block">
                  Local Date: {formatDate(todayString)}
                </div>
                <div
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-semibold',
                    isSupabaseConfigured
                      ? 'bg-[#fff1f8] text-[#fc0c97]'
                      : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {isSupabaseConfigured ? 'Supabase Connected' : 'Setup Required'}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
            {loadError && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                {loadError}
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">Total Students</div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">
                  {totalStudents}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">Hours Attention</div>
                <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
                  {hoursAlertCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">Account Fee Due</div>
                <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
                  {accountFeeAlertCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">Mirai Club Due</div>
                <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
                  {miraiAlertCount}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Student Table View
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Data is now read directly from Supabase and saved back on
                      renewal.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {filterOptions.map((option) => {
                      const selected = activeFilter === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => toggleFilter(option.key)}
                          className={cn(
                            'rounded-xl border px-4 py-2 text-sm font-medium transition',
                            selected
                              ? 'border-[#fc0c97] bg-[#fff1f8] text-[#fc0c97]'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1120px] divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Remaining Hours</th>
                      <th className="px-6 py-4">Lesson Expiry</th>
                      <th className="px-6 py-4">Account Fee Expiry</th>
                      <th className="px-6 py-4">Mirai Club Expiry</th>
                      <th className="px-6 py-4">Global Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoading && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-16 text-center text-sm text-slate-500"
                        >
                          Loading students from Supabase...
                        </td>
                      </tr>
                    )}

                    {!isLoading &&
                      filteredStudents.map(({ student, status }) => (
                        <tr
                          key={student.id}
                          className="align-top transition hover:bg-[#fff8fc]"
                        >
                          <td className="px-6 py-5">
                            <div className="space-y-1">
                              <div className="text-base font-semibold text-slate-900">
                                {student.name}
                              </div>
                              <div className="text-sm text-slate-500">
                                Student ID #{student.id.toString().padStart(3, '0')}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="space-y-2">
                              <div
                                className={cn(
                                  'inline-flex min-w-20 items-center justify-center rounded-xl px-3 py-2 text-lg font-semibold',
                                  status.hoursLow
                                    ? 'bg-[#fff1f8] text-[#be185d] ring-1 ring-inset ring-[#fecdd3]'
                                    : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
                                )}
                              >
                                {student.remainingHours}
                              </div>
                              <div className="text-xs font-medium text-slate-500">
                                {status.hoursLow
                                  ? 'Immediate action needed'
                                  : 'Healthy balance'}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <ExpiryCell
                              date={student.lessonExpiryDate}
                              meta={status.lessonExpiry}
                            />
                          </td>
                          <td className="px-6 py-5">
                            <ExpiryCell
                              date={student.accountFeeExpiryDate}
                              meta={status.accountFeeExpiry}
                            />
                          </td>
                          <td className="px-6 py-5">
                            <ExpiryCell
                              date={student.miraiClubExpiryDate}
                              meta={status.miraiClubExpiry}
                            />
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex max-w-[320px] flex-wrap gap-2">
                              {status.tags.map((tag) => (
                                <StatusChip
                                  key={`${student.id}-${tag.label}`}
                                  label={tag.label}
                                  tone={tag.tone}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSaveError(null)
                                setSelectedStudentId(student.id)
                              }}
                              className="inline-flex items-center justify-center rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                            >
                              Renew
                            </button>
                          </td>
                        </tr>
                      ))}

                    {!isLoading && filteredStudents.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-16 text-center text-sm text-slate-500"
                        >
                          No students found. Create records in Supabase Table
                          Editor or run the seed rows from the SQL file.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    Manual renewal panel
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    Renew {selectedStudent.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    This save button now updates the real Supabase database.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6 sm:px-8">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current Remaining Hours
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {selectedStudent.remainingHours}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current Local Date
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatDate(todayString)}
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Add Hours
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formState.addHours}
                    onChange={(event) => updateForm('addHours', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Lesson Expiry Date
                  </span>
                  <input
                    type="date"
                    value={formState.lessonExpiryDate}
                    onChange={(event) =>
                      updateForm('lessonExpiryDate', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Account Fee Expiry Date
                  </span>
                  <input
                    type="date"
                    value={formState.accountFeeExpiryDate}
                    onChange={(event) =>
                      updateForm('accountFeeExpiryDate', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Mirai Club Expiry Date
                  </span>
                  <input
                    type="date"
                    value={formState.miraiClubExpiryDate}
                    onChange={(event) =>
                      updateForm('miraiClubExpiryDate', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? 'Saving...' : 'Save Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
