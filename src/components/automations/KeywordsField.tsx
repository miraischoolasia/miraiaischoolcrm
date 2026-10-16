import { useEffect, useState } from 'react'
import { cleanKeywords, MAX_KEYWORDS, MAX_KEYWORD_LENGTH, type FlowSettings } from '../../lib/automationFlows'

type KeywordsFieldProps = {
  keywords: string[] | undefined
  everyTime: boolean | undefined
  readOnly: boolean
  onChange: (change: FlowSettings) => void
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50 disabled:text-slate-500'

// The words that start a flow made for messages, one per line. The box keeps what is typed (a half-written line,
// a blank line); the flow keeps the clean list.
export function KeywordsField({ keywords, everyTime, readOnly, onChange }: KeywordsFieldProps) {
  const saved = keywords ?? []
  const [text, setText] = useState(saved.join('\n'))

  useEffect(() => {
    // The flow was changed from somewhere else (another flow was opened): show its words.
    if (cleanKeywords(text.split('\n')).join('\n') !== saved.join('\n')) {
      setText(saved.join('\n'))
    }
    // The typed text is compared with the saved words only when the saved words change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.join('\n')])

  const count = cleanKeywords(text.split('\n')).length
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-900">
        Starts when a message holds
        <textarea
          aria-label="Keywords"
          value={text}
          rows={4}
          disabled={readOnly}
          maxLength={MAX_KEYWORDS * (MAX_KEYWORD_LENGTH + 1)}
          placeholder={'one word or phrase per line, for example\nHOA course\nI want to join'}
          onChange={(event) => {
            setText(event.target.value)
            onChange({ keywords: event.target.value.split('\n') })
          }}
          className={`${fieldClass} mt-1 resize-y font-normal`}
        />
      </label>
      <p className="text-xs text-slate-500">
        Any one of the lines is enough. Capital letters, spacing and punctuation do not matter. Up to {MAX_KEYWORDS}{' '}
        lines{count > 0 ? ` (${count} now)` : ''}. It listens on the channels ticked under “Send on”.
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={everyTime === true}
          disabled={readOnly}
          onChange={(event) => onChange({ everyTime: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
        />
        <span>Start again every time they write it (otherwise only the first time for each person)</span>
      </label>
    </div>
  )
}
