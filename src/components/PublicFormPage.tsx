import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle, Eye, Plus, X } from '@phosphor-icons/react'
import { FormFieldInput } from './forms/FormFieldInput'
import miraiLogo from '../assets/mirai-logo.png'
import miraiSeal from '../assets/mirai-seal-logo.png'
import mascotEggy from '../assets/mascot-eggy.png'
import mascotGordo from '../assets/mascot-gordo.png'
import { fetchPublicForm, recordFormView, submitPublicForm } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import {
  MAX_CHILDREN,
  childAnswerKey,
  getChildFields,
  isDisplayField,
  isSafeRedirectUrl,
  readPreviewDraft,
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

// On its own the form gets a branded page. Inside another website's iframe it
// shrinks to just the card, on a see-through background, so it sits in their
// page instead of shouting over it.
function PageShell({
  embedded,
  rootRef,
  children,
}: {
  embedded: boolean
  rootRef: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  if (embedded) {
    return (
      <main className="px-1 py-1 text-slate-900">
        <div
          ref={rootRef}
          className="mx-auto max-w-xl rounded-3xl border border-pink-100 bg-white p-5 sm:p-7"
        >
          {children}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#ffd9ee] via-[#fff3fa] to-white text-slate-900">
      <header className="border-b-4 border-[#fc0c97] bg-[#0a0a0a] px-4 pb-14 pt-5">
        <img src={miraiLogo} alt="Mirai AI School" className="mx-auto h-24 w-auto sm:h-28" />
      </header>
      <div ref={rootRef} className="mx-auto -mt-9 max-w-xl px-4 pb-10">
        <div className="rounded-3xl border border-pink-100 bg-white p-5 shadow-[0_24px_60px_rgba(252,12,151,0.14)] sm:p-8">
          {children}
        </div>
        <footer className="mt-8 flex items-center justify-center gap-3 text-xs text-slate-500">
          <img src={mascotGordo} alt="" aria-hidden="true" className="h-12 w-auto" />
          <img src={miraiSeal} alt="" aria-hidden="true" className="h-9 w-auto" />
          <span className="font-semibold">Mirai AI School</span>
          <img src={mascotEggy} alt="" aria-hidden="true" className="h-12 w-auto" />
        </footer>
      </div>
    </main>
  )
}

// The page a visitor sees at /?form=<link name or id>: no login, no CRM
// chrome. It also runs inside the iframe other websites embed, and tells that
// page how tall it is so the iframe can grow with the form.
//
// With `preview` it shows the draft from the builder instead of the saved
// form, and nothing is stored, counted or redirected.
export function PublicFormPage({ formKey, preview = false }: { formKey: string; preview?: boolean }) {
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
  const embedded = window.parent !== window

  // Inside another website the page itself is see-through, so only the card
  // shows and the site's own background stays visible around it.
  useEffect(() => {
    if (!embedded) {
      return
    }
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [embedded])

  useEffect(() => {
    if (preview) {
      const draft = readPreviewDraft(formKey)
      setState(draft ? { status: 'ready', form: draft } : { status: 'missing' })
      return
    }

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
  }, [formKey, preview])

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

    const { settings } = form
    const redirects = settings.afterSubmit === 'redirect' && isSafeRedirectUrl(settings.redirectUrl)

    if (preview) {
      setOutcome(redirects ? 'redirecting' : 'message')
      return
    }

    setIsSubmitting(true)
    try {
      await submitPublicForm(form.id, answers, honeypot)
      if (redirects) {
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
  const hasQuestions = form?.fields.some((field) => !isDisplayField(field.type)) ?? false

  return (
    <PageShell embedded={embedded} rootRef={rootRef}>
      {preview && (
        <p
          role="status"
          className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <Eye size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          Preview: this is how visitors will see the form. Nothing you fill in here is sent.
        </p>
      )}
      {state.status === 'loading' && <p className="text-sm text-slate-500">Loading...</p>}
      {state.status === 'missing' && (
        <p className="text-sm text-slate-600">
          {preview
            ? 'This preview is not available. Open Preview again from the form builder.'
            : 'This form is not available.'}
        </p>
      )}
      {state.status === 'failed' && (
        <p role="alert" className="text-sm text-red-600">
          This form could not be loaded. Please try again later.
        </p>
      )}
      {form && outcome && (
        <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
          <img src={mascotEggy} alt="" aria-hidden="true" className="h-32 w-auto" />
          <CheckCircle size={28} weight="fill" className="text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-slate-800">
            {outcome === 'redirecting'
              ? preview
                ? `Visitors would now be taken to ${form.settings.redirectUrl.trim()}`
                : 'Thank you! Taking you to the next page...'
              : form.settings.successMessage || 'Thank you!'}
          </p>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setOutcome(null)
                setAnswers({})
                setExtraChildren([])
              }}
              className="text-sm font-semibold text-[#be185d] hover:text-[#9d174d]"
            >
              Back to the form
            </button>
          )}
        </div>
      )}
      {form && !outcome && (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
          <div>
            <span className="inline-block rounded-full bg-[#fff0f9] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#be185d]">
              Mirai AI School
            </span>
            <h1 className="mt-2 font-heading text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">
              {form.name}
            </h1>
          </div>
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
              className="space-y-4 rounded-2xl border border-pink-100 bg-[#fff8fc] p-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-sm font-bold text-slate-800">Child {number}</h2>
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#fc0c97]/50 px-3 py-2 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff0f9]"
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
          {hasQuestions && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-[#fc0c97] px-4 py-3 font-heading text-base font-bold text-white shadow-[0_10px_24px_rgba(252,12,151,0.32)] transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Sending...' : form.settings.submitLabel}
            </button>
          )}
        </form>
      )}
    </PageShell>
  )
}
