import { isSafeRedirectUrl, type FormAnswerValue } from '../../lib/forms'
import { cn } from '../../lib/cn'
import { RichText } from './RichText'
import type { FormField } from '../../types/domain'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none focus:ring-2 focus:ring-[#fc0c97]/15 disabled:bg-slate-50'

type FormFieldInputProps = {
  field: FormField
  value: FormAnswerValue
  error?: string
  // The builder shows the same inputs, but not for typing into.
  disabled?: boolean
  onChange: (value: FormAnswerValue) => void
}

// One question as the person filling the form sees it. Used by the public
// page and by the builder's preview so the two cannot drift apart.
export function FormFieldInput({ field, value, error, disabled, onChange }: FormFieldInputProps) {
  if (field.type === 'image') {
    // A picture, not a question: nothing to answer. The builder shows a
    // placeholder until one is uploaded; visitors just see nothing.
    if (!isSafeRedirectUrl(field.imageUrl)) {
      return disabled ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No image yet. Upload one on the right.
        </p>
      ) : null
    }
    return (
      <div
        className={cn(
          'flex',
          field.imageAlign === 'left' && 'justify-start',
          field.imageAlign === 'center' && 'justify-center',
          field.imageAlign === 'right' && 'justify-end',
        )}
      >
        <img
          src={field.imageUrl}
          alt={field.label}
          decoding="async"
          style={{ width: `${field.imageWidth}%`, minWidth: 'min(100%, 8rem)' }}
          className="block h-auto max-w-full rounded-xl border border-slate-200"
        />
      </div>
    )
  }

  if (field.type === 'text_block') {
    return field.content.trim() ? (
      <RichText content={field.content} style={field.textStyle} />
    ) : disabled ? (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Empty text. Write it on the right.
      </p>
    ) : null
  }

  const inputId = `form-field-${field.id}`
  const text = typeof value === 'string' ? value : ''
  const picked = Array.isArray(value) ? value : []
  const describedBy = error ? `${inputId}-error` : undefined
  const isChoiceGroup = field.type === 'radio' || field.type === 'checkbox'

  const label = (
    <>
      {field.label}
      {field.required && (
        <span className="ml-0.5 text-[#be185d]" aria-hidden="true">
          *
        </span>
      )}
    </>
  )

  return (
    <div>
      {isChoiceGroup ? (
        <fieldset aria-describedby={describedBy}>
          <legend className="mb-1.5 text-sm font-semibold text-slate-800">{label}</legend>
          <div className="space-y-1.5">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type={field.type}
                  name={inputId}
                  value={option}
                  disabled={disabled}
                  required={field.type === 'radio' && field.required}
                  checked={field.type === 'radio' ? text === option : picked.includes(option)}
                  onChange={(event) => {
                    if (field.type === 'radio') {
                      onChange(option)
                    } else {
                      onChange(
                        event.target.checked
                          ? [...picked, option]
                          : picked.filter((entry) => entry !== option),
                      )
                    }
                  }}
                  className="h-4 w-4 accent-[#fc0c97]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-slate-800">
            {label}
          </label>
          {field.type === 'long_text' ? (
            <textarea
              id={inputId}
              rows={4}
              value={text}
              disabled={disabled}
              placeholder={field.placeholder}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              onChange={(event) => onChange(event.target.value)}
              className={inputClass}
            />
          ) : field.type === 'dropdown' ? (
            <select
              id={inputId}
              value={text}
              disabled={disabled}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              onChange={(event) => onChange(event.target.value)}
              className={inputClass}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={inputId}
              type={
                field.type === 'email'
                  ? 'email'
                  : field.type === 'phone'
                    ? 'tel'
                    : field.type === 'number'
                      ? 'number'
                      : field.type === 'date'
                        ? 'date'
                        : 'text'
              }
              inputMode={field.type === 'number' ? 'decimal' : undefined}
              value={text}
              disabled={disabled}
              maxLength={500}
              placeholder={field.placeholder}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              onChange={(event) => onChange(event.target.value)}
              className={cn(inputClass)}
            />
          )}
        </>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
