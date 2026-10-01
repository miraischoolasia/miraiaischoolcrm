import { useCallback, useEffect, useMemo, useState } from 'react'
import { DotsThreeVertical, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { EmbedFormModal } from '../forms/EmbedFormModal'
import { FormBuilder, type FormChanges } from '../forms/FormBuilder'
import { FormSubmissionsPanel } from '../forms/FormSubmissionsPanel'
import { useConfirm } from '../../hooks/useConfirm'
import { useToast } from '../../hooks/useToast'
import {
  FORM_SUBMISSIONS_FETCH_LIMIT,
  createFormInSupabase,
  deleteFormInSupabase,
  deleteFormSubmissionInSupabase,
  fetchFormSubmissionsFromSupabase,
  fetchFormsFromSupabase,
  saveFormInSupabase,
  saveFormSlugInSupabase,
  uploadFormImageToSupabase,
} from '../../lib/api'
import { cn } from '../../lib/cn'
import { getErrorMessage } from '../../lib/errors'
import {
  createStarterFields,
  defaultFormSettings,
  formatConversionRate,
  formatDateTime,
} from '../../lib/forms'
import type { Form, FormSubmission, Teacher } from '../../types/domain'

type FormsTab = 'forms' | 'submissions'

const tabs: { key: FormsTab; label: string }[] = [
  { key: 'forms', label: 'All forms' },
  { key: 'submissions', label: 'Submissions' },
]

function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

type FormsSectionProps = {
  teacherMap: Map<number, Teacher>
  // Told the time of the newest submission once the admin has seen them all.
  onSubmissionsSeen?: (newestIso: string) => void
}

export function FormsSection({ teacherMap, onSubmissionsSeen }: FormsSectionProps) {
  const [tab, setTab] = useState<FormsTab>('forms')
  const [forms, setForms] = useState<Form[]>([])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [embedId, setEmbedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<number | null>(null)
  const { confirm, dialog } = useConfirm()
  const { showToast, toastHost } = useToast()

  const load = useCallback(async () => {
    try {
      const [nextForms, nextSubmissions] = await Promise.all([
        fetchFormsFromSupabase(),
        fetchFormSubmissionsFromSupabase(),
      ])
      setForms(nextForms)
      setSubmissions(nextSubmissions)
      setLoadError(null)
      return nextSubmissions
    } catch (error) {
      setLoadError(
        isMissingTable(error)
          ? 'Forms are not set up in the database yet. Run the latest database update (npm run db:push), then reload.'
          : getErrorMessage(error, 'Could not load forms.'),
      )
    } finally {
      setIsLoading(false)
    }
    return null
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Opening Submissions refreshes them (new ones may have come in) and clears
  // the unread badge.
  useEffect(() => {
    if (tab !== 'submissions') {
      return
    }
    let cancelled = false
    void load().then((latest) => {
      if (!cancelled && latest?.[0]) {
        onSubmissionsSeen?.(latest[0].createdAt)
      }
    })
    return () => {
      cancelled = true
    }
  }, [tab, load, onSubmissionsSeen])

  useEffect(() => {
    if (!menuId) {
      return
    }
    const close = () => setMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuId])

  const submissionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const submission of submissions) {
      counts.set(submission.formId, (counts.get(submission.formId) ?? 0) + 1)
    }
    return counts
  }, [submissions])

  const visibleForms = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return forms.filter((form) => !term || form.name.toLowerCase().includes(term))
  }, [forms, searchTerm])

  const editingForm = forms.find((form) => form.id === editingId) ?? null
  const embedForm = forms.find((form) => form.id === embedId) ?? null

  async function handleCreate() {
    setIsCreating(true)
    try {
      const form = await createFormInSupabase('Untitled form', createStarterFields(), defaultFormSettings)
      setForms((current) => [form, ...current])
      setEditingId(form.id)
      setTab('forms')
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not create the form.'))
    } finally {
      setIsCreating(false)
    }
  }

  async function handleSave(formId: string, changes: FormChanges) {
    setIsSaving(true)
    try {
      const saved = await saveFormInSupabase(formId, changes)
      setForms((current) => current.map((form) => (form.id === formId ? saved : form)))
      return true
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not save the form.'))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveSlug(formId: string, slug: string) {
    try {
      const result = await saveFormSlugInSupabase(formId, slug)
      if (result.taken || !result.form) {
        return 'That link name is already used by another form.'
      }
      const saved = result.form
      setForms((current) => current.map((form) => (form.id === formId ? saved : form)))
      return null
    } catch (error) {
      return getErrorMessage(error, 'Could not save the link name.')
    }
  }

  async function handleDuplicate(form: Form) {
    try {
      const copy = await createFormInSupabase(`${form.name} copy`.slice(0, 120), form.fields, form.settings)
      setForms((current) => [copy, ...current])
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not duplicate the form.'))
    }
  }

  async function handleDelete(form: Form) {
    const count = submissionCounts.get(form.id) ?? 0
    const message =
      count > 0
        ? `Delete "${form.name}" and its ${count} submission${count === 1 ? '' : 's'}? Leads already created from it stay in Leads.`
        : `Delete "${form.name}"?`
    if (!(await confirm(message))) {
      return
    }
    try {
      await deleteFormInSupabase(form.id)
      setForms((current) => current.filter((entry) => entry.id !== form.id))
      setSubmissions((current) => current.filter((entry) => entry.formId !== form.id))
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not delete the form.'))
    }
  }

  async function handleDeleteSubmission(submission: FormSubmission) {
    if (!(await confirm('Delete this submission? A lead created from it stays in Leads.'))) {
      return
    }
    setDeletingSubmissionId(submission.id)
    try {
      await deleteFormSubmissionInSupabase(submission.id)
      setSubmissions((current) => current.filter((entry) => entry.id !== submission.id))
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not delete the submission.'))
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  if (editingForm) {
    return (
      <>
        {dialog}
        {toastHost}
        <FormBuilder
          key={editingForm.id}
          form={editingForm}
          isSaving={isSaving}
          onSave={(changes) => handleSave(editingForm.id, changes)}
          onUploadImage={uploadFormImageToSupabase}
          onBack={() => setEditingId(null)}
          onOpenEmbed={() => setEmbedId(editingForm.id)}
        />
        {embedForm && (
          <EmbedFormModal
            formId={embedForm.id}
            formName={embedForm.name}
            isPublished={embedForm.isPublished}
            slug={embedForm.slug}
            onSaveSlug={(slug) => handleSaveSlug(embedForm.id, slug)}
            onClose={() => setEmbedId(null)}
          />
        )}
      </>
    )
  }

  return (
    <section className="space-y-4">
      {dialog}
      {toastHost}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div role="tablist" aria-label="Forms" className="flex gap-1">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={cn(
                '-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition',
                tab === entry.key
                  ? 'border-[#fc0c97] text-[#be185d]'
                  : 'border-transparent text-slate-600 hover:text-slate-900',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={isCreating || Boolean(loadError)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" />
          {isCreating ? 'Creating...' : 'Create form'}
        </button>
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </p>
      )}

      {!loadError && tab === 'forms' && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex justify-end border-b border-slate-200 p-4">
            <div className="relative">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search for forms"
                aria-label="Search for forms"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none sm:w-72"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">Loading forms...</p>
          ) : visibleForms.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              {forms.length === 0
                ? 'No forms yet. Click Create form to build your first one.'
                : 'No forms match your search.'}
            </p>
          ) : (
            <div className={cn('overflow-x-auto', menuId && 'min-h-[18rem]')}>
              <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Views</th>
                    <th className="px-6 py-4">Submissions</th>
                    <th className="px-6 py-4">Conversion</th>
                    <th className="px-6 py-4">Updated on</th>
                    <th className="px-6 py-4">Updated by</th>
                    <th className="px-6 py-4 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {visibleForms.map((form) => (
                    <tr key={form.id} className="align-middle">
                      <td className="px-6 py-4 text-sm">
                        <button
                          type="button"
                          onClick={() => setEditingId(form.id)}
                          className="text-left font-medium text-slate-800 hover:text-[#be185d]"
                        >
                          {form.name}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            form.isPublished
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {form.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{form.viewCount}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {submissionCounts.get(form.id) ?? 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatConversionRate(submissionCounts.get(form.id) ?? 0, form.viewCount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {formatDateTime(form.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {(form.updatedByTeacherId && teacherMap.get(form.updatedByTeacherId)?.fullName) || '-'}
                      </td>
                      <td className="relative px-6 py-4 text-right">
                        <button
                          type="button"
                          aria-label={`Actions for ${form.name}`}
                          aria-haspopup="menu"
                          aria-expanded={menuId === form.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            setMenuId(menuId === form.id ? null : form.id)
                          }}
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
                        >
                          <DotsThreeVertical size={20} weight="bold" aria-hidden="true" />
                        </button>
                        {menuId === form.id && (
                          <div
                            role="menu"
                            className="absolute right-6 top-12 z-10 w-44 rounded-xl border border-slate-200 bg-white py-1 text-left shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
                          >
                            {[
                              { label: 'Edit', run: () => setEditingId(form.id) },
                              { label: 'Share / Embed', run: () => setEmbedId(form.id) },
                              { label: 'Duplicate', run: () => void handleDuplicate(form) },
                              { label: 'Delete', run: () => void handleDelete(form), danger: true },
                            ].map((item) => (
                              <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                onClick={item.run}
                                className={cn(
                                  'block w-full px-4 py-2 text-left text-sm transition hover:bg-slate-50',
                                  item.danger ? 'text-red-700' : 'text-slate-700',
                                )}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loadError && tab === 'submissions' && (
        <FormSubmissionsPanel
          forms={forms}
          submissions={submissions}
          isCapped={submissions.length >= FORM_SUBMISSIONS_FETCH_LIMIT}
          deletingId={deletingSubmissionId}
          onDelete={(submission) => void handleDeleteSubmission(submission)}
        />
      )}

      {embedForm && (
        <EmbedFormModal
          formId={embedForm.id}
          formName={embedForm.name}
          isPublished={embedForm.isPublished}
          slug={embedForm.slug}
          onSaveSlug={(slug) => handleSaveSlug(embedForm.id, slug)}
          onClose={() => setEmbedId(null)}
        />
      )}
    </section>
  )
}
