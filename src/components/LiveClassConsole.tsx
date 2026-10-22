import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowSquareOut, ChartBar, ChatCircleText, CircleDashed, ClockCountdown, DoorOpen, DotsThree, Microphone, Monitor, NotePencil, Play, Robot, ShieldWarning, Shuffle, SignOut, SquaresFour, Star, Timer, UserMinus, UsersFour, VideoCamera, X } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { LessonZoomCard } from './LessonZoomCard'
import { LessonReportModal } from './LessonReportModal'
import { LiveQuestionsPanel, type NextUp } from './LiveQuestionsPanel'
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
import { needsAttention } from '../lib/gridFilters'
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

// The tool dock under the children, in the order teachers use them most; each has a key on the keyboard.
const tools: { key: Tool; label: string; icon: typeof Timer; shortcut: string; wide?: boolean }[] = [
  { key: 'points', label: 'Give points', icon: Star, shortcut: 'G', wide: true },
  { key: 'pick', label: 'Pick someone', icon: Shuffle, shortcut: 'P', wide: true },
  { key: 'timer', label: 'Timer', icon: Timer, shortcut: 'T', wide: true },
  { key: 'teams', label: 'Teams', icon: UsersFour, shortcut: 'M' },
  { key: 'notes', label: 'Notes', icon: NotePencil, shortcut: 'O' },
  { key: 'assistant', label: 'Assistant', icon: Robot, shortcut: 'A' },
]
const toolByKey = new Map(tools.map((tool) => [tool.shortcut.toLowerCase(), tool.key]))

// Up to this width the console is the narrow one (beside Zoom): tabs on top, five big buttons at the bottom.
const NARROW_QUERY = '(max-width: 1023px)'
function useNarrow() {
  const [narrow, setNarrow] = useState(() => (typeof window === 'undefined' ? false : (window.matchMedia?.(NARROW_QUERY).matches ?? false)))
  useEffect(() => {
    const media = window.matchMedia?.(NARROW_QUERY)
    if (!media) return undefined
    const onChange = () => setNarrow(media.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])
  return narrow
}

// "End class" ends only after being held this long, so it never happens by a stray tap.
const END_HOLD_MS = 1000

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
  const [live, setLive] = useState<{ sessionId: number; questions: LiveQuestion[]; keys: Map<number, LiveKey>; answers: LiveAnswer[]; next: NextUp | null } | null>(null)
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
  const [ending, setEnding] = useState<'idle' | 'ending' | 'failed'>('idle')
  // Pressed down on "End class": it ends when the press lasts END_HOLD_MS.
  const [holding, setHolding] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const narrow = useNarrow()
  const [narrowTab, setNarrowTab] = useState<'student' | 'questions' | 'class'>('student')
  const [moreOpen, setMoreOpen] = useState(false)
  // The AI button: each press tells the assistant to start listening (or to stop and send).
  const [micCommand, setMicCommand] = useState(0)
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
    if (ending !== 'idle') return
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

  // "End class": hold it down for a second (mouse, finger, or Enter / Space held) and it ends; letting go earlier does nothing.
  function startHold() {
    if (ending !== 'idle' || holdTimer.current) return
    setHolding(true)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      setHolding(false)
      void endClass()
    }, END_HOLD_MS)
  }
  function stopHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setHolding(false)
  }
  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  // The "⋯" menu closes on Escape (without closing the console) or a tap anywhere else.
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setMenuOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [menuOpen])

  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setMoreOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [moreOpen])

  // Keys: G P T M O A open and close the dock's tools, N pops the next planned question. Never while typing, with a
  // modifier key held, or while a window (the report, a question editor, the child ring) is on top of the console.
  const popNextRef = useRef<() => void>(() => {})
  popNextRef.current = () => {
    void runner.run({ type: 'pop_next' }).then((problem) => {
      if (problem) setError(problem)
    })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (showReport || document.querySelector('[role="menu"]') || document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return
      const key = event.key.toLowerCase()
      const tool = toolByKey.get(key)
      if (tool) {
        event.preventDefault()
        setOpenTools((current) => (current.includes(tool) ? current.filter((entry) => entry !== tool) : [...current, tool]))
      } else if (key === 'n') {
        event.preventDefault()
        popNextRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showReport])

  // The class pulse on the left: how many are where, and what needs the teacher now.
  const tally = {
    inClass: items.filter((child) => child.state === 'here' && !child.late).length,
    late: items.filter((child) => child.state === 'here' && child.late).length,
    waiting: items.filter((child) => child.state === 'waiting').length,
    out: items.filter((child) => child.state === 'not_yet' || child.state === 'left').length,
  }
  const toMark = currentAnswers ? [...currentAnswers.values()].filter((result) => result === 'pending').length : 0
  const remindCount = Math.min(notHereIds.length, REMIND_AT_ONCE)
  const todoCount = (room?.strangers.length ?? 0) + (room && room.waiting.length > 0 ? 1 : 0) + (notHereIds.length > 0 ? 1 : 0) + (toMark > 0 ? 1 : 0)

  async function clear(id: number) {
    setError(await clearStranger(id))
    loadRoom()
  }

  // The class at a glance (how many are where, what needs the teacher, the Zoom card): the first tab on the right.
  const classPanel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'in class', count: tally.inClass, icon: VideoCamera, tone: 'text-emerald-600' },
          { label: 'late', count: tally.late, icon: ClockCountdown, tone: 'text-amber-600' },
          { label: 'waiting', count: tally.waiting, icon: DoorOpen, tone: 'text-sky-600' },
          { label: 'not here', count: tally.out, icon: UserMinus, tone: 'text-slate-500' },
        ].map(({ label, count, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className={cn('text-2xl font-extrabold leading-none', tone)}>{room ? count : '–'}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
              <Icon size={14} aria-hidden="true" />
              {label}
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">To do now{todoCount > 0 ? ` · ${todoCount}` : ''}</h3>
      <div className="space-y-2">
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {room?.strangers.map((stranger) => (
          <div key={stranger.id} role="alert" className="space-y-2 rounded-xl border border-slate-200 border-l-4 border-l-red-500 bg-white p-3 text-sm text-slate-700">
            <p className="flex gap-2">
              <ShieldWarning size={18} className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
              <span>
                <strong className="text-slate-900">{stranger.name}</strong> joined Zoom at {timeOf(stranger.joinedAt)} without a child's own link.
                {stranger.stillHere ? ' Remove them in Zoom if you do not know them.' : ' They have left.'}
              </span>
            </p>
            <button
              type="button"
              onClick={() => void clear(stranger.id)}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              OK
            </button>
          </div>
        ))}
        {room && room.waiting.length > 0 && (
          <div className="flex gap-2 rounded-xl border border-slate-200 border-l-4 border-l-sky-400 bg-white p-3 text-sm text-slate-700">
            <DoorOpen size={18} className="mt-0.5 shrink-0 text-sky-500" aria-hidden="true" />
            <span>
              <strong className="text-slate-900">Waiting room:</strong> {room.waiting.map((row) => row.name).join(', ')} · Admit them in Zoom
            </span>
          </div>
        )}
        {notHereIds.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-3 text-sm text-slate-700">
            <p className="flex gap-2">
              <ChatCircleText size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
              <span>
                <strong className="text-slate-900">
                  {notHereIds.length} {notHereIds.length === 1 ? 'child is' : 'children are'} not in class yet
                </strong>
                <br />
                {notHereIds.map((id) => names.get(id) ?? id).join(', ')}
              </span>
            </p>
            <button
              type="button"
              disabled={remindingAll || !sendWhatsApp}
              title={sendWhatsApp ? undefined : 'Tap each child to remind from your own WhatsApp.'}
              onClick={() => void remindAll()}
              className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 text-xs font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
            >
              <ChatCircleText size={16} aria-hidden="true" />
              {remindingAll
                ? (remindProgress ?? 'Sending…')
                : `Remind ${remindCount} ${remindCount === 1 ? 'parent' : 'parents'}${notHereIds.length > REMIND_AT_ONCE ? ` of ${notHereIds.length}` : ''}`}
            </button>
            {!sendWhatsApp && <p className="text-xs text-slate-500">Tap each child to remind from your own WhatsApp.</p>}
          </div>
        )}
        {toMark > 0 && (
          <div className="flex gap-2 rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-3 text-sm text-slate-700">
            <CircleDashed size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              <strong className="text-slate-900">
                {toMark} {toMark === 1 ? 'answer' : 'answers'} to mark
              </strong>{' '}
              (Question {current?.number}) · in the Now tab
            </span>
          </div>
        )}
        {room && todoCount === 0 && !error && <p className="text-sm text-slate-500">Nothing needs you right now.</p>}
      </div>

      {sessionId && (
        <>
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Zoom</h3>
          <div>
            <LessonZoomCard scheduleId={scheduleId} lessonDate={lessonDate} rosterCount={everyone.length} />
          </div>
        </>
      )}
    </div>
  )
  const classNeeds = todoCount + (error ? 1 : 0)

  // The open tools (timer, pick, teams, points, notes, assistant): above the dock on a wide window, as a sheet from the
  // bottom on a narrow one.
  const toolsGrid = (
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
            micCommand={micCommand}
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
  )

  // The narrow window (beside Zoom): the next planned question with Pop, three tabs, and five big buttons at the bottom.
  const nextUp = live?.next ?? null
  const nextCard = (
    <section aria-label="Next question" className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
          {current ? `Q${current.number} now · ${currentAnswers?.size ?? 0} of ${everyone.length} answered · ` : ''}Next question
        </div>
        <div className="truncate text-sm font-semibold text-slate-900">{nextUp ? nextUp.prompt : 'No planned question left'}</div>
        {nextUp && (
          <div className="truncate text-xs text-slate-500">
            {nextUp.kind} · {nextUp.points} pts · {nextUp.seconds}s
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={!nextUp || !sessionId}
        onClick={() => popNextRef.current()}
        aria-keyshortcuts="N"
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 text-sm font-bold text-white hover:bg-[#de0a84] disabled:opacity-50"
      >
        <Play size={16} weight="fill" aria-hidden="true" />
        Pop
      </button>
    </section>
  )
  const studentNeeds = items.filter(needsAttention).length
  const narrowTabs = (
    <nav aria-label="Console sections" className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-white">
      {(
        [
          { key: 'student', label: 'Student', count: studentNeeds, tone: 'bg-amber-500', countLabel: 'need you' },
          { key: 'questions', label: 'Questions', count: toMark, tone: 'bg-amber-500', countLabel: 'to mark' },
          { key: 'class', label: 'Class', count: classNeeds, tone: 'bg-red-500', countLabel: 'need you' },
        ] as const
      ).map(({ key, label, count, tone, countLabel }) => (
        <button
          key={key}
          type="button"
          aria-pressed={narrowTab === key}
          onClick={() => setNarrowTab(key)}
          className={cn(
            'flex min-h-11 items-center justify-center gap-1.5 border-b-[3px] text-sm font-bold transition',
            narrowTab === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {label}
          {count > 0 && (
            <span className={cn('inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-bold text-white', tone)}>
              {count}
              <span className="sr-only"> {countLabel}</span>
            </span>
          )}
        </button>
      ))}
    </nav>
  )
  const dockButton = 'flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-bold transition disabled:opacity-50'
  const narrowDock = (
    <nav
      aria-label="Tools"
      className="relative grid shrink-0 grid-cols-[1fr_1fr_1.35fr_1fr_1fr] gap-1.5 border-t border-slate-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_18px_rgba(15,23,42,0.06)]"
    >
      {(
        [
          { key: 'points', label: 'Points', icon: Star, shortcut: 'G' },
          { key: 'pick', label: 'Pick', icon: Shuffle, shortcut: 'P' },
        ] as const
      ).map(({ key, label, icon: Icon, shortcut }) => (
        <button
          key={key}
          type="button"
          aria-pressed={openTools.includes(key)}
          aria-keyshortcuts={shortcut}
          onClick={() => toggleTool(key)}
          className={cn(dockButton, openTools.includes(key) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
        >
          <Icon size={22} aria-hidden="true" />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          openTool('assistant')
          setMicCommand(Date.now())
        }}
        title="Speak: the assistant lists what it will do, and nothing happens until you press Confirm"
        className={cn(dockButton, 'border-[#fc0c97] bg-[#fc0c97] text-white hover:bg-[#de0a84]')}
      >
        <Microphone size={24} aria-hidden="true" />
        AI assistant
      </button>
      <button
        type="button"
        disabled={!sessionId}
        onClick={() => popNextRef.current()}
        aria-keyshortcuts="N"
        className={cn(dockButton, 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
      >
        <Play size={22} aria-hidden="true" />
        Pop
      </button>
      <div ref={moreRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(dockButton, 'w-full', moreOpen ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
        >
          <SquaresFour size={22} aria-hidden="true" />
          More
        </button>
        {moreOpen && (
          <div role="menu" aria-label="More tools" className="absolute right-0 bottom-[calc(100%+0.5rem)] z-40 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">
            {(
              [
                { key: 'timer', label: 'Timer', icon: Timer },
                { key: 'teams', label: 'Teams', icon: UsersFour },
                { key: 'notes', label: `Notes${notes.size > 0 ? ` (${notes.size})` : ''}`, icon: NotePencil },
                { key: 'assistant', label: 'Assistant (type)', icon: Robot },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  toggleTool(key)
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-slate-100"
              >
                <Icon size={18} aria-hidden="true" />
                {label}
                {openTools.includes(key) && <span className="ml-auto text-xs font-normal text-slate-500">open</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )

  return (
    // Above the CRM's own phone menu (z-40), so that menu is hidden while the console is open.
    <div role="dialog" aria-modal="true" aria-label={`Live class: ${title}`} className="fixed inset-0 z-[45] flex flex-col bg-slate-50">
      <header className="flex items-center gap-2 bg-[#0a0a0a] px-3 py-2 text-white lg:gap-3 lg:px-4 lg:py-2.5">
        <div className="min-w-0 flex-1 lg:max-w-[16rem] lg:flex-none">
          <h2 className="truncate text-base font-bold">{title}</h2>
          <p className="truncate text-xs text-slate-400">{lessonDate}</p>
        </div>
        {clock && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold tabular-nums lg:px-3 lg:text-sm',
              clock.startsWith('Live') ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200',
            )}
          >
            {clock.startsWith('Live') && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />}
            {clock}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
          <button
            type="button"
            onClick={() => window.open(classScreenUrl(scheduleId, lessonDate), `class-screen-${scheduleId}`, 'width=1280,height=720')}
            title="A big window to share in Zoom: timer, who is picked, the question and the top of the board"
            className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-800 lg:flex"
          >
            <Monitor size={18} aria-hidden="true" />
            Class screen
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-100 hover:bg-slate-800"
            >
              <DotsThree size={20} weight="bold" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div role="menu" aria-label="More" className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">
                {narrow && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      window.open(classScreenUrl(scheduleId, lessonDate), `class-screen-${scheduleId}`, 'width=1280,height=720')
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-slate-100"
                  >
                    <Monitor size={16} aria-hidden="true" />
                    Class screen
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={!sessionId}
                  onClick={() => {
                    setMenuOpen(false)
                    setShowReport(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  <ChartBar size={16} aria-hidden="true" />
                  Lesson report
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    window.open(`/?live=${scheduleId}&date=${lessonDate}`, '_blank', 'noopener')
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-slate-100"
                >
                  <ArrowSquareOut size={16} aria-hidden="true" />
                  New window
                </button>
              </div>
            )}
          </div>
          {ending === 'failed' ? (
            <button
              type="button"
              onClick={onEndClass}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
            >
              <SignOut size={18} aria-hidden="true" />
              {narrow ? 'Attendance' : 'Take attendance anyway'}
            </button>
          ) : (
            <button
              type="button"
              disabled={ending === 'ending'}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
                  event.preventDefault()
                  startHold()
                }
              }}
              onKeyUp={(event) => {
                if (event.key === 'Enter' || event.key === ' ') stopHold()
              }}
              title="Hold for 1 second: Zoom closes for everyone, then the attendance opens, filled from Zoom and your notes."
              aria-describedby="end-class-hint"
              className="relative flex min-h-10 select-none items-center gap-1.5 overflow-hidden rounded-xl border border-red-900 px-3 text-sm font-semibold text-red-200 hover:bg-red-950 disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-red-600 transition-[width] ease-linear motion-reduce:transition-none"
                style={{ width: holding ? '100%' : '0%', transitionDuration: holding ? `${END_HOLD_MS}ms` : '120ms' }}
              />
              <SignOut size={18} aria-hidden="true" className="relative" />
              <span className="relative text-white">{ending === 'ending' ? 'Ending…' : holding ? (narrow ? 'Hold…' : 'Keep holding…') : narrow ? 'End' : 'End class'}</span>
              <span id="end-class-hint" className="sr-only">
                Hold for one second to end the class.
              </span>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {narrow && nextCard}
      {narrow && narrowTabs}

      <div className="grid min-h-0 flex-1 overflow-y-auto max-lg:grid-rows-[minmax(0,1fr)] max-lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden min-[1400px]:grid-cols-[minmax(0,1fr)_440px]">

        <main aria-label="Children" className={cn('relative flex min-h-0 min-w-0 flex-col', narrow && narrowTab !== 'student' && 'hidden')}>
          <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto', narrow ? 'p-3' : 'p-4 pb-32')}>
            <div className={cn('flex flex-wrap items-baseline justify-between gap-2', narrow && 'hidden')}>
              <h3 className="text-lg font-bold text-slate-900">Children</h3>
              <span className="text-sm text-slate-500">
                {current ? `Q${current.number} now: ${currentAnswers?.size ?? 0} of ${everyone.length} answered` : 'Tap a child for points and a note'}
              </span>
            </div>
            {room ? (
              <StudentGrid items={items} presets={presets} onGive={giveOne} onSaveNote={saveNote} onRemind={remind} onStar={starOfTheDay} narrow={narrow} />
            ) : (
              <p className="text-sm text-slate-500">{sessionId ? 'Loading…' : 'Opening the lesson…'}</p>
            )}
          </div>

          {!narrow && openTools.length > 0 && (
            <section
              aria-label="Open tools"
              className="absolute inset-x-3 bottom-[6.5rem] z-20 max-h-[calc(100%-8rem)] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpenTools([])}
                  aria-label="Close the tools"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {toolsGrid}
            </section>
          )}

          {!narrow && (
            <nav aria-label="Tools" className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {tools.map(({ key, label, icon: Icon, shortcut, wide }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={openTools.includes(key)}
                  aria-keyshortcuts={shortcut}
                  onClick={() => toggleTool(key)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-2 text-xs font-semibold transition',
                    wide ? 'min-w-[5.5rem] min-[1400px]:min-w-[6.25rem]' : 'min-w-[4.75rem] min-[1400px]:min-w-[5.5rem]',
                    openTools.includes(key) ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>
                    {label}
                    {key === 'notes' && notes.size > 0 ? ` (${notes.size})` : ''}
                  </span>
                  <kbd
                    className={cn(
                      'rounded border px-1 text-[10px] font-semibold leading-4',
                      openTools.includes(key) ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-500',
                    )}
                  >
                    {shortcut}
                  </kbd>
                </button>
              ))}
            </nav>
          )}
        </main>

        {narrow && narrowTab === 'class' && (
          <section aria-label="Class" className="min-h-0 overflow-y-auto p-3">
            {classPanel}
          </section>
        )}

        <aside aria-label="Questions" className={cn('flex min-h-0 flex-col border-slate-200 bg-white lg:overflow-hidden lg:border-l', narrow && narrowTab !== 'questions' && 'hidden')}>
          <LiveQuestionsPanel
            scheduleId={scheduleId}
            lessonDate={lessonDate}
            classroom={classroom}
            studentNames={names}
            rosterCount={everyone.length}
            onLive={setLive}
            classTab={narrow ? undefined : { label: 'Class', count: classNeeds, content: classPanel }}
          />
        </aside>
      </div>

      {narrow && openTools.length > 0 && (
        <section
          aria-label="Open tools"
          className="fixed inset-x-0 bottom-[4.75rem] z-30 max-h-[70dvh] space-y-2 overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-3 shadow-[0_-12px_32px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-center justify-end">
            <span aria-hidden="true" className="mr-auto ml-[calc(50%-1.25rem)] h-1.5 w-10 rounded-full bg-slate-300" />
            <button
              type="button"
              onClick={() => setOpenTools([])}
              aria-label="Close the tools"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {toolsGrid}
        </section>
      )}
      {narrow && narrowDock}

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
