import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { FormFieldInput } from './forms/FormFieldInput'
import { fetchPublicForm, submitPublicForm } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { validateAnswers, type FormAnswerValue } from '../lib/forms'
import type { PublicForm } from '../types/domain'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; form: PublicForm }

// The page a visitor sees at /?form=<id>: no login, no CRM chrome. It also
// runs inside the iframe other websites embed, and tells that page how tall
// it is so the iframe can grow with the form.
export function PublicFormPage({ formId }: { formId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicForm(formId)
      .then((form) => {
        if (!cancelled) {
          setState(form ? { status: 'ready', form } : { status: 'missing' })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [formId])

  useEffect(() => {
    if (window.parent === window || !rootRef.current || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      window.parent.postMessage(
        { type: 'mirai-form-height', formId, height: document.documentElement.scrollHeight },
        '*',
      )
    })
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [formId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status !== 'ready' || isSubmitting) {
      return
    }

    const problems = validateAnswers(state.form.fields, answers)
    setErrors(problems)
    setSubmitError(null)
    if (Object.keys(problems).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      await submitPublicForm(state.form.id, answers, honeypot)
      setIsDone(true)
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not send the form. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900">
      <div ref={rootRef} className="mx-auto max-w-xl">
        {state.status === 'loading' && <p className="text-sm text-slate-500">Loading...</p>}
        {state.status === 'missing' && (
          <p className="text-sm text-slate-600">This form is not available.</p>
        )}
        {state.status === 'failed' && (
          <p role="alert" className="text-sm text-red-600">
            This form could not be loaded. Please try again later.
          </p>
        )}
        {state.status === 'ready' && isDone && (
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5">
            <CheckCircle size={24} weight="fill" className="shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-emerald-900">
              {state.form.settings.successMessage || 'Thank you!'}
            </p>
          </div>
        )}
        {state.status === 'ready' && !isDone && (
          <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
            <h1 className="text-xl font-semibold text-slate-900">{state.form.name}</h1>
            {state.form.fields.map((field) => (
              <FormFieldInput
                key={field.id}
                field={field}
                value={answers[field.id] ?? (field.type === 'checkbox' ? [] : '')}
                error={errors[field.id]}
                onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
              />
            ))}
            {/* Bots fill every input they find; people never see this one. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </label>
            </div>
            {submitError && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#fc0c97] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Sending...' : state.form.settings.submitLabel}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
