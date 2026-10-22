// The student app chat's rules that need no database (tested in appChat.test.ts).

export type ChatContact = {
  staff_id: number
  staff_name: string
  role: 'teacher' | 'consultant'
  // The classes the teacher teaches the child (teachers only).
  classes: string | null
  // False for a teacher who no longer teaches the child: the old messages stay, read only.
  can_send: boolean
  thread_id: number | null
  last_message_at: string | null
  last_preview: string | null
  last_sender: 'student' | 'staff' | null
  unread: number
  staff_read_at: string | null
}

export type ChatMessage = { id: number; thread_id: number; sender: 'student' | 'staff'; body: string; created_at: string }

export const maxMessageLength = 2000

export function unreadTotal(contacts: ChatContact[]) {
  return contacts.reduce((sum, contact) => sum + (contact.unread > 0 ? contact.unread : 0), 0)
}

// The child's last message was read by the teacher (shown as "Read" under it).
export function seenByStaff(contact: ChatContact | null, messages: ChatMessage[]) {
  const last = messages[messages.length - 1]
  if (!contact?.staff_read_at || !last || last.sender !== 'student') return false
  return new Date(contact.staff_read_at).getTime() >= new Date(last.created_at).getTime()
}

// Adds messages that came live without doubling one already loaded.
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const seen = new Set(current.map((message) => message.id))
  const added = incoming.filter((message) => !seen.has(message.id))
  if (added.length === 0) return current
  return [...current, ...added].sort((a, b) => a.id - b.id)
}

export function roleLabel(contact: Pick<ChatContact, 'role'>) {
  return contact.role === 'consultant' ? 'Consultant' : 'Class teacher'
}

// "3:05 pm" today, otherwise "21 Oct".
export function messageTime(iso: string, now = new Date()) {
  const malaysia = (date: Date) => new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const at = malaysia(new Date(iso))
  const today = malaysia(now)
  if (at.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
    const hours = at.getUTCHours()
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(at.getUTCMinutes()).padStart(2, '0')} ${hours >= 12 ? 'pm' : 'am'}`
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${at.getUTCDate()} ${months[at.getUTCMonth()]}`
}
