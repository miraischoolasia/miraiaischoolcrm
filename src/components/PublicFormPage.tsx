import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, Eye, Plus, X } from '@phosphor-icons/react'
import { FormFieldInput } from './forms/FormFieldInput'
import miraiLogo from '../assets/mirai-logo.png'
import miraiSeal from '../assets/mirai-seal-logo.png'
import mascotEggy from '../assets/mascot-eggy.png'
import {
  fetchPublicForm,
  notifyFormSubmission,
  recordFormView,
  saveFormProgress,
  submitPublicForm,
} from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import {
  computeRoute,
  filterAnswersToPages,
  getNextStep,
  getPageFields,
} from '../lib/formPages'
import { readTracking } from '../lib/formInsights'
import { preloadImages } from '../lib/preloadImages'
import {
  MAX_CHILDREN,
  childAnswerKey,
  getChildFields,
  getFormTitle,
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

// How long the spinner is kept up after sending someone to another address
// before the page admits it is still here and offers a link instead.
const REDIRECT_PATIENCE_MS = 6000

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

// Extra children are added on the page holding the last child question, so
// the visitor has seen all of that child's questions by then.
function getChildPageId(form: PublicForm) {
  const children = getChildFields(form.fields)
  return children.length > 0 ? children[children.length - 1].pageId : null
}

// Shown until the form and every picture on the page have arrived, so the page
// appears all at once instead of the words first and the pictures later.
function PageLoader({ embedded }: { embedded: boolean }) {
  const spinner = (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
      <span
        aria-hidden="true"
        className="h-12 w-12 animate-spin rounded-full border-4 border-pink-100 border-t-[#fc0c97]"
      />
      <p className="text-sm font-medium text-slate-600">Loading...</p>
    </div>
  )

  if (embedded) {
    return <main className="flex min-h-[320px] items-center justify-center">{spinner}</main>
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#ffd9ee] via-[#fff3fa] to-white">
      {spinner}
    </main>
  )
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
        <footer className="mt-10 flex flex-col items-center gap-3 text-center text-sm italic text-slate-700">
          <img src={miraiSeal} alt="" aria-hidden="true" className="h-20 w-auto" />
          <p>
            © {new Date().getFullYear()} Mirai AI School. All rights reserved.
            <br />
            Mirai AI School is operated by EGENIUS SDN. BHD.
          </p>
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
  const [outcome, setOutcome] = useState<
    { kind: 'message'; text: string } | { kind: 'redirecting'; url: string } | null
  >(null)
  // Every picture the page shows has arrived (or given up), so it can appear.
  const [assetsReady, setAssetsReady] = useState(false)
  // Still on this page a few seconds after being sent elsewhere: the other
  // address opened an app (WhatsApp) or refused to open inside a frame.
  const [redirectStuck, setRedirectStuck] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  // The pages already passed, so Back returns to where the visitor really was
  // (a rule may have skipped pages in between).
  const [history, setHistory] = useState<number[]>([])
  // Ties the progress saved at each Next to the final submit.
  const tokenRef = useRef(crypto.randomUUID())
  // Where this visit came from (the link's ?utm_ parts and the page that sent
  // them), read once and sent with the submission.
  const trackingRef = useRef(
    readTracking(window.location.search, document.referrer, window.location.hostname),
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const readyId = state.status === 'ready' ? state.form.id : null
  const embedded = window.parent !== window
  const pageTitle = state.status === 'ready' ? getFormTitle(state.form.name, state.form.settings) : null

  // The browser tab says what the form is, not just the school's name.
  useEffect(() => {
    if (!pageTitle) {
      return
    }
    const previous = document.title
    document.title = pageTitle
    return () => {
      document.title = previous
    }
  }, [pageTitle])

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

  // The branded page's logos and the form's own pictures load first, with the
  // loading screen up, so nothing pops in afterwards.
  useEffect(() => {
    if (state.status !== 'ready') {
      return
    }
    let cancelled = false
    const pictures = state.form.fields
      .filter((field) => field.type === 'image' && isSafeRedirectUrl(field.imageUrl))
      .map((field) => field.imageUrl)
    void preloadImages([...(embedded ? [] : [miraiLogo, miraiSeal]), ...pictures]).then(() => {
      if (!cancelled) {
        setAssetsReady(true)
      }
    })
    // The thank-you picture is only needed later; fetch it quietly meanwhile.
    new Image().src = mascotEggy
    return () => {
      cancelled = true
    }
  }, [state, embedded])

  const visibleId = assetsReady ? readyId : null

  const redirecting = outcome?.kind === 'redirecting'
  useEffect(() => {
    if (!redirecting || preview) {
      return
    }
    const timer = setTimeout(() => setRedirectStuck(true), REDIRECT_PATIENCE_MS)
    return () => clearTimeout(timer)
  }, [redirecting, preview])

  useEffect(() => {
    if (
      !visibleId ||
      window.parent === window ||
      !rootRef.current ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }
    const observer = new ResizeObserver(() => {
      window.parent.postMessage(
        { type: 'mirai-form-height', formId: visibleId, height: document.documentElement.scrollHeight },
        '*',
      )
    })
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [visibleId])

  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0 })
  }, [pageIndex])

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

  // The questions on the page being shown, with the extra children's copies
  // of the child questions when this is the page they belong to.
  function getShownFields(readyForm: PublicForm) {
    const page = readyForm.settings.pages[pageIndex]
    const onPage = getPageFields(readyForm.fields, page.id)
    const children = getChildFields(readyForm.fields)
    const childPage = getChildPageId(readyForm)
    if (childPage !== page.id) {
      return onPage
    }
    return [
      ...onPage,
      ...extraChildren.flatMap((number) =>
        children.map((field) => ({ ...field, id: childAnswerKey(field.id, number) })),
      ),
    ]
  }

  function goBack() {
    const previous = history.at(-1)
    if (previous === undefined) {
      return
    }
    setHistory((current) => current.slice(0, -1))
    setPageIndex(previous)
    setErrors({})
    setSubmitError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status !== 'ready' || isSubmitting) {
      return
    }
    const { form } = state
    const { pages } = form.settings

    const problems = validateAnswers(getShownFields(form), answers)
    setErrors(problems)
    setSubmitError(null)
    if (Object.keys(problems).length > 0) {
      return
    }

    // Not the last page: save what is filled in so far, then go on.
    const step = getNextStep(pages, pageIndex, answers)
    if (step.kind === 'page') {
      if (!preview) {
        const passed = [...history, pageIndex].map((index) => pages[index].id)
        void saveFormProgress(
          form.id,
          tokenRef.current,
          filterAnswersToPages(form.fields, passed, answers),
          // The page they are about to be on: that is where they stopped if they leave.
          step.index + 1,
        ).catch(() => {})
      }
      setHistory((current) => [...current, pageIndex])
      setPageIndex(step.index)
      return
    }

    // Finishing: only the pages the answers lead through are sent, the same
    // route the server works out for itself.
    const route = computeRoute(pages, answers)
    const sent = filterAnswersToPages(form.fields, route.visited, answers)
    const { settings } = form
    const ending = route.ending
    const redirectUrl =
      ending?.ending === 'redirect'
        ? ending.redirectUrl
        : ending
          ? ''
          : settings.afterSubmit === 'redirect'
            ? settings.redirectUrl
            : ''
    const redirects = isSafeRedirectUrl(redirectUrl)
    const message =
      (ending?.ending === 'message' ? ending.message.trim() : '') ||
      settings.successMessage ||
      'Thank you!'
    const finish = () =>
      redirects
        ? setOutcome({ kind: 'redirecting', url: redirectUrl.trim() })
        : setOutcome({ kind: 'message', text: message })

    if (preview) {
      finish()
      return
    }

    setIsSubmitting(true)
    try {
      await submitPublicForm(form.id, sent, honeypot, tokenRef.current, trackingRef.current)
      finish()
      // The email alert is only a courtesy to the staff: it never holds the
      // visitor up for long, nor shows them a failure.
      const alerting = form.notify ? notifyFormSubmission(form.id, tokenRef.current).catch(() => {}) : null
      if (redirects) {
        // Leaving the page would cancel the request, so give it a moment first.
        if (alerting) {
          await Promise.race([alerting, new Promise((resolve) => setTimeout(resolve, 2500))])
        }
        window.location.assign(redirectUrl.trim())
      }
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not send the form. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const form = state.status === 'ready' ? state.form : null
  const pages = form?.settings.pages ?? []
  const page = pages[pageIndex]
  const isMultiPage = pages.length > 1
  const childFields = form ? getChildFields(form.fields) : []
  const onChildPage = Boolean(form && page && getChildPageId(form) === page.id)
  const canAddChild =
    Boolean(form?.settings.allowMoreChildren) &&
    childFields.length > 0 &&
    onChildPage &&
    extraChildren.length < MAX_CHILDREN - 1
  const hasQuestions = form?.fields.some((field) => !isDisplayField(field.type)) ?? false
  const step = form && page ? getNextStep(pages, pageIndex, answers) : null
  const isFinalStep = step ? step.kind !== 'page' : true
  const shownFields = form && page ? getPageFields(form.fields, page.id) : []

  if (state.status === 'loading' || (state.status === 'ready' && !assetsReady)) {
    return <PageLoader embedded={embedded} />
  }

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
      {form && outcome?.kind === 'redirecting' && redirectStuck && (
        <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
          <img src={mascotEggy} alt="" aria-hidden="true" className="h-28 w-auto" />
          <CheckCircle size={28} weight="fill" className="text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-slate-800">{form.settings.successMessage || 'Thank you!'}</p>
          <a
            href={outcome.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#fc0c97] px-5 py-3 font-heading text-base font-bold text-white shadow-[0_10px_24px_rgba(252,12,151,0.32)] transition hover:bg-[#de0a84]"
          >
            Continue
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      )}
      {form && outcome?.kind === 'redirecting' && !redirectStuck && (
        <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
          <span
            aria-hidden="true"
            className="h-12 w-12 animate-spin rounded-full border-4 border-pink-100 border-t-[#fc0c97]"
          />
          <p className="text-sm font-medium text-slate-700">Loading be taken around 3 sec...</p>
          {preview && (
            <p className="text-sm text-slate-600">
              Visitors would see this loading animation, then be taken to {outcome.url}
            </p>
          )}
          {preview && (
            <button
              type="button"
              onClick={() => {
                setOutcome(null)
                setAnswers({})
                setExtraChildren([])
                setPageIndex(0)
                setHistory([])
              }}
              className="text-sm font-semibold text-[#be185d] hover:text-[#9d174d]"
            >
              Back to the form
            </button>
          )}
        </div>
      )}
      {form && outcome?.kind === 'message' && (
        <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
          <img src={mascotEggy} alt="" aria-hidden="true" className="h-32 w-auto" />
          <CheckCircle size={28} weight="fill" className="text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-slate-800">{outcome.text}</p>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setOutcome(null)
                setAnswers({})
                setExtraChildren([])
                setPageIndex(0)
                setHistory([])
              }}
              className="text-sm font-semibold text-[#be185d] hover:text-[#9d174d]"
            >
              Back to the form
            </button>
          )}
        </div>
      )}
      {form && !outcome && form.closedReason && (
        <div role="status" className="space-y-3 py-2 text-center">
          <h1 className="font-heading text-2xl font-extrabold leading-tight text-slate-900">
            {getFormTitle(form.name, form.settings)}
          </h1>
          <p className="text-sm text-slate-700">
            {form.settings.closedMessage.trim() ||
              (form.closedReason === 'full'
                ? 'This form is full. Thank you for your interest!'
                : 'This form is closed and is no longer accepting responses.')}
          </p>
        </div>
      )}
      {form && page && !outcome && !form.closedReason && (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
          <div>
            <h1 className="font-heading text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl">
              {getFormTitle(form.name, form.settings)}
            </h1>
          </div>
          {isMultiPage && (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  Step {pageIndex + 1} of {pages.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Progress"
                aria-valuemin={1}
                aria-valuemax={pages.length}
                aria-valuenow={pageIndex + 1}
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-pink-100"
              >
                <div
                  className="h-full rounded-full bg-[#fc0c97] transition-all"
                  style={{ width: `${((pageIndex + 1) / pages.length) * 100}%` }}
                />
              </div>
              {(page.title || page.description) && (
                <div className="mt-4">
                  {page.title && (
                    <h2 className="font-heading text-xl font-extrabold text-slate-900">
                      {page.title}
                    </h2>
                  )}
                  {page.description && (
                    <p className="mt-1 text-sm text-slate-600">{page.description}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {shownFields.map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={answers[field.id] ?? (field.type === 'checkbox' ? [] : '')}
              error={errors[field.id]}
              onChange={(value) => setAnswer(field.id, value)}
            />
          ))}
          {onChildPage &&
            extraChildren.map((number) => (
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
          {(isMultiPage || hasQuestions) && (
            <div className="flex gap-3">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-heading text-base font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#fc0c97] px-4 py-3 font-heading text-base font-bold text-white shadow-[0_10px_24px_rgba(252,12,151,0.32)] transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Sending...'
                  : isFinalStep
                    ? form.settings.submitLabel
                    : 'Next'}
                {!isSubmitting && !isFinalStep && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>
          )}
        </form>
      )}
    </PageShell>
  )
}
