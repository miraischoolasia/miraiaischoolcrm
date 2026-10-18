import { useState, type ReactNode } from 'react'
import { Eye, EyeSlash, Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import type { ZoomMeetingOptions } from '../../lib/api'
import { RewardsSettings } from '../RewardsSettings'
import { AiReportSettings } from '../AiReportSettings'
import { StudentAppSettings } from '../StudentAppSettings'
import { LiveQuestionSettingsForm } from '../LiveQuestionSettingsForm'
import { ZoomAttendanceRule } from '../ZoomAttendanceRule'
import { LateReminderSetting } from '../LateReminderSetting'
import { ZoomHostsSetting } from '../ZoomHostsSetting'
import { RecordingsSettings } from '../RecordingsSettings'
import { SubjectsSettings } from '../SubjectsSettings'
import { AgeGroupsSettings } from '../AgeGroupsSettings'
import type { AgeGroupOption } from '../../lib/ageGroups'
import type { Subject } from '../../lib/subjects'
import type { RewardLevel, RewardPreset } from '../../lib/rewards'
import { attendanceColorNames, attendanceColorStyles, PRESENT, sortStatuses } from '../../lib/attendanceStatuses'
import type { AttendanceStatusOption, ReviewCriterion } from '../../types/domain'

export type ReviewCriterionDraft = Pick<
  ReviewCriterion,
  'name' | 'description' | 'maxScore' | 'remarkRequiredAtOrBelow'
>

export type AttendanceStatusDraft = Pick<AttendanceStatusOption, 'label' | 'attended' | 'deductsLesson' | 'color'>

type StatusChanges = Partial<AttendanceStatusDraft & Pick<AttendanceStatusOption, 'isActive'>>

type Tab = 'criteria' | 'attendance' | 'rewards' | 'subjects' | 'flows' | 'ai' | 'live' | 'app' | 'zoom' | 'recordings'

type ClassSettingsModalProps = {
  criteria: ReviewCriterion[]
  zoomOptions: ZoomMeetingOptions | null
  onClose: () => void
  // Each resolves to an error message, or null when saved.
  onAddCriterion: (draft: ReviewCriterionDraft) => Promise<string | null>
  onSaveCriterion: (criterion: ReviewCriterion, draft: ReviewCriterionDraft) => Promise<string | null>
  onSetCriterionActive: (criterion: ReviewCriterion, isActive: boolean) => Promise<string | null>
  onMoveCriterion: (criterion: ReviewCriterion, direction: -1 | 1) => Promise<string | null>
  statuses: AttendanceStatusOption[]
  onAddStatus: (draft: AttendanceStatusDraft) => Promise<string | null>
  onSaveStatus: (status: AttendanceStatusOption, changes: StatusChanges) => Promise<string | null>
  // Points a status gives when attendance is submitted.
  onSaveStatusPoints: (status: AttendanceStatusOption, points: number) => Promise<string | null>
  rewardPresets: RewardPreset[]
  rewardLevels: RewardLevel[]
  onRewardsChanged: () => void
  subjects: Subject[]
  onSaveSubject: (
    subject: Subject | null,
    changes: Partial<Pick<Subject, 'name' | 'sortOrder' | 'isActive'>>,
  ) => Promise<string | null>
  ageGroups: AgeGroupOption[]
  onSaveAgeGroup: (group: AgeGroupOption | null, changes: Partial<AgeGroupOption>) => Promise<string | null>
  programLevels: AgeGroupOption[]
  onSaveProgramLevel: (level: AgeGroupOption | null, changes: Partial<AgeGroupOption>) => Promise<string | null>
  onSaveZoomOptions: (options: ZoomMeetingOptions) => Promise<string | null>
  // The enrolment flows: which flow each kind of class uses, and the flows themselves.
  enrolFlows?: ReactNode
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

const emptyDraft: ReviewCriterionDraft = {
  name: '',
  description: null,
  maxScore: 5,
  remarkRequiredAtOrBelow: 2,
}

// Admin settings for classes: what teachers rate each present student on, and
// how the Zoom meeting of each lesson is set up.
export function ClassSettingsModal({
  criteria,
  zoomOptions,
  onClose,
  onAddCriterion,
  onSaveCriterion,
  onSetCriterionActive,
  onMoveCriterion,
  statuses,
  onAddStatus,
  onSaveStatus,
  onSaveStatusPoints,
  rewardPresets,
  rewardLevels,
  onRewardsChanged,
  subjects,
  onSaveSubject,
  ageGroups,
  onSaveAgeGroup,
  programLevels,
  onSaveProgramLevel,
  onSaveZoomOptions,
  enrolFlows,
}: ClassSettingsModalProps) {
  const [tab, setTab] = useState<Tab>('criteria')
  const [error, setError] = useState<string | null>(null)

  async function run(action: Promise<string | null>) {
    const message = await action
    setError(message)
    return message === null
  }

  const sorted = [...criteria].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
  const active = sorted.filter((criterion) => criterion.isActive)
  const hidden = sorted.filter((criterion) => !criterion.isActive)

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Classrooms settings</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Class Settings</h2>
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
        <div role="tablist" className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['criteria', 'Review criteria'],
              ['attendance', 'Attendance'],
              ['rewards', 'Rewards'],
              ['subjects', 'Class options'],
              ['flows', 'Enrolment flows'],
              ['ai', 'AI analysis'],
              ['live', 'Live questions'],
              ['app', 'Student app'],
              ['zoom', 'Zoom'],
              ['recordings', 'Recordings'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key)
                setError(null)
              }}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-semibold transition',
                tab === key ? 'bg-[#fc0c97] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {tab === 'criteria' && (
          <>
            <p className="text-sm text-slate-500">
              Teachers rate every present student on each criterion when they take attendance. A criterion
              you hide stays on the lessons already scored on it.
            </p>
            <div className="hidden grid-cols-[1fr_5rem_6.5rem_7.5rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Name</span>
              <span>Top score</span>
              <span>Remark at or below</span>
              <span />
            </div>
            <ul className="space-y-2">
              {active.map((criterion, index) => (
                <CriterionRow
                  key={`${criterion.id}-${criterion.name}-${criterion.maxScore}-${criterion.remarkRequiredAtOrBelow}-${criterion.sortOrder}`}
                  criterion={criterion}
                  canMoveUp={index > 0}
                  canMoveDown={index < active.length - 1}
                  isOnlyActive={active.length === 1}
                  onSave={(draft) => run(onSaveCriterion(criterion, draft))}
                  onSetActive={(isActive) => run(onSetCriterionActive(criterion, isActive))}
                  onMove={(direction) => run(onMoveCriterion(criterion, direction))}
                />
              ))}
            </ul>
            <NewCriterionRow onAdd={(draft) => run(onAddCriterion(draft))} />
            {hidden.length > 0 && (
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <div className="text-sm font-semibold text-slate-700">Hidden</div>
                <ul className="space-y-2">
                  {hidden.map((criterion) => (
                    <li
                      key={criterion.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500"
                    >
                      <span>
                        {criterion.name} · top score {criterion.maxScore}
                      </span>
                      <button
                        type="button"
                        onClick={() => void run(onSetCriterionActive(criterion, true))}
                        aria-label={`Show ${criterion.name}`}
                        title="Show"
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                      >
                        <EyeSlash size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'attendance' && (
          <AttendanceStatusesForm
            statuses={statuses}
            onAdd={(draft) => run(onAddStatus(draft))}
            onSave={(status, changes) => run(onSaveStatus(status, changes))}
            onSavePoints={(status, points) => run(onSaveStatusPoints(status, points))}
          />
        )}

        {tab === 'rewards' && (
          <RewardsSettings presets={rewardPresets} levels={rewardLevels} onChanged={onRewardsChanged} />
        )}

        {tab === 'subjects' && (
          <>
            <SubjectsSettings subjects={subjects} onSave={onSaveSubject} />
            <AgeGroupsSettings groups={ageGroups} onSave={onSaveAgeGroup} />
            <AgeGroupsSettings
              groups={programLevels}
              onSave={onSaveProgramLevel}
              title="Class levels"
              description="The level of each class (e.g. Coder Foundation, Form 4). Renaming one renames it on every class."
              placeholder="New level, e.g. Form 4"
              noun="level"
            />
          </>
        )}

        {tab === 'flows' && <div className="space-y-6">{enrolFlows}</div>}

        {tab === 'ai' && <AiReportSettings />}

        {tab === 'live' && <LiveQuestionSettingsForm />}

        {tab === 'app' && <StudentAppSettings />}

        {tab === 'zoom' && (
          <>
            <ZoomOptionsForm
              // Starts over once the saved settings have loaded.
              key={zoomOptions ? 'loaded' : 'loading'}
              options={zoomOptions}
              onSave={(options) => run(onSaveZoomOptions(options))}
            />
            <ZoomHostsSetting />
            <ZoomAttendanceRule />
            <LateReminderSetting />
          </>
        )}
        {tab === 'recordings' && <RecordingsSettings />}
      </div>
    </ModalShell>
  )
}

function isValid(draft: ReviewCriterionDraft) {
  return (
    draft.name.trim().length > 0 &&
    draft.name.trim().length <= 60 &&
    Number.isInteger(draft.maxScore) &&
    draft.maxScore >= 2 &&
    draft.maxScore <= 10 &&
    Number.isInteger(draft.remarkRequiredAtOrBelow) &&
    draft.remarkRequiredAtOrBelow >= 0 &&
    draft.remarkRequiredAtOrBelow < draft.maxScore
  )
}

function DraftFields({
  draft,
  onChange,
  label,
  scaleLocked = false,
}: {
  draft: ReviewCriterionDraft
  onChange: (next: ReviewCriterionDraft) => void
  label: string
  // The top score cannot change once students were scored on it.
  scaleLocked?: boolean
}) {
  return (
    <>
      <input
        type="text"
        value={draft.name}
        maxLength={60}
        placeholder="e.g. Teamwork"
        aria-label={`${label} name`}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        className={inputClass}
      />
      <input
        type="number"
        min={2}
        max={10}
        value={draft.maxScore}
        disabled={scaleLocked}
        title={scaleLocked ? 'Students have been scored on this, so its top score stays.' : undefined}
        aria-label={`${label} top score`}
        onChange={(event) => onChange({ ...draft, maxScore: Number(event.target.value) })}
        className={cn(inputClass, scaleLocked && 'bg-slate-50 text-slate-400')}
      />
      <input
        type="number"
        min={0}
        max={draft.maxScore - 1}
        value={draft.remarkRequiredAtOrBelow}
        title="A score at or below this needs a remark. 0 = never."
        aria-label={`${label} remark at or below`}
        onChange={(event) => onChange({ ...draft, remarkRequiredAtOrBelow: Number(event.target.value) })}
        className={inputClass}
      />
    </>
  )
}

function CriterionRow({
  criterion,
  canMoveUp,
  canMoveDown,
  isOnlyActive,
  onSave,
  onSetActive,
  onMove,
}: {
  criterion: ReviewCriterion
  canMoveUp: boolean
  canMoveDown: boolean
  isOnlyActive: boolean
  onSave: (draft: ReviewCriterionDraft) => Promise<boolean>
  onSetActive: (isActive: boolean) => Promise<boolean>
  onMove: (direction: -1 | 1) => Promise<boolean>
}) {
  const initial: ReviewCriterionDraft = {
    name: criterion.name,
    description: criterion.description,
    maxScore: criterion.maxScore,
    remarkRequiredAtOrBelow: criterion.remarkRequiredAtOrBelow,
  }
  const [draft, setDraft] = useState(initial)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <li className="grid grid-cols-3 items-center gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_5rem_6.5rem_7.5rem] sm:border-0 sm:p-0">
      <DraftFields
        draft={draft}
        onChange={setDraft}
        label={criterion.name}
        scaleLocked={criterion.legacyKey !== null}
      />
      <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
        {isDirty && (
          <button
            type="button"
            disabled={!isValid(draft)}
            onClick={() => void onSave({ ...draft, name: draft.name.trim() })}
            className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          type="button"
          disabled={!canMoveUp}
          onClick={() => void onMove(-1)}
          aria-label={`Move ${criterion.name} up`}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={() => void onMove(1)}
          aria-label={`Move ${criterion.name} down`}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          disabled={isOnlyActive}
          onClick={() => void onSetActive(false)}
          aria-label={`Hide ${criterion.name}`}
          title={isOnlyActive ? 'Keep at least one criterion' : 'Hide'}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
        >
          <Eye size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function NewCriterionRow({ onAdd }: { onAdd: (draft: ReviewCriterionDraft) => Promise<boolean> }) {
  const [draft, setDraft] = useState(emptyDraft)

  async function add() {
    if (await onAdd({ ...draft, name: draft.name.trim() })) {
      setDraft(emptyDraft)
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <div className="text-sm font-semibold text-slate-700">Add a criterion</div>
      <div className="grid grid-cols-3 items-center gap-2 sm:grid-cols-[1fr_5rem_6.5rem_7.5rem]">
        <DraftFields draft={draft} onChange={setDraft} label="New criterion" />
        <div className="col-span-3 flex justify-end sm:col-span-1">
          <button
            type="button"
            disabled={!isValid(draft)}
            onClick={() => void add()}
            aria-label="Add criterion"
            className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function ZoomOptionsForm({
  options,
  onSave,
}: {
  options: ZoomMeetingOptions | null
  onSave: (options: ZoomMeetingOptions) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<ZoomMeetingOptions | null>(options)
  const [saved, setSaved] = useState(false)

  if (!draft) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading the Zoom settings…</div>
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(options)
  const toggles: Array<[keyof Omit<ZoomMeetingOptions, 'auto_recording'>, string, string]> = [
    ['mute_upon_entry', 'Students join muted', 'The teacher unmutes whoever should speak.'],
    ['waiting_room', 'Waiting room', 'The teacher lets each student in.'],
    ['join_before_host', 'Students may join before the teacher', 'Off: the lesson opens when the teacher arrives.'],
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Used for every lesson's Zoom meeting once lessons start from the CRM. The school's Zoom account itself is
        connected on the server, not here.
      </p>
      <ul className="space-y-2">
        {toggles.map(([key, label, note]) => (
          <li key={key}>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(event) => {
                  setSaved(false)
                  setDraft({ ...draft, [key]: event.target.checked })
                }}
                className="mt-0.5 h-4 w-4 accent-[#fc0c97]"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{note}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-slate-900">Recording</span>
        <select
          value={draft.auto_recording}
          onChange={(event) => {
            setSaved(false)
            setDraft({ ...draft, auto_recording: event.target.value as ZoomMeetingOptions['auto_recording'] })
          }}
          className={inputClass}
        >
          <option value="cloud">Record to Zoom's cloud</option>
          <option value="local">Record on the teacher's computer</option>
          <option value="none">Do not record</option>
        </select>
      </label>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!isDirty}
          onClick={() => void onSave(draft).then((ok) => setSaved(ok))}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save Zoom settings
        </button>
      </div>
    </div>
  )
}

const emptyStatusDraft: AttendanceStatusDraft = { label: '', attended: false, deductsLesson: false, color: 'sky' }

// The statuses a teacher picks from when taking attendance. Present is always
// there; whether a status counts as attended or takes a lesson cannot change
// once a lesson used it (the server says so).
function AttendanceStatusesForm({
  statuses,
  onAdd,
  onSave,
  onSavePoints,
}: {
  statuses: AttendanceStatusOption[]
  onAdd: (draft: AttendanceStatusDraft) => Promise<boolean>
  onSave: (status: AttendanceStatusOption, changes: StatusChanges) => Promise<boolean>
  onSavePoints: (status: AttendanceStatusOption, points: number) => Promise<boolean>
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        What a teacher can mark each student as. Attended: the student was in class, so they are rated. Takes a
        lesson: one class comes off their package. Points: what the student gets for it (see Rewards).
      </p>
      <ul className="space-y-2">
        {sortStatuses(statuses).map((status) => (
          <StatusRow
            key={`${status.key}-${status.label}-${status.attended}-${status.deductsLesson}-${status.color}-${status.isActive}-${status.rewardPoints}`}
            status={status}
            onSave={(changes) => onSave(status, changes)}
            onSavePoints={(points) => onSavePoints(status, points)}
          />
        ))}
      </ul>
      <NewStatusRow onAdd={onAdd} />
    </div>
  )
}

function StatusFields({
  draft,
  onChange,
  label,
  locked = false,
}: {
  draft: AttendanceStatusDraft
  onChange: (next: AttendanceStatusDraft) => void
  label: string
  // Present: its flags never change.
  locked?: boolean
}) {
  return (
    <>
      <input
        type="text"
        value={draft.label}
        maxLength={30}
        placeholder="e.g. Late"
        aria-label={`${label} label`}
        onChange={(event) => onChange({ ...draft, label: event.target.value })}
        className={inputClass}
      />
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={draft.attended}
          disabled={locked}
          aria-label={`${label} attended`}
          onChange={(event) => onChange({ ...draft, attended: event.target.checked })}
          className="h-4 w-4 accent-[#fc0c97]"
        />
        Attended
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={draft.deductsLesson}
          disabled={locked}
          aria-label={`${label} takes a lesson`}
          onChange={(event) => onChange({ ...draft, deductsLesson: event.target.checked })}
          className="h-4 w-4 accent-[#fc0c97]"
        />
        Takes a lesson
      </label>
      <div role="radiogroup" aria-label={`${label} colour`} className="flex items-center gap-1">
        {attendanceColorNames.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={draft.color === color}
            aria-label={color}
            onClick={() => onChange({ ...draft, color })}
            className={cn(
              'h-5 w-5 rounded-full border-2',
              attendanceColorStyles[color].swatch,
              draft.color === color ? 'border-slate-900' : 'border-white',
            )}
          />
        ))}
      </div>
    </>
  )
}

const statusGrid = 'grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_6rem_8rem_9rem_5rem_6rem]'

function StatusRow({
  status,
  onSave,
  onSavePoints,
}: {
  status: AttendanceStatusOption
  onSave: (changes: StatusChanges) => Promise<boolean>
  onSavePoints: (points: number) => Promise<boolean>
}) {
  const [points, setPoints] = useState(status.rewardPoints)
  const pointsDirty = points !== status.rewardPoints
  const pointsValid = Number.isInteger(points) && points >= -100 && points <= 100
  const initial: AttendanceStatusDraft = {
    label: status.label,
    attended: status.attended,
    deductsLesson: status.deductsLesson,
    color: status.color,
  }
  const [draft, setDraft] = useState(initial)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const isPresent = status.key === PRESENT

  return (
    <li className={cn(statusGrid, 'rounded-xl border border-slate-200 p-2', !status.isActive && 'opacity-60')}>
      <StatusFields draft={draft} onChange={setDraft} label={status.label} locked={isPresent} />
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        ⭐
        <input
          type="number"
          min={-100}
          max={100}
          value={points}
          aria-label={`${status.label} points`}
          onChange={(event) => setPoints(Number(event.target.value))}
          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-center justify-end gap-1">
        {(isDirty || pointsDirty) && (
          <button
            type="button"
            disabled={draft.label.trim().length === 0 || !pointsValid}
            onClick={() =>
              void (async () => {
                if (isDirty && !(await onSave({ ...draft, label: draft.label.trim() }))) return
                if (pointsDirty) await onSavePoints(points)
              })()
            }
            className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          type="button"
          disabled={isPresent}
          onClick={() => void onSave({ isActive: !status.isActive })}
          aria-label={status.isActive ? `Hide ${status.label}` : `Show ${status.label}`}
          title={isPresent ? 'Present is always there' : status.isActive ? 'Hide' : 'Show'}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
        >
          {status.isActive ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
        </button>
      </div>
    </li>
  )
}

function NewStatusRow({ onAdd }: { onAdd: (draft: AttendanceStatusDraft) => Promise<boolean> }) {
  const [draft, setDraft] = useState(emptyStatusDraft)

  async function add() {
    if (await onAdd({ ...draft, label: draft.label.trim() })) {
      setDraft(emptyStatusDraft)
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <div className="text-sm font-semibold text-slate-700">Add a status</div>
      <div className={statusGrid}>
        <StatusFields draft={draft} onChange={setDraft} label="New status" />
        <span className="hidden sm:block" />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={draft.label.trim().length === 0}
            onClick={() => void add()}
            aria-label="Add status"
            className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
