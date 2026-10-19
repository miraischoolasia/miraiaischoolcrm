import { supabase } from './supabase'

// The data the CRM page reads at start, by the part of the page it fills, with the tables each part
// is read from. When the page comes back after a gap it reads again only the parts whose tables changed.
export const CORE_GROUPS = {
  classrooms: ['classrooms', 'classroom_teachers'],
  teachers: ['teachers'],
  students: ['students', 'student_classroom_periods'],
  schedules: ['schedules'],
  participants: ['schedule_students'],
  exceptions: ['schedule_exceptions'],
  trialBookings: ['trial_bookings'],
  lessonLogs: ['lesson_logs'],
  lessonReviews: ['lesson_log_student_reviews', 'lesson_review_scores'],
  leads: ['leads'],
  makeupPlans: ['makeup_plans'],
  leadOptions: ['lead_options'],
  packages: ['packages'],
  reviewCriteria: ['review_criteria'],
  attendanceStatuses: ['attendance_statuses'],
  rewards: ['reward_presets', 'reward_levels'],
  subjects: ['subjects'],
  ageGroups: ['age_groups'],
  programLevels: ['program_levels'],
} as const satisfies Record<string, readonly string[]>

export type CoreGroup = keyof typeof CORE_GROUPS

// What to read again: everything, or only some parts.
export type CoreSyncTarget = 'all' | ReadonlySet<CoreGroup>

// Each table's change number (crm_table_versions). A table missing from it does not exist in this
// database; null means it exists but its number is not kept, so it is read every time.
export type TableVersions = Readonly<Record<string, number | null>>

const ALL_TABLES = [...new Set(Object.values(CORE_GROUPS).flat())]

// Before the migration the function is not there: asked once, then the page reads everything as before.
let versionsMissing = false

function isMissingFunction(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202' || error.code === '42883'
}

// One small request: the change number of every table the page reads. Null when it can't be told
// (not set up yet, or offline), and then the caller reads everything.
export async function fetchTableVersions(): Promise<TableVersions | null> {
  if (!supabase || versionsMissing) {
    return null
  }
  try {
    const { data, error } = await supabase.rpc('crm_table_versions', { p_tables: ALL_TABLES })
    if (error) {
      if (isMissingFunction(error)) {
        versionsMissing = true
      }
      return null
    }
    const versions: Record<string, number | null> = {}
    for (const row of data ?? []) {
      if (row.present) {
        versions[row.table_name] = row.tracked ? Number(row.version) : null
      }
    }
    return versions
  } catch {
    return null
  }
}

// The parts of the page whose tables changed between two looks.
export function changedGroups(known: TableVersions, next: TableVersions): Set<CoreGroup> {
  const changed = new Set<CoreGroup>()
  for (const [group, tables] of Object.entries(CORE_GROUPS) as [CoreGroup, readonly string[]][]) {
    for (const table of tables) {
      if (!(table in next)) {
        continue
      }
      const now = next[table]
      if (now === null || known[table] !== now) {
        changed.add(group)
        break
      }
    }
  }
  return changed
}

// For tests: forget that the function was found missing.
export function resetTableVersionsForTests() {
  versionsMissing = false
}
