// How a parent is called when the school has no real name for them: by their children, "KEW KAYDEN's Parent",
// "KEW KAYDEN & KEW KAYVEN's Parent". A parent with a real name keeps it. Shown the same way in the chat list,
// the chat title, the Family card, the Leads list and the lead details.

// True for nothing at all, or for a "name" that is only a phone number or WhatsApp's long hidden ID
// ("60129219368", "+60 12-921 9368", "236998554123456").
export function isNumberName(name: string | null | undefined) {
  const text = (name ?? '').trim()
  return text === '' || /^[+\d\s()-]+$/.test(text)
}

// The real name, or null when there is none (empty, or only a number).
export function realNameOf(name: string | null | undefined) {
  return isNumberName(name) ? null : (name ?? '').trim()
}

function cleanNames(childNames: (string | null | undefined)[]) {
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of childNames) {
    const name = (raw ?? '').trim()
    const key = name.toLowerCase().replace(/[\s\p{P}]/gu, '')
    if (name !== '' && !seen.has(key)) {
      seen.add(key)
      names.push(name)
    }
  }
  return names
}

// "A's Parent", "A & B's Parent"; null when there is no child to name. Long ones are cut by the screen
// (one line with "..."), and the whole text is the hover text.
export function parentLabel(childNames: (string | null | undefined)[]) {
  const names = cleanNames(childNames)
  return names.length === 0 ? null : `${names.join(' & ')}'s Parent`
}

// What to show for a parent: the real name when there is one, else the children's label, else null
// (the caller then shows the number as before).
export function parentDisplayName(name: string | null | undefined, childNames: (string | null | undefined)[]) {
  return realNameOf(name) ?? parentLabel(childNames)
}

// A lead's parent, as the lists and the lead details call them: the real name, else "<children>'s Parent" from the
// children written on the lead (or, when none is written, the student the lead became). Null when there is
// nothing to say, so the screen shows what it showed before (the number).
export function leadParentName(
  lead: { fullName: string | null; children: { name?: string | null }[] },
  convertedStudentName?: string | null,
) {
  const names = lead.children.map((child) => child.name)
  return parentDisplayName(lead.fullName, names.some((name) => (name ?? '').trim() !== '') ? names : [convertedStudentName])
}

// What a chat is called in the list and above the messages, from what is known about it. Null leaves the number.
export function chatNameLabel(input: {
  // The name on the chat's lead (may be empty or only a number).
  leadName: string | null
  // Who the team said is on the chat.
  role: 'parent' | 'student' | null
  // The family table's view of this contact.
  personKind: 'contact' | 'parent' | 'student' | null
  personName: string | null
  // Enrolled students found for the chat, the children of the parent in the family table, the children written
  // on the lead.
  studentNames: (string | null | undefined)[]
  familyNames: (string | null | undefined)[]
  leadChildNames: (string | null | undefined)[]
}): string | null {
  const leadName = realNameOf(input.leadName)
  const pick = (names: (string | null | undefined)[]) => names.filter((name) => (name ?? '').trim() !== '')
  const family = pick(input.familyNames)
  const students = pick(input.studentNames)
  const names = family.length > 0 ? family : students.length > 0 ? students : pick(input.leadChildNames)
  if (!input.role) {
    // Nobody said who is on the chat: a name stays as it was. A parent the family table knows, with no name (or only
    // a number), is called by the children.
    if (leadName || input.personKind !== 'parent' || realNameOf(input.personName)) {
      return leadName
    }
    return parentLabel(names)
  }
  if (names.length === 0) {
    return leadName
  }
  if (input.role === 'student') {
    return `${(names[0] ?? '').trim()} (${students.length > 0 ? 'student' : 'child'})`
  }
  const parentOf = parentLabel(names) ?? ''
  return leadName ? `${leadName} · ${parentOf}` : parentOf
}
