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
  const hoursLow = student.remainingHours <= 2
  const lessonExpiry = getDateMeta(student.lessonExpiryDate, todayString)
  const accountFeeExpiry = getDateMeta(student.accountFeeExpiryDate, todayString)
  const miraiClubExpiry = getDateMeta(student.miraiClubExpiryDate, todayString)
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
