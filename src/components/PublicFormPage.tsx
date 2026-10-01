import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle, Plus, X } from '@phosphor-icons/react'
import { FormFieldInput } from './forms/FormFieldInput'
import { fetchPublicForm, recordFormView, submitPublicForm } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import {
  MAX_CHILDREN,
  childAnswerKey,
  getChildFields,
  isSafeRedirectUrl,
  validateAnswers,
  type FormAnswerValue,
} from '../lib/forms'
import type { PublicForm } from '../types/domain'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; form: PublicForm }

// Count a visit once per browser session, so reloading does not inflate it.
function countViewOnce(formId: string) {
  const key = `mirai-form-viewed-${formId}`
  try {
    if (window.sessionStorage.getItem(key)) {
      return
    }
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Storage can be blocked inside an embed; counting twice is harmless.
  }
  void recordFormView(formId).catch(() => {})
}

// The page a visitor sees at /?form=<link name or id>: no login, no CRM
// chrome. It also runs inside the iframe other websites embed, and tells that
// page how tall it is so the iframe can grow with the form.
export function PublicFormPage({ formKey }: { formKey: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>({})
  const [extraChildren, setExtraChildren] = useState<number[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<'message' | 'redirecting' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const readyId = state.status === 'ready' ? state.form.id : null

  useEffect(() => {
    let cancelled = false
    fetchPublicForm(formKey)
      .then((form) => {
        if (cancelled) {
          return
        }
        setState(form ? { status: 'ready', form } : { status: 'missing' })
        if (form) {
          countViewOnce(form.id)
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
  }, [formKey])

  useEffect(() => {
    if (
      !readyId ||
      window.parent === window ||
      !rootRef.current ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }
    const observer = new ResizeObserver(() => {
      window.parent.postMessage(
        { type: 'mirai-form-height', formId: readyId, height: document.documentElement.scrollHeight },
        '*',
      )
    })
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [readyId])

  function setAnswer(key: string, value: FormAnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }))
  }

  function addChild() {
    const next = [2, 3].find((number) => !extraChildren.includes(number))
    if (next) {
      setExtraChildren((current) => [...current, next].sort())
    }
  }

  function removeChild(number: number, childFields: { id: string }[]) {
    setExtraChildren((current) => current.filter((entry) => entry !== number))
    setAnswers((current) => {
      const next = { ...current }
      for (const field of childFields) {
        delete next[childAnswerKey(field.id, number)]
      }
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status !== 'ready' || isSubmitting) {
      return
    }
    const { form } = state
    const childFields = getChildFields(form.fields)
    const allFields = [
      ...form.fields,
      ...extraChildren.flatMap((number) =>
        childFields.map((field) => ({ ...field, id: childAnswerKey(field.id, number) })),
      ),
    ]

    const problems = validateAnswers(allFields, answers)
    setErrors(problems)
    setSubmitError(null)
    if (Object.keys(problems).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      await submitPublicForm(form.id, answers, honeypot)
      const { settings } = form
      if (settings.afterSubmit === 'redirect' && isSafeRedirectUrl(settings.redirectUrl)) {
        setOutcome('redirecting')
        window.location.assign(settings.redirectUrl.trim())
      } else {
        setOutcome('message')
      }
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not send the form. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const form = state.status === 'ready' ? state.form : null
  const childFields = form ? getChildFields(form.fields) : []
  const canAddChild =
    Boolean(form?.settings.allowMoreChildren) &&
    childFields.length > 0 &&
    extraChildren.length < MAX_CHILDREN - 1

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
        {form && outcome && (
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5">
            <CheckCircle size={24} weight="fill" className="shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-emerald-900">
              {outcome === 'redirecting'
                ? 'Thank you! Taking you to the next page...'
                : form.settings.successMessage || 'Thank you!'}
            </p>
          </div>
        )}
        {form && !outcome && (
          <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
            <h1 className="text-xl font-semibold text-slate-900">{form.name}</h1>
            {form.fields.map((field) => (
              <FormFieldInput
                key={field.id}
                field={field}
                value={answers[field.id] ?? (field.type === 'checkbox' ? [] : '')}
                error={errors[field.id]}
                onChange={(value) => setAnswer(field.id, value)}
              />
            ))}
            {extraChildren.map((number) => (
              <section
                key={number}
                aria-label={`Child ${number}`}
                className="space-y-4 rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Child {number}</h2>
                  <button
                    type="button"
                    onClick={() => removeChild(number, childFields)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-red-600"
                  >
                    <X size={14} aria-hidden="true" />
                    Remove
                  </button>
                </div>
                {childFields.map((field) => {
                  const key = childAnswerKey(field.id, number)
                  return (
                    <FormFieldInput
                      key={key}
                      field={{ ...field, id: key }}
                      value={answers[key] ?? ''}
                      error={errors[key]}
                      onChange={(value) => setAnswer(key, value)}
                    />
                  )
                })}
              </section>
            ))}
            {canAddChild && (
              <button
                type="button"
                onClick={addChild}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#be185d] hover:text-[#9d174d]"
              >
                <Plus size={14} aria-hidden="true" />
                Add another child
              </button>
            )}
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
              {isSubmitting ? 'Sending...' : form.settings.submitLabel}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
