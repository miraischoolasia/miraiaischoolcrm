import type { EventInput } from '@fullcalendar/core'

export type PublicHoliday = {
  date: string
  name: string
}

// National (federal) Malaysia public holidays. Islamic, Hindu, and Buddhist
// dates (Chinese New Year, Hari Raya, Wesak, Deepavali, Awal Muharram,
// Maulidur Rasul) are lunar/lunisolar estimates subject to +/-1 day once
// confirmed by official gazette. State-specific holidays (e.g. a ruler's
// birthday) are intentionally excluded - this list is federal-wide only.
export const malaysiaPublicHolidays: PublicHoliday[] = [
  // 2026
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-17', name: 'Chinese New Year' },
  { date: '2026-02-18', name: 'Chinese New Year Holiday' },
  { date: '2026-03-21', name: 'Hari Raya Aidilfitri' },
  { date: '2026-03-22', name: 'Hari Raya Aidilfitri Holiday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-27', name: 'Hari Raya Haji' },
  { date: '2026-05-31', name: 'Wesak Day' },
  { date: '2026-06-01', name: "Yang di-Pertuan Agong's Birthday" },
  { date: '2026-06-17', name: 'Awal Muharram' },
  { date: '2026-08-25', name: 'Maulidur Rasul' },
  { date: '2026-08-31', name: 'Hari Merdeka (National Day)' },
  { date: '2026-09-16', name: 'Malaysia Day' },
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-12-25', name: 'Christmas Day' },
  // 2027
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-02-06', name: 'Chinese New Year' },
  { date: '2027-02-07', name: 'Chinese New Year Holiday' },
  { date: '2027-03-10', name: 'Hari Raya Aidilfitri' },
  { date: '2027-03-11', name: 'Hari Raya Aidilfitri Holiday' },
  { date: '2027-05-01', name: 'Labour Day' },
  { date: '2027-05-17', name: 'Hari Raya Haji' },
  { date: '2027-05-20', name: 'Wesak Day' },
  { date: '2027-06-06', name: 'Awal Muharram' },
  { date: '2027-06-07', name: "Yang di-Pertuan Agong's Birthday" },
  { date: '2027-08-15', name: 'Maulidur Rasul' },
  { date: '2027-08-31', name: 'Hari Merdeka (National Day)' },
  { date: '2027-09-16', name: 'Malaysia Day' },
  { date: '2027-10-29', name: 'Deepavali' },
  { date: '2027-12-25', name: 'Christmas Day' },
]

export function buildHolidayEvents(holidays: PublicHoliday[]): EventInput[] {
  return holidays.map((holiday) => ({
    id: `holiday-${holiday.date}`,
    title: holiday.name,
    start: holiday.date,
    allDay: true,
    extendedProps: {
      isHoliday: true,
    },
  }))
}

export const malaysiaHolidayEvents = buildHolidayEvents(malaysiaPublicHolidays)
