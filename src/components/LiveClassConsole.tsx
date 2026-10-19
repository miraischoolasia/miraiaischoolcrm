import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowSquareOut, ChartBar, ChatCircleText, Monitor, NotePencil, Robot, Shuffle, SignOut, Star, Timer, UsersFour, Warning, X } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { LessonZoomCard } from './LessonZoomCard'
import { LessonReportModal } from './LessonReportModal'
import { LiveQuestionsPanel } from './LiveQuestionsPanel'
import { GivePointsBar } from './GivePointsBar'
import { StudentGrid, gridChildren } from './console/StudentGrid'
import { RandomPickTool, TimerTool } from './console/ConsoleTools'
import { TeamsTool } from './console/TeamsTool'
import { AssistantPanel, type AssistantRunner } from './console/AssistantPanel'
import { toBankDraft, type AiQuestion } from '../lib/classAssistant'
import { fetchQuestions, fitsClassroom, saveNewQuestion } from '../lib/questions'
import { pushLiveQuestion } from '../lib/liveQuestions'
import { fetchQuestionPlan, nextPlanned, saveQuestionPlan } from '../lib/questionPlan'
import { colorOf, splitTeams, type Team } from '../lib/teams'
import { lessonBoard, type LiveAnswer, type LiveKey, type LiveQuestion } from '../lib/liveQuestions'
import { buildRoom, clearStranger, fetchRoom, watchRoom, type RoomData } from '../lib/zoomRoom'
import { awardPoints, fetchLessonPoints, fetchRewardPresets, watchLessonPoints, type PointsEntry, type RewardPreset } from '../lib/rewards'
import { fetchClassNotes, saveClassNote } from '../lib/classNotes'
import { formatClock } from '../lib/consoleTools'
import { fetchZoomChecks, type ZoomCheck } from '../lib/zoomChecks'
import { endLessonZoom } from '../lib/zoomLessons'
import {
  defaultLateReminder,
  fetchLateReminderSettings,
  fetchLateReminders,
  classPageLink,
  fillLateReminder,
  recordLateReminder,
  whatsAppLink,
  type LateReminderSettings,
} from '../lib/lateReminder'
import { classScreenChannel, classScreenUrl, firstName, topForScreen, type ClassScreenState } from '../lib/classScreen'
import { useClassLiveBroadcast } from '../lib/classLive'
import { fetchPortalSettings } from '../lib/portal'
import { fetchLiveQuestionSettings } from '../lib/liveQuestions'
import type { StudentBackground } from '../lib/studentBackground'
import type { AgeGroup } from '../types/domain'

type Tool = 'assistant' | 'timer' | 'pick' | 'teams' | 'points' | 'notes'

const tools: { key: Tool; label: string; icon: typeof Timer }[] = [
  { key: 'assistant', label: 'AI assistant', icon: Robot },
  { key: 'timer', label: 'Timer', icon: Timer },
  { key: 'pick', label: 'Random pick', icon: Shuffle },
  { key: 'points', label: 'Give points', icon: Star },
  { key: 'teams', label: 'Teams', icon: UsersFour },
  { key: 'notes', label: 'Notes', icon: NotePencil },
]

// Many WhatsApp messages in a row can get the school's number blocked: one
// tap reminds at most this many parents, a few seconds apart.
const REMIND_AT_ONCE = 20
const REMIND_GAP_MS = 3000

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })

// The teacher's screen for a live lesson, over the whole page (or in its own
// window on a second screen): every child at a glance (in Zoom, late, the
// question now, points, notes), the questions, Zoom, and small tools.
export function LiveClassConsole({
  scheduleId,
  lessonDate,
  title,
  classroom,
  studentNames,
  backgrounds,
  parentPhones,
  sendWhatsApp,
  onClose,
  onEndClass,
}: {
  scheduleId: number
  lessonDate: string
  title: string
  classroom: { subjectId?: number | null; ageGroup: AgeGroup } | null
  studentNames: Map<number, string>
  backgrounds?: Map<number, StudentBackground>
  // The number a reminder goes to (the child's contact number).
  parentPhones?: Map<number, string | null>
  // Sends from the school's WhatsApp (people who may use the Inbox); without
  // it the teacher's own WhatsApp opens with the message written in.
  sendWhatsApp?: (phone: string, name: string, text: string) => Promise<string | null>
  onClose: () => void
  // After "End class": the attendance form, filled from Zoom and the notes.
  onEndClass: () => void
}) {
  const [live, setLive] = useState<{ sessionId: number; questions: LiveQuestion[]; keys: Map<number, LiveKey>; answers: LiveAnswer[] } | null>(null)
  const sessionId = live?.sessionId ?? null
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [entries, setEntries] = useState<PointsEntry[]>([])
  const [presets, setPresets] = useState<RewardPreset[]>([])
  const [notes, setNotes] = useState<Map<number, string>>(new Map())
  const [openTools, setOpenTools] = useState<Tool[]>([])
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [reminderSettings, setReminderSettings] = useState<LateReminderSettings>(defaultLateReminder)
  // The student app's address, for the class page link in a late reminder.
  const [appUrl, setAppUrl] = useState('')
  const [reminders, setReminders] = useState<Map<number, string>>(new Map())
  const [remindingAll, setRemindingAll] = useState(false)
  const [ending, setEnding] = useState<'idle' | 'confirm' | 'ending' | 'failed'>('idle')
  const [timerState, setTimerState] = useState<{ endsAt: number | null; pausedLeft: number | null }>({ endsAt: null, pausedLeft: null })
  const [leaderboardTop, setLeaderboardTop] = useState(3)
  // Points just given: "+5" on the child's tile, and a cheer on the class screen for awards.
  const [flashes, setFlashes] = useState<Map<number, number>>(new Map())
  const [cheer, setCheer] = useState<ClassScreenState['cheer']>(null)
  const [zoomChecks, setZoomChecks] = useState<Map<number, ZoomCheck>>(new Map())
  const [roll, setRoll] = useState<ClassScreenState['roll']>(null)
  const [star, setStar] = useState<ClassScreenState['star']>(null)
  // Teams stay for the lesson in this browser (a reload keeps them).
  const teamsKey = `mirai-teams-${scheduleId}-${lessonDate}`
  const [teams, setTeamsState] = useState<Team[] | null>(() => {
    try {
      const saved = window.localStorage.getItem(teamsKey)
      return saved ? (JSON.parse(saved) as Team[]) : null
    } catch {
      return null
    }
  })
  const [teamsOnScreen, setTeamsOnScreen] = useState(true)
  // The AI assistant starts the timer or a pick through these.
  const [timerCommand, setTimerCommand] = useState<{ seq: number; minutes: number } | null>(null)
  const [pickCommand, setPickCommand] = useState<number | null>(null)
  const [bankForClass, setBankForClass] = useState<{ id: number; prompt: string }[]>([])
  useEffect(() => {
    void fetchQuestions()
      .then((list) =>
        setBankForClass(
          list
            .filter((question) => !question.isArchived && (!classroom || fitsClassroom(question, classroom)))
            .slice(0, 60)
            .map((question) => ({ id: question.id, prompt: question.prompt })),
        ),
      )
      .catch(() => setBankForClass([]))
  }, [classroom])
  function setTeams(next: Team[] | null) {
    setTeamsState(next)
    try {
      if (next) window.localStorage.setItem(teamsKey, JSON.stringify(next))
      else window.localStorage.removeItem(teamsKey)
    } catch {
      // nothing saved is fine
    }
  }

  const loadRoom = useCallback(() => {
    if (!sessionId) return
    fetchRoom(sessionId)
      .then(setRoomData)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not read who is in the lesson.'))
  }, [sessionId])

  const loadPoints = useCallback(() => {
    fetchLessonPoints(scheduleId, lessonDate)
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [lessonDate, scheduleId])

  const loadReminders = useCallback(() => {
    if (sessionId) void fetchLateReminders(sessionId).then(setReminders)
  }, [sessionId])

  const loadNotes = useCallback(() => {
    if (sessionId) void fetchClassNotes(sessionId).then(setNotes).catch(() => setNotes(new Map()))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    loadRoom()
    loadNotes()
    loadReminders()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = watchRoom(sessionId, () => {
      clearTimeout(timer)
      timer = setTimeout(loadRoom, 300)
    })
    const poll = setInterval(loadRoom, 30000)
    return () => {
      stop()
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [loadNotes, loadReminders, loadRoom, sessionId])

  useEffect(() => {
    loadPoints()
    void fetchRewardPresets().then(setPresets).catch(() => setPresets([]))
    void fetchLateReminderSettings().then(setReminderSettings)
    void fetchPortalSettings()
      .then((settings) => setAppUrl(settings.app_url))
      .catch(() => setAppUrl(''))
    void fetchLiveQuestionSettings().then((settings) => setLeaderboardTop(settings.leaderboardTop))
  }, [loadPoints])

  // Question points show live; they are in the ledger only after the reveal.
  const answerCount = live?.answers.length ?? 0
  useEffect(loadPoints, [answerCount, loadPoints])

  const namesRef = useRef(studentNames)
  useEffect(() => {
    namesRef.current = studentNames
  }, [studentNames])
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const stop = watchLessonPoints(scheduleId, lessonDate, (entry) => {
      loadPoints()
      if (entry.points <= 0 || entry.reversesId !== null) return
      setFlashes((current) => new Map(current).set(entry.studentId, entry.points))
      timers.push(
        setTimeout(() => {
          setFlashes((current) => {
            if (current.get(entry.studentId) !== entry.points) return current
            const next = new Map(current)
            next.delete(entry.studentId)
            return next
          })
        }, 2500),
      )
      if (entry.kind === 'award') {
        const name = (namesRef.current.get(entry.studentId) ?? '').trim().split(' ')[0] || 'Star'
        setCheer({ id: entry.id, studentId: entry.studentId, name, points: entry.points, reason: entry.reason })
        timers.push(setTimeout(() => setCheer((current) => (current?.id === entry.id ? null : current)), 4000))
      }
    })
    return () => {
      stop()
      timers.forEach(clearTimeout)
    }
  }, [lessonDate, loadPoints, scheduleId])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the console, but not while a one-tap ring is open (Escape closes that first).
      if (event.key === 'Escape' && !showReport && !event.defaultPrevented && !document.querySelector('[role="menu"]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showReport])

  const room = useMemo(() => (roomData ? buildRoom(roomData) : null), [roomData])
  const rosterKey = (roomData?.roster ?? []).map((child) => child.studentId).join(',')
  useEffect(() => {
    if (!rosterKey) return
    void fetchZoomChecks(rosterKey.split(',').map(Number)).then(setZoomChecks)
  }, [rosterKey])
  const names = useMemo(() => {
    const map = new Map(studentNames)
    for (const child of roomData?.roster ?? []) map.set(child.studentId, child.name)
    return map
  }, [roomData, studentNames])

  const points = useMemo(() => {
    const totals = new Map<number, number>()
    for (const entry of entries) {
      if (entry.kind === 'question') continue
      totals.set(entry.studentId, (totals.get(entry.studentId) ?? 0) + entry.points)
    }
    for (const row of lessonBoard(live?.answers ?? [])) totals.set(row.studentId, (totals.get(row.studentId) ?? 0) + row.points)
    return totals
  }, [entries, live?.answers])

  // The question on screen now: the newest one still open.
  const current = useMemo(() => {
    const questions = live?.questions ?? []
    const open = questions.filter((question) => question.status === 'live' && Date.parse(question.closesAt) > now)
    return open[open.length - 1] ?? null
  }, [live?.questions, now])
  const currentAnswers = useMemo(() => {
    if (!current) return null
    return new Map((live?.answers ?? []).filter((answer) => answer.liveQuestionId === current.id).map((answer) => [answer.studentId, answer.result]))
  }, [current, live?.answers])

  const startsAtIso = roomData?.startsAt ?? null
  const remindFrom = startsAtIso !== null && now >= Date.parse(startsAtIso) + reminderSettings.afterMinutes * 60_000
  const items = useMemo(
    () => (room ? gridChildren({ room, answers: currentAnswers, points, notes, pickedId, backgrounds, reminders, remindFrom, flashes, zoomChecks }) : []),
    [backgrounds, currentAnswers, flashes, notes, pickedId, points, reminders, remindFrom, room, zoomChecks],
  )
  const inZoom = room?.here.map((child) => child.studentId) ?? []
  const everyone = roomData?.roster.map((child) => child.studentId) ?? []
  const rosterStudents = (roomData?.roster ?? []).map((child) => ({ id: child.studentId, name: child.name }))

  const startsAt = roomData?.startsAt ? Date.parse(roomData.startsAt) : null
  const clock = startsAt === null ? null : now >= startsAt ? `Live ${formatClock((now - startsAt) / 1000)}` : `Starts in ${formatClock((startsAt - now) / 1000)}`

  function toggleTool(tool: Tool) {
    setOpenTools((current) => (current.includes(tool) ? current.filter((entry) => entry !== tool) : [...current, tool]))
  }

  async function giveOne(studentId: number, presetId: number) {
    const problem = await awardPoints({ studentIds: [studentId], presetId, scheduleId, lessonDate })
    if (!problem) loadPoints()
    return problem
  }

  async function saveNote(studentId: number, note: string) {
    if (!sessionId) return 'The lesson is still opening.'
    const problem = await saveClassNote(sessionId, studentId, note)
    if (!problem) loadNotes()
    return problem
  }

  async function remind(studentId: number) {
    if (!sessionId) return 'The lesson is still opening.'
    const phone = parentPhones?.get(studentId) ?? null
    const name = names.get(studentId) ?? 'your child'
    const time = startsAtIso ? new Date(startsAtIso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }) : ''
    const text = fillLateReminder(reminderSettings.text, { child: name, className: title, time, link: classPageLink(appUrl, sessionId) })
    if (!phone) return 'No phone number for this child.'
    if (sendWhatsApp) {
      const problem = await sendWhatsApp(phone, name, text)
      if (problem) return problem
      await recordLateReminder(sessionId, studentId, 'inbox')
    } else {
      const link = whatsAppLink(phone, text)
      if (!link) return 'The phone number does not look right.'
      window.open(link, '_blank', 'noopener')
      await recordLateReminder(sessionId, studentId, 'phone')
    }
    loadReminders()
    return null
  }

  const notHereIds = items.filter((child) => child.canRemind && child.state === 'not_yet' && !child.remindedAt).map((child) => child.studentId)
  const [remindProgress, setRemindProgress] = useState<string | null>(null)
  async function remindAll() {
    setRemindingAll(true)
    const problems: string[] = []
    const batch = notHereIds.slice(0, REMIND_AT_ONCE)
    for (const [index, studentId] of batch.entries()) {
      setRemindProgress(`Sending ${index + 1} of ${batch.length}…`)
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, REMIND_GAP_MS))
      const problem = await remind(studentId)
      if (problem) problems.push(`${names.get(studentId) ?? studentId}: ${problem}`)
    }
    setRemindProgress(null)
    setRemindingAll(false)
    const left = notHereIds.length - batch.length
    setError(
      [problems.join(' · '), left > 0 ? `${left} more not reminded yet (at most ${REMIND_AT_ONCE} at a time); tap again.` : '']
        .filter(Boolean)
        .join(' ') || null,
    )
  }

  async function endClass() {
    if (ending === 'idle') {
      setEnding('confirm')
      setTimeout(() => setEnding((state) => (state === 'confirm' ? 'idle' : state)), 4000)
      return
    }
    if (ending !== 'confirm') return
    setEnding('ending')
    const result = await endLessonZoom(scheduleId, lessonDate)
    if (result.error) {
      setError(result.error)
      setEnding('failed')
      return
    }
    onEndClass()
  }

  // The class screen window (same computer) shows what this sends: only
  // revealed questions count on its board.
  const screenState = useMemo<Omit<ClassScreenState, 'sentAt'>>(() => {
    const revealed = new Set((live?.questions ?? []).filter((question) => question.revealedAt).map((question) => question.id))
    const board = lessonBoard((live?.answers ?? []).filter((answer) => revealed.has(answer.liveQuestionId)))
    const pickedName = pickedId !== null ? (names.get(pickedId) ?? '').trim().split(' ')[0] : ''
    return {
      title,
      timer: timerState,
      picked: pickedName || null,
      top: topForScreen(board, names, Math.min(leaderboardTop, 5)),
      question: current ? { number: current.number, prompt: current.prompt, closesAt: current.closesAt } : null,
      cheer,
      roll,
      star,
      teams:
        teams && teamsOnScreen
          ? teams.map((team) => {
              const color = colorOf(team.key)
              return {
                key: team.key,
                label: team.label,
                color: color.card,
                text: color.text,
                score: team.score,
                members: team.memberIds.map((id) => ({ id, name: firstName(names.get(id) ?? '') })),
              }
            })
          : null,
    }
  }, [cheer, roll, star, teams, teamsOnScreen, current, leaderboardTop, live?.answers, live?.questions, names, pickedId, timerState, title])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(classScreenChannel(scheduleId, lessonDate))
    const send = () => channel.postMessage({ ...screenState, sentAt: Date.now() })
    send()
    channel.onmessage = send
    const beat = setInterval(send, 2000)
    return () => {
      clearInterval(beat)
      channel.close()
    }
  }, [lessonDate, scheduleId, screenState])
  // The same, live on every child's class page in the student app.
  useClassLiveBroadcast(sessionId, screenState)

  // Random pick: the class screen rolls the names of those it picks from.
  function picked(studentId: number | null, candidates: number[]) {
    setPickedId(studentId)
    if (studentId === null) return
    const people = candidates.slice(0, 60).map((id) => ({ id, name: firstName(names.get(id) ?? '') }))
    setRoll({ seq: Date.now(), people, chosenId: studentId })
  }

  const starTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (starTimer.current) clearTimeout(starTimer.current)
  }, [])
  function starOfTheDay(studentId: number) {
    const seq = Date.now()
    setStar({ seq, id: studentId, name: firstName(names.get(studentId) ?? '') })
    if (starTimer.current) clearTimeout(starTimer.current)
    starTimer.current = setTimeout(() => setStar((current) => (current?.seq === seq ? null : current)), 12000)
  }

  async function giveTeam(team: Team, preset: RewardPreset) {
    const problem = await awardPoints({ studentIds: team.memberIds, presetId: preset.id, scheduleId, lessonDate })
    if (problem) return problem
    setTeams((teams ?? []).map((entry) => (entry.key === team.key ? { ...entry, score: entry.score + preset.points } : entry)))
    loadPoints()
    return null
  }

  function openTool(tool: Tool) {
    setOpenTools((current) => (current.includes(tool) ? current : [...current, tool]))
  }

  async function addQuestion(question: AiQuestion, popNow: boolean) {
    if (!sessionId) return 'The lesson is still opening.'
    if (question.kind === 'choice' && !question.options.some((option) => option.correct)) return 'Pick the right option first.'
    const saved = await saveNewQuestion(
      toBankDraft(question, { subjectId: classroom?.subjectId ?? null, ageGroups: classroom ? [classroom.ageGroup] : [] }),
    )
    if (saved.error || saved.id === null) return saved.error ?? 'The question was not saved.'
    setBankForClass((list) => [{ id: saved.id as number, prompt: question.prompt }, ...list])
    if (popNow) return pushLiveQuestion(sessionId, saved.id, null)
    const plan = await fetchQuestionPlan(sessionId)
    return saveQuestionPlan(sessionId, [...plan, saved.id])
  }

  // What a confirmed AI suggestion does.
  const runner: AssistantRunner = {
    addQuestion,
    run: async (action) => {
      const candidates = inZoom.length > 0 ? inZoom : everyone
      switch (action.type) {
        case 'give_points': {
          const problem = await awardPoints({
            studentIds: action.studentIds,
            presetId: action.presetId,
            points: action.presetId === null ? action.points : null,
            reason: action.presetId === null ? action.reason : null,
            scheduleId,
            lessonDate,
          })
          if (!problem) loadPoints()
          return problem
        }
        case 'pop_question':
          return sessionId ? pushLiveQuestion(sessionId, action.questionId, null) : 'The lesson is still opening.'
        case 'pop_next': {
          if (!sessionId) return 'The lesson is still opening.'
          const next = nextPlanned(await fetchQuestionPlan(sessionId), live?.questions ?? [])
          return next === null ? 'No planned question is left.' : pushLiveQuestion(sessionId, next, null)
        }
        case 'new_question':
          return addQuestion(action.question, action.popNow)
        case 'start_timer':
          openTool('timer')
          setTimerCommand({ seq: Date.now(), minutes: action.minutes })
          return null
        case 'random_pick':
          openTool('pick')
          setPickCommand(Date.now())
          return null
        case 'make_teams':
          if (candidates.length < 2) return 'At least 2 children are needed.'
          openTool('teams')
          setTeams(splitTeams(candidates, action.count))
          return null
        case 'star':
          starOfTheDay(action.studentId)
          return null
        case 'note':
          return saveNote(action.studentId, action.text)
        case 'remind': {
          const problems: string[] = []
          for (const studentId of action.studentIds) {
            const problem = await remind(studentId)
            if (problem) problems.push(`${names.get(studentId) ?? studentId}: ${problem}`)
          }
          return problems.length > 0 ? problems.join(' · ') : null
        }
      }
    },
  }

  async function clear(id: number) {
    setError(await clearStranger(id))
    loadRoom()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Live class: ${title}`} className="fixed inset-0 z-40 flex flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        {clock && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums', clock.startsWith('Live') ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700')}>
            {clock}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{lessonDate}</p>
        </div>
        {room && (
          <span className="text-sm text-slate-600">
            <strong className="text-slate-900">{room.here.length}</strong> of {everyone.length} in Zoom
            {room.waiting.length > 0 && <span className="ml-2 font-semibold text-amber-700">{room.waiting.length} waiting</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {notHereIds.length > 0 && (
            <button
              type="button"
              disabled={remindingAll || !sendWhatsApp}
              title={sendWhatsApp ? undefined : 'Tap each child to remind from your own WhatsApp.'}
              onClick={() => void remindAll()}
              className="flex items-center gap-1 rounded-xl border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              <ChatCircleText size={16} aria-hidden="true" />
              {remindingAll
                ? (remindProgress ?? 'Sending…')
                : `Remind ${Math.min(notHereIds.length, REMIND_AT_ONCE)} ${Math.min(notHereIds.length, REMIND_AT_ONCE) === 1 ? 'parent' : 'parents'}${notHereIds.length > REMIND_AT_ONCE ? ` of ${notHereIds.length}` : ''}`}
            </button>
          )}
          <button
            type="button"
            disabled={ending === 'ending'}
            onClick={() => (ending === 'failed' ? onEndClass() : void endClass())}
            className={cn(
              'flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50',
              ending === 'idle' ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'bg-rose-600 text-white hover:bg-rose-700',
            )}
          >
            <SignOut size={16} aria-hidden="true" />
            {ending === 'idle' ? 'End class' : ending === 'confirm' ? 'Tap again to end' : ending === 'ending' ? 'Ending…' : 'Take attendance anyway'}
          </button>
          <button
            type="button"
            onClick={() => window.open(`/?live=${scheduleId}&date=${lessonDate}`, '_blank', 'noopener')}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowSquareOut size={16} aria-hidden="true" />
            New window
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:overflow-hidden">
        <div className="min-h-0 space-y-3 lg:overflow-y-auto lg:pr-1">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {room?.strangers.map((stranger) => (
            <div key={stranger.id} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <span className="flex items-center gap-2">
                <Warning size={16} aria-hidden="true" />
                <span>
                  <strong>{stranger.name}</strong> joined Zoom at {timeOf(stranger.joinedAt)} without a child's own link.
                  {stranger.stillHere ? ' Remove them in Zoom if you do not know them.' : ' They have left.'}
                </span>
              </span>
              <button type="button" onClick={() => void clear(stranger.id)} className="text-xs font-semibold underline underline-offset-2">
                OK
              </button>
            </div>
          ))}
          {room && room.waiting.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Waiting room:</strong> {room.waiting.map((row) => row.name).join(', ')} · Admit them in Zoom
            </p>
          )}

          {openTools.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {openTools.includes('assistant') && (
                <div className="sm:col-span-2">
                  <AssistantPanel
                    sessionId={sessionId}
                    roster={(roomData?.roster ?? []).map((child) => ({ id: child.studentId, name: child.name }))}
                    presets={presets}
                    bank={bankForClass}
                    ageGroup={classroom?.ageGroup ?? null}
                    runner={runner}
                  />
                </div>
              )}
              {openTools.includes('timer') && <TimerTool onChange={setTimerState} command={timerCommand} />}
              {openTools.includes('pick') && (
                <RandomPickTool
                  candidates={inZoom.length > 0 ? inZoom : everyone}
                  names={names}
                  onPicked={(studentId) => picked(studentId, inZoom.length > 0 ? inZoom : everyone)}
                  command={pickCommand}
                />
              )}
              {openTools.includes('teams') && (
                <div className="sm:col-span-2">
                  <TeamsTool
                    candidates={inZoom.length > 0 ? inZoom : everyone}
                    names={names}
                    teams={teams}
                    presets={presets}
                    onTeams={setTeams}
                    onGiveTeam={giveTeam}
                    onScreen={teamsOnScreen}
                    onScreenChange={setTeamsOnScreen}
                  />
                </div>
              )}
              {openTools.includes('points') && (
                <div className="sm:col-span-2">
                  <GivePointsBar scheduleId={scheduleId} lessonDate={lessonDate} students={rosterStudents} presets={presets} onChanged={loadPoints} />
                </div>
              )}
              {openTools.includes('notes') && (
                <section aria-label="Notes" className="rounded-2xl border border-slate-200 bg-white p-3 sm:col-span-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <NotePencil size={16} className="text-sky-600" aria-hidden="true" />
                    Notes this lesson
                  </h4>
                  {notes.size === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">Tap a child to write a note. Notes go into the lesson remark when you take attendance.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {[...notes].map(([studentId, note]) => (
                        <li key={studentId}>
                          <strong className="text-slate-800">{names.get(studentId) ?? `Student ${studentId}`}:</strong> <span className="text-slate-700">{note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}

          <section aria-label="Children" className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Children</h3>
              <span className="text-xs text-slate-500">{current ? `Q${current.number} now: ${currentAnswers?.size ?? 0} of ${everyone.length} answered` : 'Tap a child for points and a note'}</span>
            </div>
            {room ? (
              <StudentGrid items={items} presets={presets} onGive={giveOne} onSaveNote={saveNote} onRemind={remind} onStar={starOfTheDay} />
            ) : (
              <p className="text-sm text-slate-500">{sessionId ? 'Loading…' : 'Opening the lesson…'}</p>
            )}
          </section>
        </div>

        <div className="min-h-0 space-y-4 lg:overflow-y-auto lg:pr-1">
          {sessionId && <LessonZoomCard scheduleId={scheduleId} lessonDate={lessonDate} rosterCount={everyone.length} />}
          <LiveQuestionsPanel
            scheduleId={scheduleId}
            lessonDate={lessonDate}
            classroom={classroom}
            studentNames={names}
            rosterCount={everyone.length}
            onLive={setLive}
          />
        </div>
      </div>

      <nav aria-label="Tools" className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-2">
        {tools.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={openTools.includes(key)}
            onClick={() => toggleTool(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
              openTools.includes(key) ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
            {key === 'notes' && notes.size > 0 && <span className="text-xs">({notes.size})</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.open(classScreenUrl(scheduleId, lessonDate), `class-screen-${scheduleId}`, 'width=1280,height=720')}
          title="A big window to share in Zoom: timer, who is picked, the question and the top of the board"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Monitor size={16} aria-hidden="true" />
          Class screen
        </button>
        <button
          type="button"
          disabled={!sessionId}
          onClick={() => setShowReport(true)}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ChartBar size={16} aria-hidden="true" />
          Lesson report
        </button>
      </nav>

      {showReport && sessionId && live && (
        <LessonReportModal
          sessionId={sessionId}
          scheduleId={scheduleId}
          lessonDate={lessonDate}
          title={title}
          questions={live.questions}
          answers={live.answers}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
