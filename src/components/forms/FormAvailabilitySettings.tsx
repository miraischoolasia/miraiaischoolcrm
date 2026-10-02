import { useState } from 'react'
import { cn } from '../../lib/cn'
import {
  MAX_CLOSED_MESSAGE_LENGTH,
  MAX_NOTIFY_EMAILS,
  isClosedByDeadline,
  isoToLocalInput,
  localInputToIso,
  splitEmailList,
} from '../../lib/forms'
import type { FormSettings } from '../../types/domain'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none'

type SettingsProps = {
  settings: FormSettings
  onChange: (settings: FormSettings) => void
}

// When the form stops taking answers: at a time, or once enough are in.
export function FormAvailabilitySettings({ settings, onChange }: SettingsProps) {
  // The date box is left alone while someone types into it; only Clear resets it.
  const [clearCount, setClearCount] = useState(0)
  const passed = isClosedByDeadline(settings)

  return (
    <fieldset className="space-y-3 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold text-slate-900">Open and close</legend>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Stop accepting answers on
          <input
            key={clearCount}
            type="datetime-local"
            defaultValue={isoToLocalInput(settings.closesAt)}
            onChange={(event) => onChange({ ...settings, closesAt: localInputToIso(event.target.value) })}
            className={cn(inputClass, 'mt-1')}
          />
        </label>
        {settings.closesAt && (
          <button
            type="button"
            onClick={() => {
              setClearCount((count) => count + 1)
              onChange({ ...settings, closesAt: '' })
            }}
            className="mt-1 text-xs font-semibold text-[#be185d] hover:text-[#9d174d]"
          >
            Clear the date
          </button>
        )}
        {passed && (
          <p role="status" className="mt-1 text-xs text-amber-700">
            This time has already passed, so the form is closed now.
          </p>
        )}
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Stop after this many submissions
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={settings.maxSubmissions ?? ''}
          placeholder="No limit"
          onChange={(event) => {
            const value = event.target.value
            onChange({ ...settings, maxSubmissions: value === '' ? null : Number(value) })
          }}
          className={cn(inputClass, 'mt-1')}
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Only finished submissions count. Handy for events with limited seats.
        </span>
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Message when the form is closed
        <textarea
          rows={2}
          value={settings.closedMessage}
          maxLength={MAX_CLOSED_MESSAGE_LENGTH}
          placeholder="This form is closed and is no longer accepting responses."
          onChange={(event) => onChange({ ...settings, closedMessage: event.target.value })}
          className={cn(inputClass, 'mt-1')}
        />
      </label>
    </fieldset>
  )
}

// Who is emailed when someone finishes the form.
export function FormAlertSettings({ settings, onChange }: SettingsProps) {
  const [text, setText] = useState(settings.notifyEmails.join(', '))

  return (
    <fieldset className="space-y-2 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold text-slate-900">New submission alerts</legend>
      <label className="block text-sm font-medium text-slate-700">
        Email these people
        <textarea
          rows={2}
          value={text}
          placeholder="you@example.com, teammate@example.com"
          onChange={(event) => {
            setText(event.target.value)
            onChange({ ...settings, notifyEmails: splitEmailList(event.target.value) })
          }}
          className={cn(inputClass, 'mt-1')}
        />
      </label>
      <p className="text-xs text-slate-500">
        Up to {MAX_NOTIFY_EMAILS} addresses, separated by commas. Each finished submission sends one
        email with the answers. Leave empty for no emails.
      </p>
    </fieldset>
  )
}
