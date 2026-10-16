// Dates come from the database as YYYY-MM-DD (Malaysia time); they are shown
// without any time-zone shift.
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The year shows only when it is not this year ("Tue 31 Aug 2027").
export function formatDay(isoDate: string, thisYear = Number(todayInMalaysia().slice(0, 4))) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const shown = `${weekdays[date.getUTCDay()]} ${day} ${months[month - 1]}`
  return year === thisYear ? shown : `${shown} ${year}`
}

// "15:00" -> "3:00 pm"
export function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours >= 12 ? 'pm' : 'am'
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

// Today in Malaysia, YYYY-MM-DD.
export function todayInMalaysia(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
