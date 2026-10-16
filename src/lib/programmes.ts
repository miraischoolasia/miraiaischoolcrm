import { supabase } from './supabase'

// The courses a school signs parents up for, made by the school itself (Settings: Programmes). A programme
// has its own steps, the message it writes to a parent, and what picking a class does. Mirai's two own
// courses (HOA, Holiday Camp) are built-in programmes that keep the screens they always had.

export const MAX_NAME = 80
export const MAX_CATEGORY = 40
export const MAX_MESSAGE = 4000
export const MAX_PROGRAMMES = 30
export const MAX_STEPS = 12

export type ProgrammeOutcome = 'booking' | 'enrol'
export type StepKind = 'form' | 'class' | 'receipt' | 'zoom' | 'custom'

export type ProgrammeStep = {
  id: number
  programmeId: number
  sortOrder: number
  kind: StepKind
  title: string
}

export type Programme = {
  id: number
  name: string
  // 'hoa' or 'camp' for Mirai's own two courses; null for a programme the school made.
  legacyKey: 'hoa' | 'camp' | null
  outcome: ProgrammeOutcome
  messageTemplate: string
  isActive: boolean
  sortOrder: number
  // The group the school put it in ("Form 1", "Products"); null when it has none.
  category?: string | null
  steps: ProgrammeStep[]
}

export const STEP_KINDS: { kind: StepKind; label: string; hint: string; defaultTitle: string }[] = [
  {
    kind: 'form',
    label: 'Registration form',
    hint: 'Send a form from the Forms page; the answers show here when it is filled in.',
    defaultTitle: 'Registration form',
  },
  {
    kind: 'class',
    label: 'Pick a class',
    hint: 'Choose one of the classes that belong to this programme.',
    defaultTitle: 'Pick a class',
  },
  {
    kind: 'receipt',
    label: 'Payment receipt',
    hint: 'Keep the payment receipt (a photo or PDF) with the lead.',
    defaultTitle: 'Payment receipt',
  },
  {
    kind: 'zoom',
    label: 'Zoom meeting',
    hint: 'Pick one of the Zoom times on the calendar, or type one.',
    defaultTitle: 'Zoom with the parent',
  },
  {
    kind: 'custom',
    label: 'Your own step',
    hint: 'A name, a tick when it is done, and a note and date.',
    defaultTitle: '',
  },
]

export function stepKindLabel(kind: StepKind) {
  return STEP_KINDS.find((entry) => entry.kind === kind)?.label ?? kind
}

// What a new programme starts with; the school removes what it does not need.
export const DEFAULT_STEPS: { kind: StepKind; title: string }[] = [
  { kind: 'form', title: 'Registration form' },
  { kind: 'class', title: 'Pick a class' },
  { kind: 'receipt', title: 'Payment receipt' },
]

// The words a message template can use, filled in from what is saved on the lead.
export const TEMPLATE_PLACEHOLDERS: { token: string; label: string; sample: string }[] = [
  { token: '{child}', label: "Child's name", sample: 'Ethan' },
  { token: '{class_time}', label: 'Class time', sample: 'Sat 18 Oct, 10:00 to 12:00' },
  { token: '{zoom_time}', label: 'Zoom time', sample: 'Fri 16 Oct, 20:30' },
  { token: '{zoom_link}', label: 'Zoom link', sample: 'https://zoom.us/j/123' },
  { token: '{form_link}', label: 'Form link', sample: 'https://crm.example.com/?form=register' },
]

export const DEFAULT_MESSAGE_TEMPLATE = [
  '你好，谢谢您！',
  '',
  '{child} 的课程已经安排在 {class_time}。',
  '',
  'Zoom 时间：{zoom_time}',
  'Zoom 链接：{zoom_link}',
  '',
  '麻烦您先填写这份报名表：',
  '{form_link}',
].join('\n')

// A template with its placeholders filled in. A placeholder with nothing saved yet leaves its whole line
// out, so the parent never reads "Zoom 链接：" followed by nothing.
export function fillTemplate(template: string, values: Partial<Record<string, string | null | undefined>>) {
  const lines = template.split('\n')
  const filled: string[] = []
  for (const line of lines) {
    const tokens = line.match(/\{[a-z_]+\}/g) ?? []
    if (tokens.length === 0) {
      filled.push(line)
      continue
    }
    const known = tokens.filter((token) => TEMPLATE_PLACEHOLDERS.some((entry) => entry.token === token))
    if (known.some((token) => !values[token.slice(1, -1)]?.trim())) {
      continue
    }
    filled.push(line.replace(/\{([a-z_]+)\}/g, (whole, key: string) => values[key]?.trim() ?? whole))
  }
  // A line left out can leave two blank lines in a row; keep one.
  return filled
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sampleValues() {
  return Object.fromEntries(TEMPLATE_PLACEHOLDERS.map((entry) => [entry.token.slice(1, -1), entry.sample]))
}

// Placeholders in a template that this system does not know ({kid} instead of {child}).
export function unknownPlaceholders(template: string) {
  const found = template.match(/\{[a-z_]+\}/g) ?? []
  return [...new Set(found.filter((token) => !TEMPLATE_PLACEHOLDERS.some((entry) => entry.token === token)))]
}

export type ProgrammeDraft = {
  name: string
  outcome: ProgrammeOutcome
  messageTemplate: string
  isActive: boolean
  // '' = no category.
  category: string
}

// Why a programme cannot be saved yet, or null when it can.
export function validateProgramme(draft: Pick<ProgrammeDraft, 'name' | 'messageTemplate'> & { category?: string }): string | null {
  const name = draft.name.trim()
  if ((draft.category ?? '').trim().length > MAX_CATEGORY) {
    return `The category can be up to ${MAX_CATEGORY} characters.`
  }
  if (name === '') {
    return 'Give the programme a name.'
  }
  if (name.length > MAX_NAME) {
    return `The name can be up to ${MAX_NAME} characters.`
  }
  if (draft.messageTemplate.length > MAX_MESSAGE) {
    return `The message can be up to ${MAX_MESSAGE.toLocaleString('en-US')} characters.`
  }
  const unknown = unknownPlaceholders(draft.messageTemplate)
  if (unknown.length > 0) {
    return `${unknown.join(', ')} is not a word the message knows. Use the buttons under the message.`
  }
  return null
}

// Why a step cannot be added or renamed, or null when it can.
export function validateStepTitle(title: string): string | null {
  const text = title.trim()
  if (text === '') {
    return 'Give the step a name.'
  }
  if (text.length > MAX_NAME) {
    return `The name can be up to ${MAX_NAME} characters.`
  }
  return null
}

// The programmes a team can sign a lead up for: those that are on, in order.
export function activeProgrammes(programmes: Programme[]) {
  return programmes.filter((programme) => programme.isActive)
}

export const NO_CATEGORY = 'Other'

type Categorised = { name: string; category?: string | null }

export type ProgrammeGroup<T extends Categorised = Programme> = { category: string | null; label: string; programmes: T[] }

function sameCategory(a: string | null, b: string | null) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

// The categories in use, as the school wrote them, for the suggestions when a category is typed.
export function categoriesOf(programmes: Programme[]) {
  const found: string[] = []
  for (const programme of programmes) {
    const category = programme.category?.trim()
    if (category && !found.some((entry) => sameCategory(entry, category))) {
      found.push(category)
    }
  }
  return found.sort((a, b) => a.localeCompare(b))
}

// The programmes whose name or category has the words typed (every word must be in one of them).
export function searchProgrammes<T extends Categorised>(programmes: T[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return programmes
  }
  return programmes.filter((programme) => {
    const text = `${programme.name} ${programme.category ?? ''}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

// Programmes grouped by category, in the order the school put them (a group sits where its first programme is);
// the ones with no category come last under "Other". A school with no category at all gets one plain group.
export function groupProgrammes<T extends Categorised>(programmes: T[]): ProgrammeGroup<T>[] {
  const groups: ProgrammeGroup<T>[] = []
  for (const programme of programmes) {
    const category = programme.category?.trim() || null
    const found = groups.find((group) => sameCategory(group.category, category))
    if (found) {
      found.programmes.push(programme)
    } else {
      groups.push({ category, label: category ?? NO_CATEGORY, programmes: [programme] })
    }
  }
  if (groups.length === 1 && groups[0].category === null) {
    return [{ ...groups[0], label: '' }]
  }
  return [...groups.filter((group) => group.category !== null), ...groups.filter((group) => group.category === null)]
}

type StepRow = { id: number; programme_id: number; sort_order: number; kind: StepKind; title: string }
type ProgrammeRow = {
  id: number
  name: string
  legacy_key: 'hoa' | 'camp' | null
  outcome: ProgrammeOutcome
  message_template: string
  is_active: boolean
  sort_order: number
  // Missing before the database has the category column.
  category?: string | null
}

const PROGRAMME_COLUMNS_BASE = 'id, name, legacy_key, outcome, message_template, is_active, sort_order'
const PROGRAMME_COLUMNS = `${PROGRAMME_COLUMNS_BASE}, category`
const STEP_COLUMNS = 'id, programme_id, sort_order, kind, title'

function stepOf(row: StepRow): ProgrammeStep {
  return { id: row.id, programmeId: row.programme_id, sortOrder: row.sort_order, kind: row.kind, title: row.title }
}

export function programmeOf(row: ProgrammeRow, steps: ProgrammeStep[]): Programme {
  return {
    id: row.id,
    name: row.name,
    legacyKey: row.legacy_key,
    outcome: row.outcome,
    messageTemplate: row.message_template,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    category: row.category?.trim() || null,
    steps: steps.filter((step) => step.programmeId === row.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

// Sentence for a person when the database says no (or has no such table yet).
export function programmeErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/programmes|programme_steps|reorder_programme/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Programmes are not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change the programmes.'
  }
  return fallback
}

export async function fetchProgrammes(): Promise<Programme[]> {
  const client = requireSupabase()
  const readProgrammes = (columns: string) =>
    client.from('programmes').select(columns).order('sort_order', { ascending: true }).order('id', { ascending: true })
  let [programmes, steps] = await Promise.all([
    readProgrammes(PROGRAMME_COLUMNS),
    client.from('programme_steps').select(STEP_COLUMNS).order('sort_order', { ascending: true }).order('id', { ascending: true }),
  ])
  if (programmes.error && /category/.test(programmes.error.message ?? '')) {
    // A database without the category column yet: the programmes still load, without categories.
    programmes = await readProgrammes(PROGRAMME_COLUMNS_BASE)
  }
  if (programmes.error) {
    throw programmes.error
  }
  if (steps.error) {
    throw steps.error
  }
  const allSteps = (steps.data ?? []).map((row) => stepOf(row as StepRow))
  return (programmes.data ?? []).map((row) => programmeOf(row as unknown as ProgrammeRow, allSteps))
}

// A new programme, with the steps most schools start with. Resolves to the programme as saved.
export async function addProgramme(name: string, sortOrder: number): Promise<Programme> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('programmes')
    .insert({ name: name.trim(), sort_order: sortOrder })
    .select(PROGRAMME_COLUMNS)
    .single()
  if (error) {
    throw error
  }
  const row = data as unknown as ProgrammeRow
  const { data: stepRows, error: stepError } = await client
    .from('programme_steps')
    .insert(DEFAULT_STEPS.map((step, index) => ({ programme_id: row.id, kind: step.kind, title: step.title, sort_order: (index + 1) * 10 })))
    .select(STEP_COLUMNS)
  if (stepError) {
    throw stepError
  }
  return programmeOf(row, (stepRows ?? []).map((entry) => stepOf(entry as StepRow)))
}

export async function saveProgramme(id: number, draft: ProgrammeDraft): Promise<void> {
  const client = requireSupabase()
  const fields = {
    name: draft.name.trim(),
    outcome: draft.outcome,
    message_template: draft.messageTemplate,
    is_active: draft.isActive,
  }
  let { data, error } = await client
    .from('programmes')
    .update({ ...fields, category: draft.category.trim() || null })
    .eq('id', id)
    .select('id')
  if (error && /category/.test(error.message ?? '') && draft.category.trim() === '') {
    // A database without the category column yet: saving with no category still works.
    ;({ data, error } = await client.from('programmes').update(fields).eq('id', id).select('id'))
  }
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    // The database hides a row you may not change instead of failing.
    throw new Error('Only an admin can change the programmes.')
  }
}

export async function deleteProgramme(id: number): Promise<void> {
  const { data, error } = await requireSupabase().from('programmes').delete().eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the programmes.')
  }
}

export async function reorderProgrammes(ids: number[]): Promise<void> {
  const { error } = await requireSupabase().rpc('reorder_programmes', { p_ids: ids })
  if (error) {
    throw error
  }
}

export async function addStep(programmeId: number, kind: StepKind, title: string, sortOrder: number): Promise<ProgrammeStep> {
  const { data, error } = await requireSupabase()
    .from('programme_steps')
    .insert({ programme_id: programmeId, kind, title: title.trim(), sort_order: sortOrder })
    .select(STEP_COLUMNS)
    .single()
  if (error) {
    throw error
  }
  return stepOf(data as StepRow)
}

export async function renameStep(id: number, title: string): Promise<void> {
  const { data, error } = await requireSupabase().from('programme_steps').update({ title: title.trim() }).eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the programmes.')
  }
}

export async function deleteStep(id: number): Promise<void> {
  const { data, error } = await requireSupabase().from('programme_steps').delete().eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the programmes.')
  }
}

export async function reorderSteps(programmeId: number, ids: number[]): Promise<void> {
  const { error } = await requireSupabase().rpc('reorder_programme_steps', { p_programme_id: programmeId, p_ids: ids })
  if (error) {
    throw error
  }
}
