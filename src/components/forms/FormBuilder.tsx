import { useMemo, useState, type DragEvent } from 'react'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Copy,
  DotsSixVertical,
  Plus,
  ShareNetwork,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import { FormFieldInput } from './FormFieldInput'
import { useConfirm } from '../../hooks/useConfirm'
import { cn } from '../../lib/cn'
import { getErrorMessage } from '../../lib/errors'
import {
  IMAGE_TYPES,
  MAX_FIELD_OPTIONS,
  MAX_FORM_FIELDS,
  createField,
  duplicateField,
  formFieldTypes,
  getFieldTypeInfo,
  getFormProblem,
  getImageFileProblem,
  getLeadMapOptionsFor,
  insertField,
  moveField,
} from '../../lib/forms'
import type { Form, FormField, FormFieldType, FormSettings } from '../../types/domain'

export type FormChanges = {
  name: string
  fields: FormField[]
  settings: FormSettings
  isPublished: boolean
}

type FormBuilderProps = {
  form: Form
  isSaving: boolean
  onSave: (changes: FormChanges) => Promise<boolean>
  // Stores a picture for an image field and resolves to its web address.
  onUploadImage: (file: File) => Promise<string>
  onBack: () => void
  onOpenEmbed: () => void
}

type DragSource = { kind: 'new'; type: FormFieldType } | { kind: 'move'; index: number }

const panelInputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none'

function snapshot(changes: FormChanges) {
  return JSON.stringify(changes)
}

// Drag question types from the left onto the form (or click them), drag the
// questions to reorder, and set each one's options on the right.
export function FormBuilder({
  form,
  isSaving,
  onSave,
  onUploadImage,
  onBack,
  onOpenEmbed,
}: FormBuilderProps) {
  const [name, setName] = useState(form.name)
  const [fields, setFields] = useState(form.fields)
  const [settings, setSettings] = useState(form.settings)
  const [isPublished, setIsPublished] = useState(form.isPublished)
  const [selectedId, setSelectedId] = useState<string | null>(form.fields[0]?.id ?? null)
  const [drag, setDrag] = useState<DragSource | null>(null)
  const [dropSlot, setDropSlot] = useState<number | null>(null)
  const [raised, setRaised] = useState<{ text: string; at: string } | null>(null)
  const [baseline, setBaseline] = useState(() =>
    snapshot({
      name: form.name,
      fields: form.fields,
      settings: form.settings,
      isPublished: form.isPublished,
    }),
  )
  const { confirm, dialog } = useConfirm()

  const changes: FormChanges = { name, fields, settings, isPublished }
  const isDirty = snapshot(changes) !== baseline
  const problem = raised && raised.at === snapshot(changes) ? raised.text : null
  const selectedIndex = fields.findIndex((field) => field.id === selectedId)
  const selected = selectedIndex >= 0 ? fields[selectedIndex] : null
  const usedMaps = useMemo(
    () => new Set(fields.map((field) => field.mapTo).filter((map) => map && map !== 'notes')),
    [fields],
  )

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)))
  }

  function addField(type: FormFieldType, index = fields.length) {
    if (fields.length >= MAX_FORM_FIELDS) {
      setRaised({ text: `A form can have at most ${MAX_FORM_FIELDS} fields.`, at: snapshot(changes) })
      return
    }
    const field = createField(type)
    setFields((current) => insertField(current, field, index))
    setSelectedId(field.id)
  }

  function removeSelected() {
    if (!selected) {
      return
    }
    const next = fields.filter((field) => field.id !== selected.id)
    setFields(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null)
  }

  function endDrag() {
    setDrag(null)
    setDropSlot(null)
  }

  function handleCardDragOver(event: DragEvent<HTMLElement>, index: number) {
    if (!drag) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setDropSlot(event.clientY < rect.top + rect.height / 2 ? index : index + 1)
  }

  function handleCanvasDragOver(event: DragEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (drag && (target === event.currentTarget || target.dataset.dropArea)) {
      event.preventDefault()
      setDropSlot(fields.length)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    if (drag && dropSlot !== null) {
      if (drag.kind === 'new') {
        addField(drag.type, dropSlot)
      } else {
        setFields((current) => moveField(current, drag.index, dropSlot))
      }
    }
    endDrag()
  }

  async function handleSave() {
    const found = getFormProblem(name, fields, settings)
    setRaised(found ? { text: found, at: snapshot(changes) } : null)
    if (found) {
      return
    }
    const trimmed: FormChanges = { ...changes, name: name.trim() }
    if (await onSave(trimmed)) {
      setBaseline(snapshot({ ...trimmed, name }))
    }
  }

  async function handleBack() {
    if (isDirty && !(await confirm('You have unsaved changes. Leave without saving?'))) {
      return
    }
    onBack()
  }

  return (
    <section className="space-y-4">
      {dialog}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => void handleBack()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          All forms
        </button>
        <input
          type="text"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          aria-label="Form name"
          className="min-w-[12rem] flex-1 rounded-xl border border-transparent px-3 py-2 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-[#fc0c97] focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4 accent-[#fc0c97]"
          />
          Published
        </label>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Form settings
        </button>
        <button
          type="button"
          onClick={onOpenEmbed}
          disabled={isDirty}
          title={isDirty ? 'Save first' : undefined}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShareNetwork size={16} aria-hidden="true" />
          Embed
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || !isDirty}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
        </button>
        {problem && (
          <p role="alert" className="w-full rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
            {problem}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Add a field</h2>
          <p className="mt-1 text-xs text-slate-500">Click one, or drag it onto the form.</p>
          <ul className="mt-3 space-y-1.5">
            {formFieldTypes.map((info) => (
              <li key={info.type}>
                <button
                  type="button"
                  draggable
                  onClick={() => addField(info.type)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy'
                    event.dataTransfer.setData('text/plain', info.type)
                    setDrag({ kind: 'new', type: info.type })
                  }}
                  onDragEnd={endDrag}
                  className="flex w-full cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-[#fc0c97] hover:bg-[#fff0f9] active:cursor-grabbing"
                >
                  <Plus size={14} aria-hidden="true" className="text-[#be185d]" />
                  {info.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div
          className="min-h-[24rem] rounded-2xl border border-slate-200 bg-slate-50 p-4"
          onDragOver={handleCanvasDragOver}
          onDrop={handleDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropSlot(null)
            }
          }}
        >
          <div data-drop-area="true" className="mx-auto max-w-xl space-y-2">
            {fields.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                Drag a field here, or click one on the left.
              </p>
            )}
            {fields.map((field, index) => (
              <div key={field.id}>
                {dropSlot === index && <DropBar />}
                <div
                  role="group"
                  aria-label={`Field: ${field.label}`}
                  tabIndex={0}
                  draggable
                  onClick={() => setSelectedId(field.id)}
                  onFocus={() => setSelectedId(field.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', field.id)
                    setDrag({ kind: 'move', index })
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(event) => handleCardDragOver(event, index)}
                  className={cn(
                    'flex gap-2 rounded-xl border bg-white p-3 transition',
                    field.id === selectedId
                      ? 'border-[#fc0c97] shadow-[0_0_0_3px_rgba(252,12,151,0.12)]'
                      : 'border-slate-200 hover:border-slate-300',
                    drag?.kind === 'move' && drag.index === index && 'opacity-40',
                  )}
                >
                  <DotsSixVertical
                    size={18}
                    className="mt-1 shrink-0 cursor-grab text-slate-400"
                    aria-hidden="true"
                  />
                  <div className="pointer-events-none min-w-0 flex-1">
                    <FormFieldInput field={field} value={field.type === 'checkbox' ? [] : ''} disabled onChange={() => {}} />
                  </div>
                </div>
              </div>
            ))}
            {dropSlot === fields.length && fields.length > 0 && <DropBar />}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          {selected ? (
            <FieldProperties
              field={selected}
              index={selectedIndex}
              count={fields.length}
              showLeadMap={settings.createLead}
              usedMaps={usedMaps}
              onUploadImage={onUploadImage}
              onChange={(patch) => updateField(selected.id, patch)}
              onMove={(direction) =>
                setFields((current) =>
                  moveField(current, selectedIndex, direction === 'up' ? selectedIndex - 1 : selectedIndex + 2),
                )
              }
              onDuplicate={() => {
                const copy = duplicateField(selected)
                setFields((current) => insertField(current, copy, selectedIndex + 1))
                setSelectedId(copy.id)
              }}
              onDelete={removeSelected}
            />
          ) : (
            <FormSettingsPanel settings={settings} onChange={setSettings} />
          )}
        </aside>
      </div>
    </section>
  )
}

function DropBar() {
  return <div className="my-1 h-1 rounded-full bg-[#fc0c97]" aria-hidden="true" />
}

function FormSettingsPanel({
  settings,
  onChange,
}: {
  settings: FormSettings
  onChange: (settings: FormSettings) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">Form settings</h2>
      <label className="block text-sm font-medium text-slate-700">
        Submit button text
        <input
          type="text"
          value={settings.submitLabel}
          maxLength={40}
          onChange={(event) => onChange({ ...settings, submitLabel: event.target.value })}
          className={cn(panelInputClass, 'mt-1')}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">After sending</legend>
        {(
          [
            { value: 'message', label: 'Show a message' },
            { value: 'redirect', label: 'Go to a web address' },
          ] as const
        ).map((choice) => (
          <label key={choice.value} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="after-submit"
              checked={settings.afterSubmit === choice.value}
              onChange={() => onChange({ ...settings, afterSubmit: choice.value })}
              className="h-4 w-4 accent-[#fc0c97]"
            />
            {choice.label}
          </label>
        ))}
        {settings.afterSubmit === 'message' ? (
          <textarea
            rows={3}
            value={settings.successMessage}
            maxLength={300}
            aria-label="Message after sending"
            onChange={(event) => onChange({ ...settings, successMessage: event.target.value })}
            className={panelInputClass}
          />
        ) : (
          <div>
            <input
              type="url"
              value={settings.redirectUrl}
              maxLength={500}
              placeholder="https://yourwebsite.com/thank-you"
              aria-label="Web address to go to"
              onChange={(event) => onChange({ ...settings, redirectUrl: event.target.value })}
              className={panelInputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              The form is saved first, then the visitor is taken here. When the form is embedded,
              only the form box changes.
            </p>
          </div>
        )}
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.allowMoreChildren}
          onChange={(event) => onChange({ ...settings, allowMoreChildren: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
        />
        <span>
          <span className="font-medium">Let visitors add another child</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Repeats the child name, phone and age questions, up to 3 children.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={settings.createLead}
          onChange={(event) => onChange({ ...settings, createLead: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
        />
        <span>
          <span className="font-medium">Create a lead for each submission</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            The lead appears in Leads with the source "Form: name". Choose which lead
            column each field fills in the field's settings.
          </span>
        </span>
      </label>
    </div>
  )
}

function FieldProperties({
  field,
  index,
  count,
  showLeadMap,
  usedMaps,
  onUploadImage,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  field: FormField
  index: number
  count: number
  showLeadMap: boolean
  usedMaps: Set<FormField['mapTo']>
  onUploadImage: (file: File) => Promise<string>
  onChange: (patch: Partial<FormField>) => void
  onMove: (direction: 'up' | 'down') => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const info = getFieldTypeInfo(field.type)
  const mapOptions = getLeadMapOptionsFor(field.type)
  const isImage = field.type === 'image'
  const iconButton =
    'rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

  function setOption(optionIndex: number, value: string) {
    onChange({ options: field.options.map((option, i) => (i === optionIndex ? value : option)) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{info.label}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="Move field up" disabled={index === 0} onClick={() => onMove('up')} className={iconButton}>
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Move field down" disabled={index === count - 1} onClick={() => onMove('down')} className={iconButton}>
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Duplicate field" onClick={onDuplicate} className={iconButton}>
            <Copy size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Delete field"
            onClick={onDelete}
            className="rounded-lg border border-red-200 p-2 text-red-700 transition hover:bg-red-50"
          >
            <Trash size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        {isImage ? 'Image description' : 'Label'}
        <input
          type="text"
          value={field.label}
          maxLength={120}
          onChange={(event) => onChange({ label: event.target.value })}
          className={cn(panelInputClass, 'mt-1')}
        />
        {isImage && (
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Read aloud to people who cannot see the picture. Not shown on the form.
          </span>
        )}
      </label>

      {isImage && (
        <ImageFieldControls
          imageUrl={field.imageUrl}
          onUpload={onUploadImage}
          onChange={(imageUrl) => onChange({ imageUrl })}
        />
      )}

      {!isImage && (!info.hasOptions || field.type === 'dropdown') ? (
        field.type !== 'date' && (
          <label className="block text-sm font-medium text-slate-700">
            {field.type === 'dropdown' ? 'Empty choice text' : 'Placeholder'}
            <input
              type="text"
              value={field.placeholder}
              maxLength={120}
              onChange={(event) => onChange({ placeholder: event.target.value })}
              className={cn(panelInputClass, 'mt-1')}
            />
          </label>
        )
      ) : null}

      {!isImage && (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
            className="h-4 w-4 accent-[#fc0c97]"
          />
          Required
        </label>
      )}

      {info.hasOptions && (
        <div>
          <div className="text-sm font-medium text-slate-700">Options</div>
          <ul className="mt-1.5 space-y-1.5">
            {field.options.map((option, optionIndex) => (
              <li key={optionIndex} className="flex gap-1.5">
                <input
                  type="text"
                  value={option}
                  maxLength={80}
                  aria-label={`Option ${optionIndex + 1}`}
                  onChange={(event) => setOption(optionIndex, event.target.value)}
                  className={panelInputClass}
                />
                <button
                  type="button"
                  aria-label={`Remove option ${optionIndex + 1}`}
                  disabled={field.options.length <= 1}
                  onClick={() => onChange({ options: field.options.filter((_, i) => i !== optionIndex) })}
                  className={iconButton}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={field.options.length >= MAX_FIELD_OPTIONS}
            onClick={() => onChange({ options: [...field.options, `Option ${field.options.length + 1}`] })}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#be185d] hover:text-[#9d174d] disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add option
          </button>
        </div>
      )}

      {showLeadMap && !isImage && (
        <label className="block text-sm font-medium text-slate-700">
          Fills on the lead
          <select
            value={field.mapTo ?? ''}
            onChange={(event) =>
              onChange({ mapTo: (event.target.value || null) as FormField['mapTo'] })
            }
            className={cn(panelInputClass, 'mt-1')}
          >
            <option value="">Not used</option>
            {mapOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.value !== 'notes' && option.value !== field.mapTo && usedMaps.has(option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function ImageFieldControls({
  imageUrl,
  onUpload,
  onChange,
}: {
  imageUrl: string
  onUpload: (file: File) => Promise<string>
  onChange: (imageUrl: string) => void
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) {
      return
    }
    const problem = getImageFileProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      onChange(await onUpload(file))
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, 'Could not upload the image. Please try again.'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white transition focus-within:ring-2 focus-within:ring-[#fc0c97]/40 hover:bg-[#de0a84]',
            isUploading && 'pointer-events-none opacity-60',
          )}
        >
          <UploadSimple size={16} aria-hidden="true" />
          {isUploading ? 'Uploading...' : imageUrl ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept={IMAGE_TYPES.join(',')}
            disabled={isUploading}
            aria-label="Choose image file"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => onChange('')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Remove image
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">PNG, JPG, WebP or GIF, up to 5 MB.</p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
