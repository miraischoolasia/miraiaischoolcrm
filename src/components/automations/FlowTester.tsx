import { cn } from '../../lib/cn'
import { describeOffset, previewMessage, type FlowTestResult } from '../../lib/automationFlows'
import type { Classroom } from '../../types/domain'

type FlowTesterProps = {
  classrooms: Classroom[]
  testAge: string
  testClass: string
  outcome: FlowTestResult
  onTestAge: (value: string) => void
  onTestClass: (value: string) => void
}

const fieldClass =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

// A strip above the canvas: type in an age and a class and the blocks that child would walk through
// light up, with the messages that child would get listed underneath.
export function FlowTester({ classrooms, testAge, testClass, outcome, onTestAge, onTestClass }: FlowTesterProps) {
  const testing = testAge !== '' || testClass !== ''

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Try it with a child</span>
        <span>Age</span>
        <input
          type="number"
          aria-label="Test age"
          min={0}
          max={30}
          value={testAge}
          placeholder="unknown"
          onChange={(event) => onTestAge(event.target.value)}
          className={cn(fieldClass, 'w-28')}
        />
        <span>Class</span>
        <select
          aria-label="Test class"
          value={testClass}
          onChange={(event) => onTestClass(event.target.value)}
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
        {testing && (
          <button
            type="button"
            onClick={() => {
              onTestAge('')
              onTestClass('')
            }}
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
                  <span className="block text-xs text-emerald-800">{describeOffset(message.mins)} before</span>
                  {previewMessage(message.text)}
                </li>
              ))}
          </ul>
        ))}
    </div>
  )
}
