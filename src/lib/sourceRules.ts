// Source rules: "if the first message says this, the source is that and the tags
// are those". Kept apart from the screens so the matching is easy to test.

export type SourceRule = {
  id: number
  phrase: string
  sourceId: number | null
  tagIds: number[]
  isActive: boolean
}

// Lower case, with every run of spaces, punctuation, emoji and line breaks as one
// space, so an advert's line still matches after a parent edits the spacing.
export function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export type RuleMatch = {
  // The source of the longest matching phrase that sets one.
  sourceId: number | null
  tagIds: number[]
  rules: SourceRule[]
}

// The active rules whose phrase appears in the message. Longer phrases are more
// specific, so they decide the source; tags from every match are added.
export function matchSourceRules(message: string, rules: SourceRule[]): RuleMatch {
  const text = normalizeForMatch(message)
  const matched = rules
    .filter((rule) => {
      const phrase = normalizeForMatch(rule.phrase)
      return rule.isActive && phrase.length > 0 && text.includes(phrase)
    })
    .sort((a, b) => normalizeForMatch(b.phrase).length - normalizeForMatch(a.phrase).length)

  return {
    sourceId: matched.find((rule) => rule.sourceId !== null)?.sourceId ?? null,
    tagIds: [...new Set(matched.flatMap((rule) => rule.tagIds))],
    rules: matched,
  }
}
