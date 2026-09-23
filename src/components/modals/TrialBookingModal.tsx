import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { searchLeads } from '../../lib/leadSearch'
import type { Lead, LeadChild, TrialBooking, TrialBookingFormState } from '../../types/domain'

type TrialBookingModalProps = {
  slotTitle: string
  teacherName: string
  dateKey: string
  startTime: string
  endTime: string
  bookings: TrialBooking[]
  leads: Lead[]
  canManage: boolean
  isSaving: boolean
  error: string | null
  onClose: () => void
  onBook: (form: TrialBookingFormState) => Promise<boolean>
  onCancelBooking: (booking: TrialBooking) => void
  onEditSlot: () => void
  onTakeAttendance: () => void
}

const emptyForm: TrialBookingFormState = {
  leadId: null,
  childName: '',
  childAge: '',
  phone: '',
  notes: '',
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

function getLeadLabel(lead: Lead) {
  return lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed lead'
}

export function TrialBookingModal({
  slotTitle,
  teacherName,
  dateKey,
  startTime,
  endTime,
  bookings,
  leads,
  canManage,
  isSaving,
  error,
  onClose,
  onBook,
  onCancelBooking,
  onEditSlot,
  onTakeAttendance,
}: TrialBookingModalProps) {
  const [query, setQuery] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<TrialBookingFormState>(emptyForm)
  const [validationError, setValidationError] = useState<string | null>(null)

  const results = selectedLead ? [] : searchLeads(leads, query)
  const isNewPerson = selectedLead === null

  function updateField(field: keyof TrialBookingFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function pickChild(lead: Lead, child: LeadChild) {
    setForm((current) => ({
      ...current,
      leadId: lead.id,
      childName: child.name,
      childAge: String(child.age),
      phone: child.phone ?? lead.phone ?? '',
    }))
  }

  function selectLead(lead: Lead) {
    setSelectedLead(lead)
    setQuery('')
    setValidationError(null)

    if (lead.children.length === 1) {
      pickChild(lead, lead.children[0])
      return
    }

    setForm((current) => ({
      ...current,
      leadId: lead.id,
      childName: '',
      childAge: '',
      phone: lead.phone ?? '',
    }))
  }

  function clearLead() {
    setSelectedLead(null)
    setForm(emptyForm)
    setValidationError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.childName.trim()) {
      setValidationError("Please enter the child's name.")
      return
    }

    // A new person is added to Leads too, so contact details and age are needed.
    if (isNewPerson && !form.childAge.trim()) {
      setValidationError("Please enter the child's age.")
      return
    }

    if (isNewPerson && !form.phone.trim()) {
      setValidationError('Please enter a phone number.')
      return
    }

    setValidationError(null)

    // Reset for the next child once this booking is saved.
    if (await onBook(form)) {
      clearLead()
    }
  }

  const formError = validationError ?? error

  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#0f766e]">Trial slot</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{slotTitle}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {dateKey} · {startTime}-{endTime} · {teacherName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
        <section className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            {bookings.length === 0
              ? 'Available - nobody booked yet'
              : `${bookings.length} booked`}
          </div>

          {bookings.length > 0 && (
            <ul className="space-y-2">
              {bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {booking.childName}
                      {booking.childAge !== null && (
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          {booking.childAge} yrs
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[booking.phone, booking.notes].filter(Boolean).join(' · ') || 'No contact'}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onCancelBooking(booking)}
                      disabled={isSaving}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-70"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Book a child</div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {formError}
              </div>
            )}

            {selectedLead ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      From Leads
                    </div>
                    <div className="font-semibold text-slate-900">{getLeadLabel(selectedLead)}</div>
                    <div className="text-xs text-slate-500">{selectedLead.phone ?? 'No phone'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={clearLead}
                    className="text-xs font-semibold text-slate-500 underline"
                  >
                    Not this lead
                  </button>
                </div>
                {selectedLead.children.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.children.map((child) => (
                      <button
                        key={child.name}
                        type="button"
                        onClick={() => pickChild(selectedLead, child)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          form.childName === child.name
                            ? 'border-[#0f766e] bg-teal-50 text-[#0f766e]'
                            : 'border-slate-200 text-slate-600',
                        )}
                      >
                        {child.name} ({child.age})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Search Leads</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Parent name, child name or phone"
                    className={inputClass}
                  />
                </label>
                {results.length > 0 && (
                  <ul className="space-y-1">
                    {results.map((lead) => (
                      <li key={lead.id}>
                        <button
                          type="button"
                          onClick={() => selectLead(lead)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-[#fc0c97]"
                        >
                          <span className="font-semibold text-slate-900">{getLeadLabel(lead)}</span>
                          <span className="ml-2 text-xs text-slate-500">
                            {[lead.phone, lead.children.map((child) => child.name).join(', ')]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() !== '' && results.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Not in Leads yet - fill in the details below and they will be added to Leads.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Child Name</span>
                <input
                  type="text"
                  value={form.childName}
                  onChange={(event) => updateField('childName', event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Age</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={form.childAge}
                  onChange={(event) => updateField('childAge', event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Phone</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Notes</span>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Booking...' : 'Book Trial'}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            {canManage && (
              <button
                type="button"
                onClick={onEditSlot}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit Slot / Cancel This Day
              </button>
            )}
            {canManage && bookings.length > 0 && (
              <button
                type="button"
                onClick={onTakeAttendance}
                className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                Take Attendance
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
