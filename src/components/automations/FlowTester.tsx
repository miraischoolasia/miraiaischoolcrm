import { useState } from 'react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { leadStatusOptions } from '../../lib/constants'
import {
  describeOffset,
  isTesting,
  normalizeTestPhone,
  previewMessage,
  type FilterOptions,
  type FlowTestResult,
  type TestInputs,
} from '../../lib/automationFlows'
import type { Classroom } from '../../types/domain'

type FlowTesterProps = {
  classrooms: Classroom[]
  filterOptions: FilterOptions
  test: TestInputs
  outcome: FlowTestResult
  onTest: (change: Partial<TestInputs>) => void
  onClear: () => void
  // Only an admin can send a test.
  canSend: boolean
  // Why the test cannot be sent right now (the flow has unsaved changes), or null.
  sendBlockedReason: string | null
  // Resolves to how many messages were added to the approval queue, or an error.
  onSend: (phone: string) => Promise<{ queued: number; error: string | null }>
}

const PHONE_KEY = 'mirai.flowTestPhone'

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

function readSavedPhone() {
  try {
    return window.localStorage.getItem(PHONE_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberPhone(phone: string) {
  try {
    window.localStorage.setItem(PHONE_KEY, phone)
  } catch {
    // A private window cannot keep it; the person types it again next time.
  }
}

// A strip above the canvas: type in an age and a class and the blocks that child would walk through
// light up, with the messages that child would get listed underneath. An admin can also send those
// messages to their own phone through the approval queue, to try the whole path.
export function FlowTester({
  classrooms,
  filterOptions,
  test,
  outcome,
  onTest,
  onClear,
  canSend,
  sendBlockedReason,
  onSend,
}: FlowTesterProps) {
  const testing = isTesting(test)
  const [phone, setPhone] = useState(readSavedPhone)
  const [isSending, setIsSending] = useState(false)
  const [sendNotice, setSendNotice] = useState<{ text: string; isError: boolean } | null>(null)

  async function send() {
    const digits = normalizeTestPhone(phone)
    if (digits === null) {
      setSendNotice({ text: 'Type your own WhatsApp number, like 012-345 6789.', isError: true })
      return
    }
    setIsSending(true)
    setSendNotice(null)
    const result = await onSend(digits)
    setIsSending(false)
    if (result.error) {
      setSendNotice({ text: result.error, isError: true })
      return
    }
    rememberPhone(phone)
    const one = result.queued === 1
    setSendNotice(
      result.queued === 0
        ? { text: 'This child would get no message, so nothing was added.', isError: false }
        : {
            text: `${result.queued} test ${one ? 'message' : 'messages'} added. Open the lightning button in WhatsApp and approve ${one ? 'it' : 'them'}: ${one ? 'it goes' : 'they go'} to +${digits}.`,
            isError: false,
          },
    )
  }

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Try it with a child</span>
        <span className="flex items-center gap-2">
          <span>Age</span>
          <input
            type="number"
            aria-label="Test age"
            min={0}
            max={30}
            value={test.age}
            placeholder="unknown"
            onChange={(event) => onTest({ age: event.target.value })}
            className={cn(fieldClass, 'w-28')}
          />
        </span>
        <span className="flex items-center gap-2">
          <span>Class</span>
          <select
            aria-label="Test class"
            value={test.classroomId}
            onChange={(event) => onTest({ classroomId: event.target.value })}
            className={cn(fieldClass, 'max-w-[170px]')}
          >
            <option value="">Not in a class</option>
            {classrooms
              .filter((room) => room.status === 'active')
              .map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
          </select>
        </span>
        <span className="flex items-center gap-2">
          <span>Lessons left</span>
          <input
            type="number"
            aria-label="Test lessons left"
            min={0}
            value={test.hours}
            placeholder="unknown"
            onChange={(event) => onTest({ hours: event.target.value })}
            className={cn(fieldClass, 'w-24')}
          />
        </span>
        <span className="flex items-center gap-2">
          <span>Lead stage</span>
          <select
            aria-label="Test lead stage"
            value={test.stage}
            onChange={(event) => onTest({ stage: event.target.value })}
            className={cn(fieldClass, 'max-w-[150px]')}
          >
            <option value="">Not a lead</option>
            {leadStatusOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        {(
          [
            ['source', 'Source', 'sourceId', 'Test source', 'Any other'],
            ['tag', 'Tag', 'tagId', 'Test tag', 'No tag'],
            ['pic', 'PIC', 'picId', 'Test PIC', 'Nobody'],
            ['form', 'Form', 'formId', 'Test form', 'No form'],
            ['keyword', 'Keyword', 'keywordId', 'Test source keyword', 'No keyword'],
          ] as const
        ).map(([kind, label, field, aria, none]) =>
          filterOptions[kind].length === 0 ? null : (
            <span key={kind} className="flex items-center gap-2">
              <span>{label}</span>
              <select
                aria-label={aria}
                value={test[field]}
                onChange={(event) => onTest({ [field]: event.target.value })}
                className={cn(fieldClass, 'max-w-[150px]')}
              >
                <option value="">{none}</option>
                {filterOptions[kind].map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </span>
          ),
        )}
        <span className="flex items-center gap-2">
          <span>Parent</span>
          <select
            aria-label="Test parent reply"
            value={test.reply}
            onChange={(event) => onTest({ reply: event.target.value })}
            className={cn(fieldClass, 'max-w-[170px]')}
          >
            <option value="">Has not answered yet</option>
            <option value="replied">Replies with…</option>
            <option value="silent">Does not reply</option>
          </select>
          {test.reply === 'replied' && (
            <input
              type="text"
              aria-label="Test reply text"
              value={test.replyText}
              placeholder="what they write"
              onChange={(event) => onTest({ replyText: event.target.value })}
              className={cn(fieldClass, 'w-40')}
            />
          )}
        </span>
        {testing && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-slate-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {testing &&
        (outcome.messages.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">This child would get no message.</p>
        ) : (
          <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-sm">
            {[...outcome.messages]
              .sort((a, b) => b.mins - a.mins)
              .map((message) => (
                <li key={message.id} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-900">
                  <span className="block text-xs text-emerald-800">
                    {describeOffset(message.mins)} {message.after === true ? 'after' : 'before'}
                    {message.imageUrl ? ' · with a picture' : ''}
                  </span>
                  {previewMessage(message.text)}
                </li>
              ))}
          </ul>
        ))}
      {canSend && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Send a test to my phone</span>
          <input
            type="tel"
            inputMode="tel"
            aria-label="My phone number"
            placeholder="012-345 6789"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={cn(fieldClass, 'w-40')}
          />
          <button
            type="button"
            disabled={isSending || sendBlockedReason !== null}
            onClick={() => void send()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <PaperPlaneTilt size={14} aria-hidden="true" />
            {isSending ? 'Adding…' : 'Send test'}
          </button>
          {sendBlockedReason !== null && <span className="text-xs text-amber-800">{sendBlockedReason}</span>}
          <p className="basis-full text-xs text-slate-500">
            Uses the age and class above (lessons left and lead stage are filled in for the test). The messages wait for your approval under the lightning button first.
          </p>
          {sendNotice && (
            <p
              role={sendNotice.isError ? 'alert' : 'status'}
              className={cn(
                'basis-full rounded-lg px-3 py-1.5 text-sm',
                sendNotice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
              )}
            >
              {sendNotice.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
