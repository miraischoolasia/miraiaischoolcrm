import { useState } from 'react'
import { PaperPlaneTilt, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { leadStatusOptions } from '../../lib/constants'
import {
  describeAction,
  describeNode,
  describeOffset,
  isTesting,
  normalizeTestPhone,
  previewMessage,
  type ChoiceKind,
  type FilterOptions,
  type FlowTestResult,
  type TestInputs,
} from '../../lib/automationFlows'
import type { Classroom } from '../../types/domain'

type FlowTesterProps = {
  classrooms: Classroom[]
  filterOptions: FilterOptions
  // The condition kinds the flow has: the fields for the newer ones are only shown when a block needs them.
  usedKinds?: string[]
  test: TestInputs
  outcome: FlowTestResult
  // A flow that starts from a message: the tester asks for the text; missReason says why it would not start.
  startsFromMessage?: boolean
  missReason?: string | null
  onTest: (change: Partial<TestInputs>) => void
  onClear: () => void
  // Only an admin can send a test.
  canSend: boolean
  // Why the test cannot be sent right now (the flow has unsaved changes), or null.
  sendBlockedReason: string | null
  // Resolves to how many messages were added to the approval queue, or an error.
  onSend: (phone: string) => Promise<{ queued: number; error: string | null }>
  // 'strip' is the row of fields in the simple view; 'panel' stacks them for the panel on the right.
  layout?: 'strip' | 'panel'
  onClose?: () => void
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
  usedKinds = [],
  test,
  outcome,
  startsFromMessage = false,
  missReason = null,
  onTest,
  onClear,
  canSend,
  sendBlockedReason,
  onSend,
  layout = 'strip',
  onClose,
}: FlowTesterProps) {
  const panel = layout === 'panel'
  const row = panel ? 'flex flex-col items-stretch gap-1' : 'flex items-center gap-2'
  // In the panel every field is as wide as the panel.
  const fieldCx = (width: string) => cn(fieldClass, panel ? 'w-full' : width)
  const choiceName = (kind: ChoiceKind, id: string) =>
    (filterOptions[kind] ?? []).find((choice) => choice.id === id)?.label ?? 'a removed choice'
  const uses = (kind: string) => usedKinds.includes(kind)
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
    <div className={panel ? 'space-y-3' : 'border-b border-slate-200 bg-white px-3 py-2'}>
      {panel && (
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Try it with a child</h3>
            <p className="text-xs text-slate-500">
              Fill in what the child is like: the steps it would walk through light up.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              <X size={14} aria-hidden="true" />
              Close
            </button>
          )}
        </div>
      )}
      <div
        className={
          panel
            ? 'flex flex-col gap-3 text-sm text-slate-700'
            : 'flex flex-wrap items-center gap-2 text-sm text-slate-700'
        }
      >
        {!panel && <span className="font-semibold text-slate-900">Try it with a child</span>}
        {startsFromMessage && (
          <span className={row}>
            <span>Message</span>
            <input
              type="text"
              aria-label="Test message"
              value={test.message}
              placeholder="what the parent writes"
              onChange={(event) => onTest({ message: event.target.value })}
              className={fieldCx('w-56')}
            />
            <select
              aria-label="Test channel"
              value={test.channel}
              onChange={(event) => onTest({ channel: event.target.value })}
              className={fieldCx('max-w-[130px]')}
            >
              <option value="">WhatsApp</option>
              <option value="messenger">Messenger</option>
              <option value="instagram">Instagram</option>
            </select>
          </span>
        )}
        <span className={row}>
          <span>Age</span>
          <input
            type="number"
            aria-label="Test age"
            min={0}
            max={30}
            value={test.age}
            placeholder="unknown"
            onChange={(event) => onTest({ age: event.target.value })}
            className={fieldCx('w-28')}
          />
        </span>
        <span className={row}>
          <span>Class</span>
          <select
            aria-label="Test class"
            value={test.classroomId}
            onChange={(event) => onTest({ classroomId: event.target.value })}
            className={fieldCx('max-w-[170px]')}
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
        <span className={row}>
          <span>Lessons left</span>
          <input
            type="number"
            aria-label="Test lessons left"
            min={0}
            value={test.hours}
            placeholder="unknown"
            onChange={(event) => onTest({ hours: event.target.value })}
            className={fieldCx('w-24')}
          />
        </span>
        <span className={row}>
          <span>Lead stage</span>
          <select
            aria-label="Test lead stage"
            value={test.stage}
            onChange={(event) => onTest({ stage: event.target.value })}
            className={fieldCx('max-w-[150px]')}
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
            <span key={kind} className={row}>
              <span>{label}</span>
              <select
                aria-label={aria}
                value={test[field]}
                onChange={(event) => onTest({ [field]: event.target.value })}
                className={fieldCx('max-w-[150px]')}
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
        {uses('subject') && (
          <span className={row}>
            <span>Is</span>
            <select
              aria-label="Test lead or student"
              value={test.subject}
              onChange={(event) => onTest({ subject: event.target.value })}
              className={fieldCx('max-w-[150px]')}
            >
              <option value="">Not said</option>
              <option value="student">A student</option>
              <option value="lead">Still a lead</option>
            </select>
          </span>
        )}
        {uses('student_kind') && (
          <span className={row}>
            <span>Student kind</span>
            <select
              aria-label="Test student kind"
              value={test.studentKind}
              onChange={(event) => onTest({ studentKind: event.target.value })}
              className={fieldCx('max-w-[150px]')}
            >
              <option value="">None</option>
              {filterOptions.student_kind.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </span>
        )}
        {uses('weekday') && (
          <span className={row}>
            <span>Due on</span>
            <select
              aria-label="Test day"
              value={test.weekday}
              onChange={(event) => onTest({ weekday: event.target.value })}
              className={fieldCx('max-w-[110px]')}
            >
              <option value="">Any day</option>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, day) => (
                <option key={name} value={String(day)}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Test hour"
              value={test.hour}
              onChange={(event) => onTest({ hour: event.target.value })}
              className={fieldCx('max-w-[110px]')}
            >
              <option value="">Any time</option>
              {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                <option key={hour} value={String(hour)}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </span>
        )}
        {uses('absent_streak') && (
          <span className={row}>
            <span>Absent in a row</span>
            <input
              type="number"
              aria-label="Test absent in a row"
              min={1}
              max={20}
              value={test.absentStreak}
              placeholder="unknown"
              onChange={(event) => onTest({ absentStreak: event.target.value })}
              className={fieldCx('w-24')}
            />
          </span>
        )}
        {uses('tag_added') && (
          <span className={row}>
            <span>Tag added</span>
            <select
              aria-label="Test tag added"
              value={test.addedTagId}
              onChange={(event) => onTest({ addedTagId: event.target.value })}
              className={fieldCx('max-w-[150px]')}
            >
              <option value="">Not said</option>
              {filterOptions.tag.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </span>
        )}
        {uses('att_status') && (
          <span className={row}>
            <span>Absence kind</span>
            <select
              aria-label="Test absence kind"
              value={test.attStatus}
              onChange={(event) => onTest({ attStatus: event.target.value })}
              className={fieldCx('max-w-[150px]')}
            >
              <option value="">Not said</option>
              {filterOptions.att_status.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className={row}>
          <span>Parent</span>
          <select
            aria-label="Test parent reply"
            value={test.reply}
            onChange={(event) => onTest({ reply: event.target.value })}
            className={fieldCx('max-w-[170px]')}
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
              className={fieldCx('w-40')}
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
        (startsFromMessage && missReason ? (
          <p className="mt-2 text-sm text-slate-500">{missReason}</p>
        ) : outcome.messages.length === 0 && outcome.actions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">This child would get no message.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {outcome.messages.length > 0 && (
              <ul className={cn('space-y-1.5 overflow-y-auto text-sm', panel ? 'max-h-64' : 'max-h-36')}>
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
            )}
            {outcome.actions.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {outcome.actions.map((step) => (
                  <li key={step.id} className="rounded-lg bg-violet-50 px-3 py-1.5 text-violet-900">
                    <span className="block text-xs text-violet-800">{describeNode(step)}</span>
                    {describeAction(step, choiceName)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      {canSend && (
        <div
          className={cn(
            'mt-2 gap-2 border-t border-slate-100 pt-2 text-sm text-slate-700',
            panel ? 'flex flex-col items-stretch' : 'flex flex-wrap items-center',
          )}
        >
          <span className="font-semibold text-slate-900">Send a test to my phone</span>
          <input
            type="tel"
            inputMode="tel"
            aria-label="My phone number"
            placeholder="012-345 6789"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={fieldCx('w-40')}
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
