import { cn } from '../../lib/cn'
import { parseStaffStep, staffStepValue, type FilterChoice, type StaffTarget } from '../../lib/automationFlows'

type StaffStepEditorProps = {
  action: 'notify_staff' | 'create_task'
  value: string
  staff: FilterChoice[]
  readOnly: boolean
  fieldClass: string
  onChange: (value: string) => void
}

// Who a team step is for and what it says: a note in the CRM, or a follow-up task in the Calendar.
export function StaffStepEditor({ action, value, staff, readOnly, fieldClass, onChange }: StaffStepEditorProps) {
  const step = parseStaffStep(value)
  const set = (change: Partial<typeof step>) => onChange(staffStepValue(action, { ...step, ...change }))
  const known = step.to === 'pic' || step.to === 'teachers' || step.to === 'managers' || staff.some((person) => person.id === step.to)
  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <label className="flex flex-wrap items-center gap-2">
        <span>For</span>
        <select
          aria-label="Who it is for"
          value={step.to}
          disabled={readOnly}
          onChange={(event) => set({ to: event.target.value as StaffTarget })}
          className={cn(fieldClass, 'min-w-0 flex-1')}
        >
          <option value="pic">The student’s Learning Consultant (else the PIC of the lead)</option>
          <option value="teachers">The class teachers</option>
          <option value="managers">The managers (everyone with the Teacher quality tick)</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
          {!known && <option value={step.to}>Someone no longer here</option>}
        </select>
      </label>
      {action === 'notify_staff' ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
          <textarea
            aria-label="Note to staff"
            rows={3}
            maxLength={1000}
            value={step.text}
            disabled={readOnly}
            onChange={(event) => set({ text: event.target.value })}
            className={cn(fieldClass, 'mt-1 w-full')}
          />
          <span className="mt-1 block text-xs text-slate-500">
            The first line is the title. {'{child}'} and {'{parent}'} are filled in; in a class quality flow also{' '}
            {'{class}'}, {'{reason}'}, {'{news}'} and {'{draft}'} (the suggested message for the parent). It shows under the bell
            at the top of the CRM, only for that person.
          </span>
        </label>
      ) : (
        <>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task</span>
            <input
              aria-label="Task title"
              maxLength={160}
              value={step.title}
              disabled={readOnly}
              onChange={(event) => set({ title: event.target.value })}
              className={cn(fieldClass, 'mt-1 w-full')}
            />
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span>Due</span>
            <input
              type="number"
              aria-label="Due in days"
              min={0}
              max={60}
              value={step.days}
              disabled={readOnly}
              onChange={(event) => set({ days: Math.min(60, Math.max(0, Number(event.target.value) || 0)) })}
              className={cn(fieldClass, 'w-20')}
            />
            <span>day(s) later (0 = the same day). It shows in the Calendar for that person.</span>
          </label>
        </>
      )}
    </div>
  )
}
