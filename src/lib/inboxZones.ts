import type { InboxZone } from './whatsappNumbers'

// The two inboxes over the same chats (docs/student-inbox-spec.md): the Marketing Inbox shows every number that is
// not a students one; the Student Inbox shows only the students numbers. Which numbers a person may see at all
// (allowed, from my_whatsapp_inbox_ids) still applies on top.
//   allowed   the numbers the list may show; null = every number (still minus `excluded`)
//   excluded  numbers never shown, even when `allowed` is null
export type ZoneFilter = { allowed: number[] | null; excluded: number[] }

// undefined while it is not known yet which numbers the person may see (nothing is listed or counted until then).
export function zoneFilter(
  zone: InboxZone,
  allowed: number[] | null | undefined,
  studentInboxIds: readonly number[],
): ZoneFilter | undefined {
  if (allowed === undefined) {
    return undefined
  }
  if (zone === 'students') {
    return {
      allowed: allowed === null ? [...studentInboxIds] : allowed.filter((id) => studentInboxIds.includes(id)),
      excluded: [],
    }
  }
  return {
    allowed: allowed === null ? null : allowed.filter((id) => !studentInboxIds.includes(id)),
    excluded: [...studentInboxIds],
  }
}

// The numbers a list shows: nothing while it is not known yet (a restricted person never sees a chat flash by);
// null (every number but the excluded ones) stays null.
export function listedInboxIds(filter: ZoneFilter | undefined): number[] | null {
  return filter === undefined ? [] : filter.allowed
}

// The Student Inbox is in the menu for whoever has its tick (an admin always does), once the school has at least
// one students number. A school that has none (Mirai for now) simply does not see it.
export function showsStudentInbox(hasTick: boolean, studentInboxIds: readonly number[]) {
  return hasTick && studentInboxIds.length > 0
}
