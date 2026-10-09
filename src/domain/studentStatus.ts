const warningWindowDays = 14

export type StatusTag = {
  label: string
  tone: 'critical' | 'healthy'
}

export type StudentStatusInput = {
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  isActive: boolean
  studentType?: 'trial' | 'preview' | 'regular'
  // False for a package without Account Fee / Mirai Club (Trial 1 Month,
  // Camp): those dates are not tracked, so they raise no alerts.
  feesApply?: boolean
}

export function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(dateString))
}

export function getDayDifference(dateString: string, todayString: string) {
  const current = parseLocalDate(todayString).getTime()
  const target = parseLocalDate(dateString).getTime()
  return Math.round((target - current) / 86400000)
}

export function getDateMeta(dateString: string, todayString: string) {
  const daysUntil = getDayDifference(dateString, todayString)
  const expired = daysUntil < 0
  const dueSoon = !expired && daysUntil < warningWindowDays

  return { daysUntil, expired, dueSoon }
}

export function getStudentStatus(
  student: StudentStatusInput,
  todayString: string,
) {
  if (student.studentType === 'preview') {
    const tags: StatusTag[] = student.isActive
      ? [{ label: 'Preview', tone: 'healthy' }]
      : [{ label: 'Deactivated', tone: 'critical' }]
    const meta = { daysUntil: 0, expired: false, dueSoon: false }

    return {
      isDeactivated: !student.isActive,
      hoursLow: false,
      lessonExpired: false,
      accountFeeNeedsAttention: false,
      miraiClubNeedsAttention: false,
      lessonExpiry: meta,
      accountFeeExpiry: meta,
      miraiClubExpiry: meta,
      tags,
      isNormal: student.isActive,
    }
  }

  // A trial-slot booking creates one of these per session (0 hours, today's
  // date on every expiry field) purely so attendance has a student row to
  // record against — it is not an enrollment, so the usual hours/renewal
  // alerts would be false alarms.
  if (student.studentType === 'trial') {
    const tags: StatusTag[] = student.isActive
      ? [{ label: 'Trial', tone: 'healthy' }]
      : [{ label: 'Deactivated', tone: 'critical' }]
    const meta = { daysUntil: 0, expired: false, dueSoon: false }

    return {
      isDeactivated: !student.isActive,
      hoursLow: false,
      lessonExpired: false,
      accountFeeNeedsAttention: false,
      miraiClubNeedsAttention: false,
      lessonExpiry: meta,
      accountFeeExpiry: meta,
      miraiClubExpiry: meta,
      tags,
      isNormal: student.isActive,
    }
  }

  const hoursLow = student.remainingHours <= 2
  const lessonExpiry = getDateMeta(student.lessonExpiryDate, todayString)
  const feesApply = student.feesApply ?? true
  const noFee = { daysUntil: 0, expired: false, dueSoon: false }
  const accountFeeExpiry = feesApply
    ? getDateMeta(student.accountFeeExpiryDate, todayString)
    : noFee
  const miraiClubExpiry = feesApply
    ? getDateMeta(student.miraiClubExpiryDate, todayString)
    : noFee
  const isDeactivated = !student.isActive

  const tags: StatusTag[] = []

  if (isDeactivated) {
    tags.push({ label: 'Deactivated', tone: 'critical' })
  }

  if (hoursLow) {
    tags.push({ label: 'Classes Low', tone: 'critical' })
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
    isDeactivated,
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

export type StudentIssue = {
  label: string
  tone: 'critical' | 'warning'
  // 0 is the most urgent. Used to put the students who need action first.
  severity: number
}

type StudentStatus = ReturnType<typeof getStudentStatus>

// The Account Fee or the Mirai Club date that runs out first. Null when both
// are healthy or not tracked (a package without fees).
export function getWorstFee(status: StudentStatus) {
  const fees = [
    { name: 'Account Fee', meta: status.accountFeeExpiry, needsAttention: status.accountFeeNeedsAttention },
    { name: 'Mirai Club', meta: status.miraiClubExpiry, needsAttention: status.miraiClubNeedsAttention },
  ].filter((fee) => fee.needsAttention)

  if (fees.length === 0) {
    return null
  }

  return fees.reduce((worst, fee) => (fee.meta.daysUntil < worst.meta.daysUntil ? fee : worst))
}

// What needs doing for a student, most urgent first. Replaces reading five
// separate tags: the list shows the first one and counts the rest.
export function getStudentIssues(
  student: Pick<StudentStatusInput, 'isActive' | 'studentType' | 'remainingHours'>,
  status: StudentStatus,
): StudentIssue[] {
  if (!student.isActive) {
    return [{ label: 'Deactivated', tone: 'critical', severity: 0 }]
  }

  if (student.studentType === 'preview' || student.studentType === 'trial') {
    return []
  }

  const issues: StudentIssue[] = []

  if (status.lessonExpired) {
    issues.push({ label: 'Package ended', tone: 'critical', severity: 1 })
  } else if (student.remainingHours <= 0) {
    issues.push({ label: 'No classes left', tone: 'critical', severity: 1 })
  } else if (status.hoursLow) {
    issues.push({ label: 'Classes low', tone: 'warning', severity: 2 })
  }

  const fee = getWorstFee(status)
  if (fee?.meta.expired) {
    issues.push({ label: 'Fee expired', tone: 'critical', severity: 1 })
  } else if (fee) {
    issues.push({ label: `Fee due in ${fee.meta.daysUntil}d`, tone: 'warning', severity: 2 })
  }

  return issues.sort((a, b) => a.severity - b.severity)
}

// Sort key for "needs attention first": action needed < healthy < deactivated.
export function getAttentionRank(isActive: boolean, issues: StudentIssue[]) {
  if (!isActive) {
    return 11
  }
  return issues.length > 0 ? issues[0].severity : 10
}
