import { csvEscape } from './leadCsv'
import type {
  Form,
  FormAnswer,
  FormField,
  FormFieldType,
  FormLeadMap,
  FormSettings,
  FormSubmission,
  PublicForm,
} from '../types/domain'

export const MAX_FORM_FIELDS = 40
export const MAX_FIELD_OPTIONS = 30

type FieldTypeInfo = {
  type: FormFieldType
  label: string
  hasOptions: boolean
  defaultLabel: string
}

export const formFieldTypes: FieldTypeInfo[] = [
  { type: 'short_text', label: 'Short text', hasOptions: false, defaultLabel: 'Short text' },
  { type: 'long_text', label: 'Long text', hasOptions: false, defaultLabel: 'Message' },
  { type: 'phone', label: 'Phone', hasOptions: false, defaultLabel: 'Phone' },
  { type: 'email', label: 'Email', hasOptions: false, defaultLabel: 'Email' },
  { type: 'number', label: 'Number', hasOptions: false, defaultLabel: 'Number' },
  { type: 'date', label: 'Date', hasOptions: false, defaultLabel: 'Date' },
  { type: 'dropdown', label: 'Dropdown', hasOptions: true, defaultLabel: 'Choose one' },
  { type: 'radio', label: 'Single choice', hasOptions: true, defaultLabel: 'Pick one' },
  { type: 'checkbox', label: 'Multiple choice', hasOptions: true, defaultLabel: 'Pick any' },
]

export function getFieldTypeInfo(type: FormFieldType) {
  return formFieldTypes.find((entry) => entry.type === type) ?? formFieldTypes[0]
}

export const formLeadMapOptions: { value: FormLeadMap; label: string }[] = [
  { value: 'parent_name', label: "Parent's name" },
  { value: 'phone', label: 'Phone' },
  { value: 'child_name', label: "Child's name" },
  { value: 'child_phone', label: "Child's phone" },
  { value: 'child_age', label: "Child's age" },
  { value: 'notes', label: 'Lead notes' },
]

// Names, phone and age only take the field type that makes sense for them;
// anything can go into the notes.
const leadMapFieldTypes: Record<FormLeadMap, FormFieldType[] | 'any'> = {
  parent_name: ['short_text'],
  phone: ['phone'],
  child_name: ['short_text'],
  child_phone: ['phone'],
  child_age: ['number'],
  notes: 'any',
}

export function getLeadMapOptionsFor(type: FormFieldType) {
  return formLeadMapOptions.filter((option) => {
    const allowed = leadMapFieldTypes[option.value]
    return allowed === 'any' || allowed.includes(type)
  })
}

export const MAX_CHILDREN = 3

const childMaps: FormLeadMap[] = ['child_name', 'child_age', 'child_phone']

export const defaultFormSettings: FormSettings = {
  submitLabel: 'Submit',
  afterSubmit: 'message',
  successMessage: 'Thank you! We have received your details and will contact you soon.',
  redirectUrl: '',
  createLead: true,
  allowMoreChildren: false,
}

// The questions that describe one child; an extra child repeats exactly these.
export function getChildFields(fields: FormField[]) {
  return fields.filter((field) => field.mapTo && childMaps.includes(field.mapTo))
}

// Answers for the 2nd and 3rd child are keyed "<field id>#2" / "#3".
export function childAnswerKey(fieldId: string, childNumber: number) {
  return childNumber > 1 ? `${fieldId}#${childNumber}` : fieldId
}

function randomId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function createField(type: FormFieldType): FormField {
  const info = getFieldTypeInfo(type)
  return {
    id: `f_${randomId()}`,
    type,
    label: info.defaultLabel,
    placeholder: '',
    required: false,
    options: info.hasOptions ? ['Option 1', 'Option 2'] : [],
    mapTo: null,
  }
}

// What a brand-new form starts with: enough to make a usable lead.
export function createStarterFields(): FormField[] {
  return [
    { ...createField('short_text'), label: "Parent's name", required: true, mapTo: 'parent_name' },
    { ...createField('short_text'), label: "Child's name", required: true, mapTo: 'child_name' },
    { ...createField('phone'), label: 'Phone number', required: true, mapTo: 'phone' },
    { ...createField('phone'), label: "Child's phone number", mapTo: 'child_phone' },
    { ...createField('number'), label: "Child's age", required: true, mapTo: 'child_age' },
  ]
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizeFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.flatMap((entry): FormField[] => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const item = entry as Record<string, unknown>
    const type = formFieldTypes.find((info) => info.type === item.type)?.type
    const id = asString(item.id)
    if (!type || !id) {
      return []
    }
    const mapTo = formLeadMapOptions.find((option) => option.value === item.mapTo)?.value ?? null

    return [
      {
        id,
        type,
        label: asString(item.label),
        placeholder: asString(item.placeholder),
        required: item.required === true,
        options: Array.isArray(item.options)
          ? item.options.filter((option): option is string => typeof option === 'string')
          : [],
        mapTo,
      },
    ]
  })
}

export function normalizeSettings(raw: unknown): FormSettings {
  const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    submitLabel: asString(item.submitLabel, defaultFormSettings.submitLabel) || defaultFormSettings.submitLabel,
    afterSubmit: item.afterSubmit === 'redirect' ? 'redirect' : 'message',
    successMessage: asString(item.successMessage, defaultFormSettings.successMessage),
    redirectUrl: asString(item.redirectUrl),
    createLead: item.createLead === undefined ? true : item.createLead === true,
    allowMoreChildren: item.allowMoreChildren === true,
  }
}

export function mapFormRow(row: {
  id: string
  name: string
  fields: unknown
  settings: unknown
  is_published: boolean
  slug: string | null
  view_count: number
  created_at: string
  updated_at: string
  updated_by_teacher_id: number | null
}): Form {
  return {
    id: row.id,
    name: row.name,
    fields: normalizeFields(row.fields),
    settings: normalizeSettings(row.settings),
    isPublished: row.is_published,
    slug: row.slug,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedByTeacherId: row.updated_by_teacher_id,
  }
}

export function mapPublicForm(raw: unknown): PublicForm | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const item = raw as Record<string, unknown>
  const id = asString(item.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: asString(item.name),
    fields: normalizeFields(item.fields),
    settings: normalizeSettings(item.settings),
  }
}

export function mapSubmissionRow(row: {
  id: number
  form_id: string
  answers: unknown
  lead_id: number | null
  lead_was_existing: boolean
  created_at: string
}): FormSubmission {
  const answers: FormAnswer[] = Array.isArray(row.answers)
    ? row.answers.flatMap((entry): FormAnswer[] => {
        if (typeof entry !== 'object' || entry === null) {
          return []
        }
        const item = entry as Record<string, unknown>
        return [{ id: asString(item.id), label: asString(item.label), value: asString(item.value) }]
      })
    : []

  return {
    id: row.id,
    formId: row.form_id,
    answers,
    leadId: row.lead_id,
    leadWasExisting: row.lead_was_existing,
    createdAt: row.created_at,
  }
}

export function insertField(fields: FormField[], field: FormField, index: number) {
  const next = [...fields]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, field)
  return next
}

// `to` is the slot to drop into, counted before the field is lifted out
// (0 = above the first field, fields.length = below the last one).
export function moveField(fields: FormField[], from: number, to: number) {
  if (from < 0 || from >= fields.length) {
    return fields
  }
  const target = to > from ? to - 1 : to
  if (target === from) {
    return fields
  }
  const next = [...fields]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

export function duplicateField(field: FormField): FormField {
  return { ...field, id: `f_${randomId()}`, label: `${field.label} copy`, mapTo: null }
}

// One problem at a time, in plain words; null means the form can be saved.
export function getFormProblem(
  name: string,
  fields: FormField[],
  settings: FormSettings = defaultFormSettings,
): string | null {
  if (!name.trim()) {
    return 'Give the form a name.'
  }
  if (fields.length === 0) {
    return 'Add at least one field.'
  }
  if (fields.length > MAX_FORM_FIELDS) {
    return `A form can have at most ${MAX_FORM_FIELDS} fields.`
  }
  if (settings.afterSubmit === 'redirect' && !isSafeRedirectUrl(settings.redirectUrl)) {
    return 'Enter the full web address to go to after sending, starting with https://.'
  }
  if (settings.allowMoreChildren && getChildFields(fields).length === 0) {
    return "Adding more children needs a field that fills the child's name, phone or age."
  }

  const mapped = new Set<FormLeadMap>()
  for (const field of fields) {
    if (!field.label.trim()) {
      return 'Every field needs a label.'
    }
    if (getFieldTypeInfo(field.type).hasOptions) {
      const options = field.options.map((option) => option.trim())
      if (options.length === 0 || options.some((option) => !option)) {
        return `"${field.label}" needs at least one option, and none of them empty.`
      }
      if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
        return `"${field.label}" has the same option twice.`
      }
    }
    if (field.mapTo && field.mapTo !== 'notes') {
      if (mapped.has(field.mapTo)) {
        const label = formLeadMapOptions.find((option) => option.value === field.mapTo)?.label
        return `Only one field can fill ${label} on the lead.`
      }
      mapped.add(field.mapTo)
    }
  }
  return null
}

export type FormAnswerValue = string | string[]

// Same rules as submit_form on the server, so the visitor sees problems
// before sending. The server stays the one that decides.
export function validateAnswers(fields: FormField[], answers: Record<string, FormAnswerValue>) {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const raw = answers[field.id]
    const value = (Array.isArray(raw) ? raw.join(', ') : (raw ?? '')).trim()

    if (!value) {
      if (field.required) {
        errors[field.id] = 'This field is required.'
      }
      continue
    }
    if (field.mapTo === 'child_age' && !(/^[0-9]{1,2}$/.test(value) && Number(value) >= 1)) {
      errors[field.id] = 'Enter a whole age from 1 to 99.'
    } else if (field.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      errors[field.id] = 'Enter a valid email.'
    } else if (field.type === 'phone' && !/^[0-9+()\-\s.]{6,30}$/.test(value)) {
      errors[field.id] = 'Enter a valid phone number.'
    } else if (field.type === 'number' && !/^-?[0-9]+(\.[0-9]+)?$/.test(value)) {
      errors[field.id] = 'Enter a number.'
    }
  }
  return errors
}

// `key` is the link name when the form has one, else its id; both work.
export function buildFormUrl(origin: string, key: string) {
  return `${origin}/?form=${key}`
}

export function isSafeRedirectUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 60

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Lower case words joined by single hyphens, as the database requires.
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

export function getSlugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Use ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} characters.`
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return 'Use only lower case letters, numbers and single hyphens.'
  }
  if (uuidShape.test(slug)) {
    return 'That looks like a form id. Pick a readable name.'
  }
  return null
}

// A name for a new form's link, with a short tail so two forms with the same
// name do not collide.
export function suggestSlug(name: string) {
  const tail = randomId().slice(0, 4)
  const base = slugify(name).slice(0, SLUG_MAX_LENGTH - 5)
  return base.length >= 2 ? `${base}-${tail}` : `form-${tail}`
}

export function formatConversionRate(submissions: number, views: number) {
  if (views <= 0) {
    return '-'
  }
  return `${Math.min(100, Math.round((submissions / views) * 100))}%`
}

// The iframe grows to fit the form: the public page reports its height.
export function buildEmbedCode(url: string, formId: string, name: string) {
  const frameId = `mirai-form-${formId}`
  const title = name.replace(/"/g, '&quot;')
  return [
    `<iframe id="${frameId}" src="${url}" title="${title}" style="width:100%;min-height:480px;border:0"></iframe>`,
    `<script>window.addEventListener("message",function(e){var d=e.data;if(d&&d.type==="mirai-form-height"&&d.formId==="${formId}"){document.getElementById("${frameId}").style.height=d.height+"px"}})</script>`,
  ].join('\n')
}

export function summarizeAnswers(submission: FormSubmission, limit = 3) {
  return submission.answers
    .filter((answer) => answer.value)
    .slice(0, limit)
    .map((answer) => answer.value)
    .join(' · ')
}

// Column labels come from the submissions themselves, so answers to fields
// that were renamed or removed since are still exported.
export function getSubmissionColumns(submissions: FormSubmission[]) {
  const columns = new Map<string, string>()
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      if (!columns.has(answer.id)) {
        columns.set(answer.id, answer.label)
      }
    }
  }
  return [...columns].map(([id, label]) => ({ id, label }))
}

// Answers come from the public, so keep a spreadsheet from running one that
// starts like a formula.
function csvCell(value: string) {
  return csvEscape(/^[=@\t\r]|^[+-][^0-9\s().+-]/.test(value) ? `'${value}` : value)
}

export function buildSubmissionsCsv(submissions: FormSubmission[], formNameById: Map<string, string>) {
  const columns = getSubmissionColumns(submissions)
  const header = ['Submitted', 'Form', ...columns.map((column) => column.label)]
  const rows = submissions.map((submission) => [
    submission.createdAt,
    formNameById.get(submission.formId) ?? '',
    ...columns.map(
      (column) => submission.answers.find((answer) => answer.id === column.id)?.value ?? '',
    ),
  ])
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(/(\d{4}),/, '$1')
}
