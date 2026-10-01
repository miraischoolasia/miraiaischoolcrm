import type {
  FormField,
  FormFieldType,
  FormPage,
  FormRule,
  FormRuleAction,
  FormRuleOp,
} from '../types/domain'

// Pages and skip logic. The same walk through the pages is done by
// form_visited_pages() in the database, so what the browser skips and what the
// server stops asking for always agree.

export const MAX_PAGES = 10
export const MAX_RULES_PER_PAGE = 10

type Answers = Record<string, string | string[]>
type EndAction = Extract<FormRuleAction, { type: 'end' }>

export type NextStep =
  | { kind: 'page'; index: number }
  // The rule ends the form here; `ending` says what the visitor sees.
  | { kind: 'end'; ending: EndAction }
  // The last page was reached the ordinary way.
  | { kind: 'submit' }

function randomId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function createPage(title = ''): FormPage {
  return { id: `page_${randomId()}`, title, description: '', rules: [] }
}

export function createRuleId() {
  return `rule_${randomId()}`
}

export function isWebAddress(value: string) {
  try {
    const { protocol } = new URL(value.trim())
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

const choiceTypes: FormFieldType[] = ['dropdown', 'radio', 'checkbox']

export function isChoiceField(field: Pick<FormField, 'type'>) {
  return choiceTypes.includes(field.type)
}

export const ruleOpLabels: Record<FormRuleOp, string> = {
  is: 'is',
  is_not: 'is not',
  includes: 'includes',
  excludes: 'does not include',
}

export function ruleOpsFor(type: FormFieldType): FormRuleOp[] {
  return type === 'checkbox' ? ['includes', 'excludes'] : ['is', 'is_not']
}

export function pageLabel(page: FormPage, index: number) {
  return page.title.trim() ? `Page ${index + 1}: ${page.title.trim()}` : `Page ${index + 1}`
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeAction(raw: unknown): FormRuleAction | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const item = raw as Record<string, unknown>
  if (item.type === 'page') {
    const pageId = asString(item.pageId)
    return pageId ? { type: 'page', pageId } : null
  }
  if (item.type === 'end') {
    const ending = item.ending === 'message' || item.ending === 'redirect' ? item.ending : 'default'
    return {
      type: 'end',
      ending,
      message: asString(item.message),
      redirectUrl: asString(item.redirectUrl),
    }
  }
  return null
}

function normalizeRule(raw: unknown): FormRule | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const item = raw as Record<string, unknown>
  const op = (['is', 'is_not', 'includes', 'excludes'] as const).find((entry) => entry === item.op)
  const action = normalizeAction(item.action)
  const fieldId = asString(item.fieldId)
  if (!op || !action || !fieldId) {
    return null
  }
  return {
    id: asString(item.id) || createRuleId(),
    fieldId,
    op,
    value: asString(item.value),
    action,
  }
}

// Reads the saved pages. A form saved before pages existed has none, and gets
// one page holding everything.
export function normalizePages(raw: unknown): FormPage[] {
  const pages = Array.isArray(raw)
    ? raw.flatMap((entry): FormPage[] => {
        if (typeof entry !== 'object' || entry === null) {
          return []
        }
        const item = entry as Record<string, unknown>
        const id = asString(item.id)
        if (!id) {
          return []
        }
        return [
          {
            id,
            title: asString(item.title),
            description: asString(item.description),
            rules: Array.isArray(item.rules)
              ? item.rules.flatMap((rule) => normalizeRule(rule) ?? [])
              : [],
          },
        ]
      })
    : []

  return pages.length > 0 ? pages : [{ id: 'page-1', title: '', description: '', rules: [] }]
}

export function getPageFields(fields: FormField[], pageId: string) {
  return fields.filter((field) => field.pageId === pageId)
}

// The flat field list keeps every page's fields together, in page order.
export function replacePageFields(
  fields: FormField[],
  pages: FormPage[],
  pageId: string,
  next: FormField[],
) {
  return pages.flatMap((page) => (page.id === pageId ? next : getPageFields(fields, page.id)))
}

export function orderFieldsByPages(fields: FormField[], pages: FormPage[]) {
  return pages.flatMap((page) => getPageFields(fields, page.id))
}

export function ruleMatches(rule: FormRule, answers: Answers) {
  const answer = answers[rule.fieldId]
  const equal = typeof answer === 'string' && answer === rule.value
  const has = Array.isArray(answer) && answer.includes(rule.value)

  switch (rule.op) {
    case 'is':
      return equal
    case 'is_not':
      return !equal
    case 'includes':
      return has
    case 'excludes':
      return !has
    default:
      return false
  }
}

// Where the visitor goes from page `index`, given what they have answered.
export function getNextStep(pages: FormPage[], index: number, answers: Answers): NextStep {
  for (const rule of pages[index]?.rules ?? []) {
    if (!ruleMatches(rule, answers)) {
      continue
    }
    if (rule.action.type === 'end') {
      return { kind: 'end', ending: rule.action }
    }
    const { pageId } = rule.action
    const target = pages.findIndex((page) => page.id === pageId)
    // Only forward: a jump to this page or an earlier one is ignored.
    if (target > index) {
      return { kind: 'page', index: target }
    }
  }
  return index + 1 < pages.length ? { kind: 'page', index: index + 1 } : { kind: 'submit' }
}

// The pages the visitor goes through with these answers, and the ending a
// rule gave them (null for the form's usual one).
export function computeRoute(pages: FormPage[], answers: Answers) {
  const visited: string[] = []
  let ending: EndAction | null = null
  let index = 0

  while (index < pages.length) {
    visited.push(pages[index].id)
    const step = getNextStep(pages, index, answers)
    if (step.kind === 'page') {
      index = step.index
      continue
    }
    if (step.kind === 'end') {
      ending = step.ending.ending === 'default' ? null : step.ending
    }
    break
  }
  return { visited, ending }
}

// Only answers to questions on pages the visitor went through are sent. Answers
// for an extra child are keyed "<field id>#2", so the id is the part before "#".
export function filterAnswersToPages(
  fields: FormField[],
  visitedPageIds: string[],
  answers: Answers,
) {
  const keep = new Set(
    fields.filter((field) => visitedPageIds.includes(field.pageId)).map((field) => field.id),
  )
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => keep.has(key.split('#')[0])),
  )
}

// The choice questions a rule on this page can look at: the ones on this
// page and on the pages before it.
export function getRuleFieldChoices(pages: FormPage[], fields: FormField[], pageIndex: number) {
  const ids = new Set(pages.slice(0, pageIndex + 1).map((page) => page.id))
  return fields.filter((field) => ids.has(field.pageId) && isChoiceField(field))
}

export function createRule(
  pages: FormPage[],
  fields: FormField[],
  pageIndex: number,
): FormRule | null {
  const field = getRuleFieldChoices(pages, fields, pageIndex)[0]
  if (!field) {
    return null
  }
  const later = pages[pageIndex + 1]
  return {
    id: createRuleId(),
    fieldId: field.id,
    op: ruleOpsFor(field.type)[0],
    value: field.options[0] ?? '',
    action: later
      ? { type: 'page', pageId: later.id }
      : { type: 'end', ending: 'default', message: '', redirectUrl: '' },
  }
}

// Drops rules that can no longer work after a page, a field or an option was
// removed or moved, so the admin is not left with rules that silently do
// nothing. (A rule that still reads fine but jumps nowhere is reported when the
// form is saved instead, so it is never removed behind the admin's back.)
export function removeRulesForPage(pages: FormPage[], pageId: string): FormPage[] {
  return pages
    .filter((page) => page.id !== pageId)
    .map((page) => ({
      ...page,
      rules: page.rules.filter(
        (rule) => !(rule.action.type === 'page' && rule.action.pageId === pageId),
      ),
    }))
}

export function removeRulesForField(pages: FormPage[], fieldId: string): FormPage[] {
  return pages.map((page) => ({
    ...page,
    rules: page.rules.filter((rule) => rule.fieldId !== fieldId),
  }))
}

// One problem at a time, in plain words; null means the pages are fine.
export function getPagesProblem(pages: FormPage[], fields: FormField[]): string | null {
  if (pages.length > MAX_PAGES) {
    return `A form can have at most ${MAX_PAGES} pages.`
  }

  for (const [index, page] of pages.entries()) {
    const label = pageLabel(page, index)
    if (getPageFields(fields, page.id).length === 0) {
      return `${label} has no fields. Add one, or delete the page.`
    }
    if (page.rules.length > MAX_RULES_PER_PAGE) {
      return `${label} can have at most ${MAX_RULES_PER_PAGE} rules.`
    }

    for (const rule of page.rules) {
      const field = getRuleFieldChoices(pages, fields, index).find((entry) => entry.id === rule.fieldId)
      if (!field) {
        return `A rule on ${label} reads a question that is gone or comes later. Pick another question.`
      }
      if (!ruleOpsFor(field.type).includes(rule.op)) {
        return `A rule on ${label} does not fit the kind of question "${field.label}".`
      }
      if (!field.options.includes(rule.value)) {
        return `A rule on ${label} reads an option of "${field.label}" that no longer exists.`
      }
      if (rule.action.type === 'page') {
        const { pageId } = rule.action
        const target = pages.findIndex((entry) => entry.id === pageId)
        if (target <= index) {
          return `A rule on ${label} must jump to a later page.`
        }
      } else if (rule.action.ending === 'redirect' && !isWebAddress(rule.action.redirectUrl)) {
        return `A rule on ${label} ends the form with a web address, but the address is not a full one starting with https://.`
      }
    }
  }
  return null
}
