import type { Lead, LeadOption, Student } from '../types/domain'
import type { VariableValues } from './quickReplies'
import { matchSourceRules, type SourceRule } from './sourceRules'
import { attachmentLabel, type ChatwootMessage } from './whatsappInbox'

// How a WhatsApp chat is tied to the school's own records: a phone number match,
// a guess at where the parent came from, and the first thing they wrote.

// Malaysian numbers are written 012-345 6789 or +60 12-345 6789; both mean the same.
export function canonicalPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length < 8) {
    return null
  }
  if (digits.startsWith('0')) {
    return `60${digits.slice(1)}`
  }
  // A Singapore number written without its country code.
  if (digits.length === 8) {
    return `65${digits}`
  }
  return digits
}

// Leads whose parent or child number is the chat's number, newest first.
export function findLeadsByPhone(phone: string | null | undefined, leads: Lead[]) {
  const wanted = canonicalPhone(phone)
  if (!wanted) {
    return []
  }
  return leads
    .filter((lead) =>
      [lead.phone, ...lead.children.map((child) => child.phone)].some((value) => canonicalPhone(value) === wanted),
    )
    .sort((a, b) => b.id - a.id)
}

// The lead a chat belongs to: the one it was tied to, otherwise one with the
// same phone number.
export function resolveChatLead(linkedLeadId: number | null, phone: string | null, leads: Lead[]) {
  const linked = linkedLeadId === null ? null : (leads.find((lead) => lead.id === linkedLeadId) ?? null)
  if (linked) {
    return { lead: linked, byPhone: false }
  }
  const matched = findLeadsByPhone(phone, leads)[0] ?? null
  return { lead: matched, byPhone: matched !== null }
}

// The names a quick reply can fill in for this chat.
export function quickReplyValues(input: {
  lead: Lead | null
  chatName: string
  trialDate: string | null
  myName: string
}): VariableValues {
  const { lead } = input
  return {
    '{parent name}': lead?.fullName || input.chatName,
    '{child name}': lead?.children[0]?.name ?? '',
    '{trial date}': input.trialDate ?? '',
    '{my name}': input.myName,
  }
}

export function findStudentsByPhone(phone: string | null | undefined, students: Student[]) {
  const wanted = canonicalPhone(phone)
  if (!wanted) {
    return []
  }
  return students.filter((student) => canonicalPhone(student.phone) === wanted)
}

export type FirstMessage = { text: string; attachments: string[]; at: number }

// What the parent wrote first, among the messages we have loaded.
export function getFirstMessage(messages: ChatwootMessage[]): FirstMessage | null {
  const first = messages.find(
    (message) => message.message_type === 0 && !message.private && !message.content_attributes?.deleted,
  )
  if (!first) {
    return null
  }
  return {
    text: (first.content ?? '').trim(),
    attachments: (first.attachments ?? []).map(attachmentLabel),
    at: first.created_at,
  }
}

// rule is the phrase of the first rule that matched, when a rule made the guess.
export type SourceGuess = { source: LeadOption | null; tags: LeadOption[]; rule?: string }

function wordsOf(label: string) {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
}

function mentions(text: string, option: LeadOption) {
  const label = option.label.trim().toLowerCase()
  if (!label) {
    return false
  }
  if (text.includes(label)) {
    return true
  }
  return wordsOf(label).some((word) => new RegExp(`\\b${word}\\b`).test(text))
}

// Guesses the source and tags by looking for their names in the first message.
// "Other" is never guessed: it is what a lead gets when nothing fits.
export function guessSourceAndTags(text: string, options: LeadOption[], rules: SourceRule[] = []): SourceGuess {
  const byRule = matchSourceRules(text, rules)
  if (byRule.rules.length > 0) {
    const active = options.filter((option) => option.isActive)
    return {
      source: active.find((option) => option.kind === 'source' && option.id === byRule.sourceId) ?? null,
      tags: active.filter((option) => option.kind === 'tag' && byRule.tagIds.includes(option.id)),
      rule: byRule.rules[0].phrase,
    }
  }
  const lowered = text.toLowerCase()
  if (!lowered.trim()) {
    return { source: null, tags: [] }
  }
  const active = options.filter((option) => option.isActive)
  const source =
    active.find((option) => option.kind === 'source' && option.legacyKey !== 'other' && mentions(lowered, option)) ?? null
  const tags = active.filter((option) => option.kind === 'tag' && mentions(lowered, option))
  return { source, tags }
}

// Adds a dated line to a student's notes without touching what is there.
export function appendLeaveNote(existing: string | null, entry: { date: string; text: string; by: string }) {
  const line = `Leave (noted ${entry.date} by ${entry.by}): ${entry.text.trim()}`
  return existing && existing.trim() ? `${existing.trim()}\n${line}` : line
}
