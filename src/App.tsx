import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventClickArg, EventContentArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import miraiLogo from './assets/mirai-logo.png'
import mascotEggy from './assets/mascot-eggy.png'
import { malaysiaHolidayEvents } from './lib/holidays'
import {
  CalendarBlank,
  Chalkboard,
  ClockCounterClockwise,
  GraduationCap,
  IdentificationBadge,
  WarningCircle,
} from '@phosphor-icons/react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { formatDate, getTodayString, parseLocalDate } from './domain/studentStatus'
import type { Database } from './types/database'
import type {
  AdminActivity,
  AgeGroup,
  AppSection,
  AttendanceModalState,
  AttendanceReviewFormState,
  AttendanceStatus,
  Classroom,
  ClassroomFormState,
  CreateStudentFormState,
  CreateTeacherFormState,
  FilterKey,
  LessonLogStudentReview,
  LessonLogSummary,
  RenewalFormState,
  ReviewRemarkField,
  ReviewScoreField,
  Schedule,
  ScheduleFormState,
  ScheduleParticipant,
  Student,
  StudentDetailsFormState,
  Teacher,
  UserSession,
} from './types/domain'
import {
  createEmptyAttendanceReviewForm,
  getLatestLessonLogMap,
  mapReviewToFormState,
  mapScheduleParticipantRow,
  mapScheduleRow,
} from './lib/mappers'
import { buildAttendanceSubmission } from './lib/attendance'
import {
  fetchAdminActivityFromSupabase,
  fetchClassroomsFromSupabase,
  fetchLatestLessonLogStudents,
  fetchLessonLogStudentReviewsFromSupabase,
  fetchLessonLogSummariesFromSupabase,
  fetchScheduleParticipantsFromSupabase,
  fetchSchedulesFromSupabase,
  fetchStudentsFromSupabase,
  fetchTeachersFromSupabase,
  getSupabaseLoadErrorMessage,
} from './lib/api'
import { buildScheduleEvents, buildScheduleFormState, getDateKeyFromDate } from './lib/schedule'
import { ageGroupOptions, programLevelOptions } from './lib/constants'
import { cn } from './lib/cn'
import { useIsMobile } from './hooks/useIsMobile'
import { useConfirm } from './hooks/useConfirm'
import { useToast } from './hooks/useToast'
import { SummaryBar } from './components/SummaryBar'
import { ClassListingSection } from './components/sections/ClassListingSection'
import { StudentDashboardSection } from './components/sections/StudentDashboardSection'
import { TeacherManagementSection } from './components/sections/TeacherManagementSection'
import { AdminActivitySection } from './components/sections/AdminActivitySection'
import { StudentDetailModal } from './components/StudentDetailModal'
import { EditStudentModal } from './components/modals/EditStudentModal'
import { CreateStudentModal } from './components/modals/CreateStudentModal'
import { ClassroomModal } from './components/modals/ClassroomModal'
import { TeacherModal } from './components/modals/TeacherModal'
import { StudentRenewalModal } from './components/modals/StudentRenewalModal'
import { ScheduleModal } from './components/modals/ScheduleModal'
import { AttendanceModal } from './components/modals/AttendanceModal'

function App() {
  const isMobile = useIsMobile()
  const todayString = getTodayString()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { showToast, toastHost } = useToast()

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleParticipants, setScheduleParticipants] = useState<
    ScheduleParticipant[]
  >([])
  const [lessonLogs, setLessonLogs] = useState<LessonLogSummary[]>([])
  const [lessonReviews, setLessonReviews] = useState<LessonLogStudentReview[]>([])
  const [adminActivities, setAdminActivities] = useState<AdminActivity[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSavingStudent, setIsSavingStudent] = useState(false)
  const [deactivatingStudentId, setDeactivatingStudentId] = useState<number | null>(null)
  const [deletingTeacherId, setDeletingTeacherId] = useState<number | null>(null)
  const [deletingClassroomId, setDeletingClassroomId] = useState<number | null>(null)
  const [restoringClassroomId, setRestoringClassroomId] = useState<number | null>(null)
  const [studentSaveError, setStudentSaveError] = useState<string | null>(null)
  const [isCreatingStudentRecord, setIsCreatingStudentRecord] = useState(false)
  const [createStudentSaveError, setCreateStudentSaveError] = useState<string | null>(null)
  const [isCreatingTeacherRecord, setIsCreatingTeacherRecord] = useState(false)
  const [createTeacherSaveError, setCreateTeacherSaveError] = useState<string | null>(null)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null)
  const [isSavingAttendance, setIsSavingAttendance] = useState(false)
  const [attendanceSaveError, setAttendanceSaveError] = useState<string | null>(
    null,
  )

  const [studentFilter, setStudentFilter] = useState<FilterKey>('all')
  const [activeSection, setActiveSection] = useState<AppSection>('calendar')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('')
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>(ageGroupOptions[0])

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [selectedStudentDetailId, setSelectedStudentDetailId] = useState<number | null>(
    null,
  )
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [studentDetailsSaveError, setStudentDetailsSaveError] = useState<string | null>(null)
  const [isSavingStudentDetails, setIsSavingStudentDetails] = useState(false)
  const [selectedClassroomId, setSelectedClassroomId] = useState<number | null>(null)
  const [editingClassroomId, setEditingClassroomId] = useState<number | null>(null)
  const [isCreatingClassroom, setIsCreatingClassroom] = useState(false)
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false)
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false)
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null)
  const [studentFormState, setStudentFormState] = useState<RenewalFormState>({
    addHours: '0',
    lessonExpiryDate: '',
    accountFeeExpiryDate: '',
    miraiClubExpiryDate: '',
    remark: '',
  })
  const [createStudentFormState, setCreateStudentFormState] =
    useState<CreateStudentFormState>({
      fullName: '',
      classroomId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      studentType: 'regular',
    })
  const [studentDetailsFormState, setStudentDetailsFormState] =
    useState<StudentDetailsFormState>({
      fullName: '',
      classroomId: '',
      notes: '',
      studentType: 'regular',
    })
  const [isSavingClassroom, setIsSavingClassroom] = useState(false)
  const [classroomSaveError, setClassroomSaveError] = useState<string | null>(null)
  const [classroomFormState, setClassroomFormState] = useState<ClassroomFormState>({
    name: '',
    ageGroup: ageGroupOptions[0],
    programLevel: programLevelOptions[0],
    teacherId: '',
    notes: '',
  })
  const [createTeacherFormState, setCreateTeacherFormState] =
    useState<CreateTeacherFormState>({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
    })

  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [scheduleFormState, setScheduleFormState] = useState<ScheduleFormState>({
    title: '',
    teacherId: '',
    classroomId: '',
    eventType: 'regular',
    dayOfWeek: '2',
    scheduledDate: todayString,
    startTime: '19:30',
    endTime: '21:30',
    startRecur: todayString,
    endRecur: '',
    notes: '',
    participantIds: [],
  })

  const [attendanceModal, setAttendanceModal] =
    useState<AttendanceModalState | null>(null)
  const [attendanceStatuses, setAttendanceStatuses] = useState<
    Record<number, AttendanceStatus>
  >({})
  const [attendanceRosterIds, setAttendanceRosterIds] = useState<number[]>([])
  const [attendanceReviews, setAttendanceReviews] = useState<
    Record<number, AttendanceReviewFormState>
  >({})
  const [attendanceRemark, setAttendanceRemark] = useState('')
  const [attendanceExistingLog, setAttendanceExistingLog] =
    useState<LessonLogSummary | null>(null)
  const [attendanceLocked, setAttendanceLocked] = useState(false)
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  )
  const classroomMap = useMemo(
    () => new Map(classrooms.map((classroom) => [classroom.id, classroom])),
    [classrooms],
  )
  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )
  const classroomStudentMap = useMemo(() => {
    const nextMap = new Map<number, Student[]>()

    for (const student of students) {
      if (!student.classroomId) {
        continue
      }

      const existing = nextMap.get(student.classroomId) ?? []
      existing.push(student)
      nextMap.set(student.classroomId, existing)
    }

    return nextMap
  }, [students])
  const assignableTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.role === 'teacher'),
    [teachers],
  )
  const scheduleParticipantMap = useMemo(() => {
    const nextMap = new Map<number, number[]>()

    for (const membership of scheduleParticipants) {
      if (!membership.isActive) {
        continue
      }

      const existing = nextMap.get(membership.scheduleId) ?? []
      existing.push(membership.studentId)
      nextMap.set(membership.scheduleId, existing)
    }

    return nextMap
  }, [scheduleParticipants])
  const latestLessonLogMap = useMemo(
    () => getLatestLessonLogMap(lessonLogs),
    [lessonLogs],
  )

  const sessionOptions = useMemo<UserSession[]>(() => {
    const defaultTeacherId =
      teachers.find((teacher) => teacher.role === 'teacher')?.id ?? null

    return [
      {
        key: 'local-admin',
        role: 'admin',
        label: 'Local Admin Preview',
        teacherId: null,
      },
      {
        key: 'local-teacher',
        role: 'teacher',
        label: 'Local Teacher Preview',
        teacherId: defaultTeacherId,
      },
      ...teachers.map((teacher) => ({
        key: `teacher-${teacher.id}`,
        role: teacher.role,
        label:
          teacher.role === 'admin'
            ? `${teacher.fullName} (Admin)`
            : `${teacher.fullName} (Teacher)`,
        teacherId: teacher.id,
      })),
    ]
  }, [teachers])

  const currentSession =
    sessionOptions.find((session) => session.key === selectedSessionKey) ??
    sessionOptions[0]

  const currentAdminActorId =
    currentSession?.teacherId ??
    teachers.find((teacher) => teacher.username === 'admin_demo')?.id ??
    null

  const isAdminView = currentSession?.role !== 'teacher'
  const protectedTeacherIds = useMemo(() => {
    const next = new Set<number>()
    const bootstrapAdmin = teachers.find((teacher) => teacher.username === 'admin_demo')
    if (bootstrapAdmin) {
      next.add(bootstrapAdmin.id)
    }
    if (currentSession?.teacherId) {
      next.add(currentSession.teacherId)
    }
    return next
  }, [currentSession, teachers])
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null
  const selectedStudentDetail =
    students.find((student) => student.id === selectedStudentDetailId) ?? null
  const editingStudent =
    students.find((student) => student.id === editingStudentId) ?? null
  const editingTeacher =
    teachers.find((teacher) => teacher.id === editingTeacherId) ?? null
  const editingClassroom =
    classrooms.find((classroom) => classroom.id === editingClassroomId) ?? null
  const editingSchedule =
    schedules.find((schedule) => schedule.id === editingScheduleId) ?? null
  const scheduleLinkedClassroom =
    scheduleFormState.classroomId
      ? classroomMap.get(Number(scheduleFormState.classroomId)) ?? null
      : null
  const scheduleClassroomRoster =
    scheduleLinkedClassroom !== null
      ? classroomStudentMap.get(scheduleLinkedClassroom.id) ?? []
      : []

  useEffect(() => {
    if (!selectedSessionKey && sessionOptions[0]) {
      setSelectedSessionKey(sessionOptions[0].key)
      return
    }

    if (
      selectedSessionKey &&
      !sessionOptions.some((session) => session.key === selectedSessionKey) &&
      sessionOptions[0]
    ) {
      setSelectedSessionKey(sessionOptions[0].key)
    }
  }, [selectedSessionKey, sessionOptions])

  useEffect(() => {
    if (
      currentSession?.role === 'teacher' &&
      activeSection !== 'calendar' &&
      activeSection !== 'classrooms'
    ) {
      setActiveSection('calendar')
    }
  }, [activeSection, currentSession])

  useEffect(() => {
    if (!selectedStudent) {
      return
    }

    setStudentFormState({
      addHours: '0',
      lessonExpiryDate: selectedStudent.lessonExpiryDate,
      accountFeeExpiryDate: selectedStudent.accountFeeExpiryDate,
      miraiClubExpiryDate: selectedStudent.miraiClubExpiryDate,
      remark: '',
    })
  }, [selectedStudent])

  useEffect(() => {
    if (!isCreatingClassroom && !editingClassroom) {
      return
    }

    setClassroomFormState({
      name: editingClassroom?.name ?? '',
      ageGroup: editingClassroom?.ageGroup ?? selectedAgeGroup,
      programLevel: editingClassroom?.programLevel ?? programLevelOptions[0],
      teacherId: editingClassroom?.teacherId ? String(editingClassroom.teacherId) : '',
      notes: editingClassroom?.notes ?? '',
    })
  }, [editingClassroom, isCreatingClassroom, selectedAgeGroup])

  useEffect(() => {
    if (!isCreatingSchedule && !editingSchedule) {
      return
    }

    const currentParticipantIds =
      editingSchedule &&
      editingSchedule.eventType === 'replacement' &&
      scheduleParticipantMap.has(editingSchedule.id)
        ? (scheduleParticipantMap.get(editingSchedule.id) ?? []).map(String)
        : []

    setScheduleFormState(
      buildScheduleFormState(
        editingSchedule,
        todayString,
        currentSession?.teacherId ?? teachers[0]?.id ?? null,
        currentParticipantIds,
      ),
    )
  }, [
    currentSession,
    editingSchedule,
    isCreatingSchedule,
    scheduleParticipantMap,
    teachers,
    todayString,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadCoreData() {
      if (!isSupabaseConfigured) {
        setLoadError(
          'Supabase is not configured yet. Fill in .env.local, then restart npm run dev.',
        )
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setLoadError(null)

        const [
          nextClassrooms,
          nextTeachers,
          nextStudents,
          nextSchedules,
          nextParticipants,
          nextLessonLogs,
          nextLessonReviews,
          nextAdminActivities,
        ] = await Promise.all([
          fetchClassroomsFromSupabase(),
          fetchTeachersFromSupabase(),
          fetchStudentsFromSupabase(),
          fetchSchedulesFromSupabase(),
          fetchScheduleParticipantsFromSupabase(),
          fetchLessonLogSummariesFromSupabase(),
          fetchLessonLogStudentReviewsFromSupabase(),
          fetchAdminActivityFromSupabase(),
        ])

        if (!cancelled) {
          setClassrooms(nextClassrooms)
          setTeachers(nextTeachers)
          setStudents(nextStudents)
          setSchedules(nextSchedules)
          setScheduleParticipants(nextParticipants)
          setLessonLogs(nextLessonLogs)
          setLessonReviews(nextLessonReviews)
          setAdminActivities(nextAdminActivities)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getSupabaseLoadErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadCoreData()

    return () => {
      cancelled = true
    }
  }, [])

  const visibleSchedules = useMemo(() => {
    if (!currentSession) {
      return schedules
    }

    if (currentSession.role === 'teacher' && currentSession.teacherId !== null) {
      return schedules.filter(
        (schedule) => schedule.teacherId === currentSession.teacherId,
      )
    }

    if (currentSession.role === 'teacher' && currentSession.teacherId === null) {
      return []
    }

    return schedules
  }, [currentSession, schedules])

  const visibleClassrooms = useMemo(() => {
    if (!currentSession) {
      return classrooms
    }

    if (currentSession.role === 'teacher' && currentSession.teacherId !== null) {
      return classrooms.filter(
        (classroom) => classroom.teacherId === currentSession.teacherId,
      )
    }

    if (currentSession.role === 'teacher' && currentSession.teacherId === null) {
      return []
    }

    return classrooms
  }, [classrooms, currentSession])

  const calendarEvents = useMemo(
    () => [
      ...buildScheduleEvents(
        visibleSchedules,
        classroomMap,
        classroomStudentMap,
        teacherMap,
        scheduleParticipantMap,
        studentMap,
      ),
      ...malaysiaHolidayEvents,
    ],
    [
      classroomMap,
      classroomStudentMap,
      scheduleParticipantMap,
      studentMap,
      teacherMap,
      visibleSchedules,
    ],
  )

  const activeVisibleSchedules = visibleSchedules.filter(
    (schedule) => schedule.status === 'active',
  )
  const activeVisibleClassrooms = visibleClassrooms.filter(
    (classroom) => classroom.status === 'active',
  )
  const activeClassroomSchedules = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'regular' && schedule.classroomId !== null,
  )
  const regularCount = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'regular',
  ).length
  const replacementCount = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'replacement',
  ).length
  const visibleTeacherCount =
    currentSession?.role === 'teacher'
      ? 1
      : new Set(activeVisibleSchedules.map((schedule) => schedule.teacherId)).size

  const hasAutoSelectedClassroomFilterRef = useRef(false)

  useEffect(() => {
    if (hasAutoSelectedClassroomFilterRef.current || activeVisibleClassrooms.length === 0) {
      return
    }

    hasAutoSelectedClassroomFilterRef.current = true

    const currentComboHasClassrooms = activeVisibleClassrooms.some(
      (classroom) => classroom.ageGroup === selectedAgeGroup,
    )

    if (!currentComboHasClassrooms) {
      const firstClassroom = activeVisibleClassrooms[0]
      setSelectedAgeGroup(firstClassroom.ageGroup)
    }
  }, [activeVisibleClassrooms, selectedAgeGroup])

  useEffect(() => {
    const filtered = activeVisibleClassrooms.filter(
      (classroom) => classroom.ageGroup === selectedAgeGroup,
    )

    if (!selectedClassroomId && filtered[0]) {
      setSelectedClassroomId(filtered[0].id)
      return
    }

    if (
      selectedClassroomId !== null &&
      !filtered.some((classroom) => classroom.id === selectedClassroomId)
    ) {
      setSelectedClassroomId(filtered[0]?.id ?? null)
    }
  }, [activeVisibleClassrooms, selectedAgeGroup, selectedClassroomId])

  const navItems =
    currentSession?.role === 'teacher'
      ? [
          { key: 'calendar', label: 'Calendar', icon: CalendarBlank },
          { key: 'classrooms', label: 'My Classroom', icon: Chalkboard },
        ]
      : [
          { key: 'calendar', label: 'Calendar', icon: CalendarBlank },
          { key: 'classrooms', label: 'My Classroom', icon: Chalkboard },
          { key: 'students', label: 'Students', icon: GraduationCap },
          { key: 'teachers', label: 'My Teacher', icon: IdentificationBadge },
          { key: 'activity', label: 'Activity Log', icon: ClockCounterClockwise },
        ]

  const attendanceRoster = useMemo(() => {
    if (!attendanceModal) {
      return []
    }

    return attendanceRosterIds
      .map((studentId) => studentMap.get(studentId))
      .filter((student): student is Student => Boolean(student))
  }, [attendanceModal, attendanceRosterIds, studentMap])

  function updateStudentForm<K extends keyof RenewalFormState>(
    key: K,
    value: RenewalFormState[K],
  ) {
    setStudentFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateCreateStudentForm<K extends keyof CreateStudentFormState>(
    key: K,
    value: CreateStudentFormState[K],
  ) {
    setCreateStudentFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateCreateTeacherForm<K extends keyof CreateTeacherFormState>(
    key: K,
    value: CreateTeacherFormState[K],
  ) {
    setCreateTeacherFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateStudentDetailsForm<K extends keyof StudentDetailsFormState>(
    key: K,
    value: StudentDetailsFormState[K],
  ) {
    setStudentDetailsFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateClassroomForm<K extends keyof ClassroomFormState>(
    key: K,
    value: ClassroomFormState[K],
  ) {
    setClassroomFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateScheduleForm<K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ) {
    setScheduleFormState((currentState) => ({
      ...currentState,
      [key]: value,
      ...(key === 'eventType' && value === 'replacement'
        ? {
            dayOfWeek: '',
            startRecur: '',
            endRecur: '',
          }
        : {}),
      ...(key === 'eventType' && value === 'regular'
        ? {
            scheduledDate: todayString,
            dayOfWeek: currentState.dayOfWeek || '2',
            startRecur: currentState.startRecur || todayString,
          }
        : {}),
    }))
  }

  function toggleScheduleParticipant(studentId: string) {
    setScheduleFormState((currentState) => {
      const exists = currentState.participantIds.includes(studentId)
      return {
        ...currentState,
        participantIds: exists
          ? currentState.participantIds.filter((item) => item !== studentId)
          : [...currentState.participantIds, studentId],
      }
    })
  }

  function openStudentDetail(studentId: number) {
    setSelectedStudentDetailId(studentId)
  }

  function closeStudentDetail() {
    setSelectedStudentDetailId(null)
  }

  function openEditStudent(studentId: number) {
    const student = students.find((entry) => entry.id === studentId)
    if (!student) {
      return
    }

    setStudentDetailsSaveError(null)
    setEditingStudentId(studentId)
    setStudentDetailsFormState({
      fullName: student.name,
      classroomId: student.classroomId ? String(student.classroomId) : '',
      notes: student.notes ?? '',
      studentType: student.studentType,
    })
  }

  function closeEditStudent() {
    setEditingStudentId(null)
    setStudentDetailsSaveError(null)
  }

  function openStudentRenewal(studentId: number) {
    setStudentSaveError(null)
    setSelectedStudentId(studentId)
  }

  function closeStudentRenewal() {
    setSelectedStudentId(null)
    setStudentSaveError(null)
  }

  async function handleDeactivateStudent(studentId: number) {
    if (!supabase) {
      return
    }

    const student = students.find((item) => item.id === studentId)
    if (!student || !student.isActive) {
      return
    }

    const confirmed = await confirm(
      `Deactivate ${student.name}? This marks the student as not renewing and keeps the record visible in classroom views.`,
    )
    if (!confirmed) {
      return
    }

    try {
      setDeactivatingStudentId(studentId)
      setLoadError(null)

      const { error } = await supabase
        .from('students')
        .update({ is_active: false })
        .eq('id', studentId)

      if (error) {
        throw error
      }

      await recordAdminActivity(
        'student_deactivated',
        'student',
        student.id,
        student.name,
      )
      await refreshStudentsAndLogs()
      await refreshAdminActivities()
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to deactivate student.',
      )
    } finally {
      setDeactivatingStudentId(null)
    }
  }

  function openCreateStudentModal() {
    setCreateStudentSaveError(null)
    setIsCreateStudentOpen(true)
    setCreateStudentFormState({
      fullName: '',
      classroomId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      studentType: 'regular',
    })
  }

  function closeCreateStudentModal() {
    setIsCreateStudentOpen(false)
    setCreateStudentSaveError(null)
  }

  function openCreateTeacherModal() {
    setCreateTeacherSaveError(null)
    setEditingTeacherId(null)
    setIsCreateTeacherOpen(true)
    setCreateTeacherFormState({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
    })
  }

  function openEditTeacherModal(teacherId: number) {
    const teacher = teachers.find((entry) => entry.id === teacherId)
    if (!teacher) {
      return
    }

    setCreateTeacherSaveError(null)
    setEditingTeacherId(teacherId)
    setIsCreateTeacherOpen(true)
    setCreateTeacherFormState({
      username: teacher.username,
      fullName: teacher.fullName,
      email: teacher.email ?? '',
      phone: teacher.phone ?? '',
      role: teacher.role,
    })
  }

  function closeCreateTeacherModal() {
    setIsCreateTeacherOpen(false)
    setEditingTeacherId(null)
    setCreateTeacherSaveError(null)
  }

  function openCreateClassroom() {
    setClassroomSaveError(null)
    setEditingClassroomId(null)
    setIsCreatingClassroom(true)
    setClassroomFormState({
      name: '',
      ageGroup: selectedAgeGroup,
      programLevel: programLevelOptions[0],
      teacherId: '',
      notes: '',
    })
  }

  function openEditClassroom(classroomId: number) {
    setClassroomSaveError(null)
    setEditingClassroomId(classroomId)
    setIsCreatingClassroom(false)
  }

  function closeClassroomModal() {
    setEditingClassroomId(null)
    setIsCreatingClassroom(false)
    setClassroomSaveError(null)
  }

  function openCreateSchedule(prefillDate?: string, classroomId?: number) {
    setScheduleSaveError(null)
    setEditingScheduleId(null)
    setIsCreatingSchedule(true)

    const clickedDate = prefillDate ?? todayString
    const clickedDayOfWeek = String(parseLocalDate(clickedDate).getDay())
    const linkedClassroom =
      classroomId !== undefined ? classroomMap.get(classroomId) ?? null : null
    const linkedTeacherId = linkedClassroom?.teacherId ?? null

    setScheduleFormState({
      title: linkedClassroom?.name ?? '',
      teacherId:
        linkedTeacherId !== null
          ? String(linkedTeacherId)
          : currentSession?.role === 'teacher' && currentSession.teacherId
            ? String(currentSession.teacherId)
            : assignableTeachers[0]
              ? String(assignableTeachers[0].id)
              : '',
      classroomId: linkedClassroom ? String(linkedClassroom.id) : '',
      eventType: linkedClassroom ? 'regular' : 'replacement',
      dayOfWeek: clickedDayOfWeek,
      scheduledDate: clickedDate,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: clickedDate,
      endRecur: '',
      notes: '',
      participantIds: [],
    })
  }

  function openEditSchedule(scheduleId: number) {
    setScheduleSaveError(null)
    setIsCreatingSchedule(false)
    setEditingScheduleId(scheduleId)
  }

  function closeScheduleModal() {
    setIsCreatingSchedule(false)
    setEditingScheduleId(null)
    setScheduleSaveError(null)
  }

  async function refreshStudentsAndLogs() {
    const [nextStudents, nextLessonLogs, nextLessonReviews] = await Promise.all([
      fetchStudentsFromSupabase(),
      fetchLessonLogSummariesFromSupabase(),
      fetchLessonLogStudentReviewsFromSupabase(),
    ])
    setStudents(nextStudents)
    setLessonLogs(nextLessonLogs)
    setLessonReviews(nextLessonReviews)
  }

  async function refreshClassrooms() {
    const nextClassrooms = await fetchClassroomsFromSupabase()
    setClassrooms(nextClassrooms)
  }

  async function refreshSchedulesAndParticipants() {
    const [nextSchedules, nextParticipants] = await Promise.all([
      fetchSchedulesFromSupabase(),
      fetchScheduleParticipantsFromSupabase(),
    ])
    setSchedules(nextSchedules)
    setScheduleParticipants(nextParticipants)
  }

  async function refreshTeachers() {
    const nextTeachers = await fetchTeachersFromSupabase()
    setTeachers(nextTeachers)
  }

  async function refreshAdminActivities() {
    const nextActivities = await fetchAdminActivityFromSupabase()
    setAdminActivities(nextActivities)
  }

  async function recordAdminActivity(
    actionType: string,
    entityType: AdminActivity['entityType'],
    entityId: number | null,
    entityLabel: string,
    details: Record<string, string | number | boolean | null> = {},
  ) {
    if (!supabase) {
      return
    }

    const { error } = await supabase.rpc('record_admin_activity', {
      p_actor_teacher_id: currentAdminActorId,
      p_action_type: actionType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_entity_label: entityLabel,
      p_details: details,
    })

    if (error) {
      throw error
    }
  }

  async function syncRegularSchedulesWithClassroom(
    classroomId: number,
    classroomName: string,
    teacherId: number | null,
  ) {
    if (!supabase) {
      return
    }

    const payload: Database['public']['Tables']['schedules']['Update'] = {
      title: classroomName,
      ...(teacherId ? { teacher_id: teacherId } : {}),
    }

    const { error } = await supabase
      .from('schedules')
      .update(payload)
      .eq('classroom_id', classroomId)
      .eq('event_type', 'regular')

    if (error) {
      throw error
    }
  }

  async function assignStudentToClassroom(studentId: number, classroomId: number | null) {
    if (!supabase) {
      return
    }

    const teacherId = classroomId ? classroomMap.get(classroomId)?.teacherId ?? null : null

    const { error } = await supabase
      .from('students')
      .update({ classroom_id: classroomId, teacher_id: teacherId })
      .eq('id', studentId)

    if (error) {
      throw error
    }
  }

  async function handleStudentDetailsSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!editingStudent || !supabase) {
      return
    }

    const fullName = studentDetailsFormState.fullName.trim()
    if (!fullName) {
      setStudentDetailsSaveError('Please enter the student full name.')
      return
    }

    try {
      setIsSavingStudentDetails(true)
      setStudentDetailsSaveError(null)

      const editClassroomId = studentDetailsFormState.classroomId
        ? Number(studentDetailsFormState.classroomId)
        : null

      const { error } = await supabase.rpc('update_student_record', {
        p_student_id: editingStudent.id,
        p_full_name: fullName,
        p_teacher_id: editClassroomId
          ? classroomMap.get(editClassroomId)?.teacherId ?? null
          : null,
        p_classroom_id: editClassroomId,
        p_notes: studentDetailsFormState.notes.trim() || null,
        p_actor_teacher_id: currentAdminActorId,
        p_student_type: studentDetailsFormState.studentType,
      })

      if (error) {
        throw error
      }

      await Promise.all([
        refreshStudentsAndLogs(),
        refreshClassrooms(),
        refreshAdminActivities(),
      ])
      closeEditStudent()
    } catch (error) {
      setStudentDetailsSaveError(
        error instanceof Error ? error.message : 'Failed to update student details.',
      )
    } finally {
      setIsSavingStudentDetails(false)
    }
  }

  async function handleCreateStudentSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const fullName = createStudentFormState.fullName.trim()
    const initialHours = Number.parseInt(createStudentFormState.initialHours, 10)

    if (!fullName) {
      setCreateStudentSaveError('Please enter the student full name.')
      return
    }

    if (!createStudentFormState.lessonExpiryDate) {
      setCreateStudentSaveError('Please select the lesson expiry date.')
      return
    }

    if (!createStudentFormState.accountFeeExpiryDate) {
      setCreateStudentSaveError('Please select the Account Fee expiry date.')
      return
    }

    if (!createStudentFormState.miraiClubExpiryDate) {
      setCreateStudentSaveError('Please select the Mirai Club expiry date.')
      return
    }

    try {
      setIsCreatingStudentRecord(true)
      setCreateStudentSaveError(null)

      const { data, error } = await supabase.rpc('create_student_record', {
        p_full_name: fullName,
        p_teacher_id: null,
        p_initial_hours:
          Number.isFinite(initialHours) && initialHours > 0 ? initialHours : 0,
        p_lesson_expiry_date: createStudentFormState.lessonExpiryDate,
        p_account_fee_expiry_date: createStudentFormState.accountFeeExpiryDate,
        p_mirai_club_expiry_date: createStudentFormState.miraiClubExpiryDate,
        p_notes: createStudentFormState.notes.trim() || null,
        p_actor_teacher_id: currentAdminActorId,
        p_student_type: createStudentFormState.studentType,
      })

      if (error) {
        throw error
      }

      const createdStudentId = data?.[0]?.student_id
      if (createdStudentId) {
        await assignStudentToClassroom(
          createdStudentId,
          createStudentFormState.classroomId
            ? Number(createStudentFormState.classroomId)
            : null,
        )
        await recordAdminActivity('student_created', 'student', createdStudentId, fullName, {
          classroom_id: createStudentFormState.classroomId
            ? Number(createStudentFormState.classroomId)
            : null,
        })
      }

      await Promise.all([
        refreshStudentsAndLogs(),
        refreshClassrooms(),
        refreshAdminActivities(),
      ])
      closeCreateStudentModal()
    } catch (error) {
      setCreateStudentSaveError(
        error instanceof Error ? error.message : 'Failed to create student record.',
      )
    } finally {
      setIsCreatingStudentRecord(false)
    }
  }

  async function handleCreateTeacherSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const username = createTeacherFormState.username.trim()
    const fullName = createTeacherFormState.fullName.trim()

    if (!username) {
      setCreateTeacherSaveError('Please enter the teacher username.')
      return
    }

    if (!fullName) {
      setCreateTeacherSaveError('Please enter the teacher full name.')
      return
    }

    try {
      setIsCreatingTeacherRecord(true)
      setCreateTeacherSaveError(null)

      const { data, error } = editingTeacher
        ? await supabase.rpc('update_teacher_record', {
            p_teacher_id: editingTeacher.id,
            p_username: username,
            p_full_name: fullName,
            p_email: createTeacherFormState.email.trim() || null,
            p_phone: createTeacherFormState.phone.trim() || null,
            p_role: createTeacherFormState.role,
            p_actor_teacher_id: currentAdminActorId,
          })
        : await supabase.rpc('create_teacher_record', {
            p_username: username,
            p_full_name: fullName,
            p_email: createTeacherFormState.email.trim() || null,
            p_phone: createTeacherFormState.phone.trim() || null,
            p_role: createTeacherFormState.role,
          })

      if (error) {
        throw error
      }

      if (!editingTeacher) {
        const createdTeacherId = data?.[0]?.teacher_id ?? null
        await recordAdminActivity(
          'teacher_created',
          'teacher',
          createdTeacherId,
          fullName,
          { role: createTeacherFormState.role },
        )
      }

      await Promise.all([refreshTeachers(), refreshAdminActivities()])
      closeCreateTeacherModal()
    } catch (error) {
      setCreateTeacherSaveError(
        error instanceof Error ? error.message : 'Failed to save teacher record.',
      )
    } finally {
      setIsCreatingTeacherRecord(false)
    }
  }

  async function handleDeleteTeacher(teacherId: number) {
    if (!supabase) {
      return
    }

    const teacher = teachers.find((entry) => entry.id === teacherId)
    if (!teacher) {
      return
    }

    if (protectedTeacherIds.has(teacherId) || teacher.username === 'admin_demo') {
      showToast('This teacher account is protected and cannot be deleted.')
      return
    }

    if (
      !(await confirm(
        `Delete teacher account "${teacher.fullName}"? This only works when no classroom, schedule, or history still references the account.`,
      ))
    ) {
      return
    }

    try {
      setDeletingTeacherId(teacherId)

      const [
        { count: classroomCount, error: classroomError },
        { data: linkedSchedules, error: scheduleError },
        { count: lessonLogCount, error: lessonLogError },
        { count: adminLedgerCount, error: adminLedgerError },
      ] = await Promise.all([
        supabase
          .from('classrooms')
          .select('id', { head: true, count: 'exact' })
          .eq('teacher_id', teacherId),
        supabase
          .from('schedules')
          .select('id')
          .eq('teacher_id', teacherId),
        supabase
          .from('lesson_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('teacher_id', teacherId),
        supabase
          .from('student_admin_ledger')
          .select('id', { head: true, count: 'exact' })
          .eq('actor_teacher_id', teacherId),
      ])

      if (classroomError) throw classroomError
      if (scheduleError) throw scheduleError
      if (lessonLogError) throw lessonLogError
      if (adminLedgerError) throw adminLedgerError

      if ((classroomCount ?? 0) > 0) {
        const { error: unassignClassroomError } = await supabase
          .from('classrooms')
          .update({ teacher_id: null })
          .eq('teacher_id', teacherId)

        if (unassignClassroomError) {
          throw unassignClassroomError
        }
      }

      const linkedScheduleIds = (linkedSchedules ?? []).map((schedule) => schedule.id)

      if (linkedScheduleIds.length > 0) {
        const { data: linkedLessonLogs, error: linkedLessonLogsError } = await supabase
          .from('lesson_logs')
          .select('schedule_id')
          .in('schedule_id', linkedScheduleIds)

        if (linkedLessonLogsError) {
          throw linkedLessonLogsError
        }

        const scheduleIdsWithHistory = new Set(
          (linkedLessonLogs ?? []).map((entry) => entry.schedule_id),
        )
        const removableScheduleIds = linkedScheduleIds.filter(
          (scheduleId) => !scheduleIdsWithHistory.has(scheduleId),
        )
        const historicalScheduleIds = linkedScheduleIds.filter((scheduleId) =>
          scheduleIdsWithHistory.has(scheduleId),
        )

        if (removableScheduleIds.length > 0) {
          const { error: scheduleMembershipError } = await supabase
            .from('schedule_students')
            .delete()
            .in('schedule_id', removableScheduleIds)

          if (scheduleMembershipError) {
            throw scheduleMembershipError
          }

          const { error: scheduleDeleteError } = await supabase
            .from('schedules')
            .delete()
            .in('id', removableScheduleIds)

          if (scheduleDeleteError) {
            throw scheduleDeleteError
          }
        }

        if (historicalScheduleIds.length > 0) {
          const { error: scheduleCancelError } = await supabase
            .from('schedules')
            .update({ status: 'cancelled' })
            .in('id', historicalScheduleIds)

          if (scheduleCancelError) {
            throw scheduleCancelError
          }
        }
      }

      if ((lessonLogCount ?? 0) > 0 || (adminLedgerCount ?? 0) > 0) {
        const { error: archiveError } = await supabase
          .from('teachers')
          .update({
            is_active: false,
            email: null,
            phone: null,
          })
          .eq('id', teacherId)

        if (archiveError) {
          throw archiveError
        }
      } else {
        const { error } = await supabase.from('teachers').delete().eq('id', teacherId)
        if (error) {
          throw error
        }
      }

      await recordAdminActivity(
        'teacher_deleted',
        'teacher',
        teacherId,
        teacher.fullName,
        { retained_for_history: (lessonLogCount ?? 0) > 0 || (adminLedgerCount ?? 0) > 0 },
      )

      await Promise.all([
        refreshTeachers(),
        refreshClassrooms(),
        refreshSchedulesAndParticipants(),
        refreshStudentsAndLogs(),
        refreshAdminActivities(),
      ])
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to delete teacher account.',
      )
    } finally {
      setDeletingTeacherId(null)
    }
  }

  async function handleClassroomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const name = classroomFormState.name.trim()
    const teacherId = classroomFormState.teacherId
      ? Number(classroomFormState.teacherId)
      : null

    if (!name) {
      setClassroomSaveError('Please enter the classroom name.')
      return
    }

    if (!teacherId) {
      setClassroomSaveError('Please assign a teacher to this classroom.')
      return
    }

    const payload: Database['public']['Tables']['classrooms']['Update'] = {
      name,
      age_group: classroomFormState.ageGroup,
      program_level: classroomFormState.programLevel,
      teacher_id: teacherId,
      notes: classroomFormState.notes.trim() || null,
      status: 'active',
    }

    try {
      setIsSavingClassroom(true)
      setClassroomSaveError(null)

      if (isCreatingClassroom) {
        const { data, error } = await supabase
          .from('classrooms')
          .insert(payload as Database['public']['Tables']['classrooms']['Insert'])
          .select('id')
          .single()

        if (error) {
          throw error
        }

        await recordAdminActivity(
          'classroom_created',
          'classroom',
          data.id,
          name,
          {
            age_group: classroomFormState.ageGroup,
            program_level: classroomFormState.programLevel,
            teacher_id: teacherId,
          },
        )
      } else if (editingClassroom) {
        const { error } = await supabase
          .from('classrooms')
          .update(payload)
          .eq('id', editingClassroom.id)

        if (error) {
          throw error
        }

        await syncRegularSchedulesWithClassroom(editingClassroom.id, name, teacherId)
        await recordAdminActivity(
          'classroom_updated',
          'classroom',
          editingClassroom.id,
          name,
          {
            age_group: classroomFormState.ageGroup,
            program_level: classroomFormState.programLevel,
            teacher_id: teacherId,
          },
        )
      }

      await Promise.all([
        refreshClassrooms(),
        refreshSchedulesAndParticipants(),
        refreshAdminActivities(),
      ])
      closeClassroomModal()
    } catch (error) {
      setClassroomSaveError(
        error instanceof Error ? error.message : 'Failed to save classroom.',
      )
    } finally {
      setIsSavingClassroom(false)
    }
  }

  async function handleDeleteClassroom(classroomId: number) {
    if (!supabase) {
      return
    }

    const classroom = classrooms.find((entry) => entry.id === classroomId)
    if (!classroom) {
      return
    }

    if (
      !(await confirm(
        `Delete classroom "${classroom.name}"? It will disappear from active classrooms and move to Classroom Archive. Existing details and students will be retained.`,
      ))
    ) {
      return
    }

    try {
      setDeletingClassroomId(classroomId)

      const { error } = await supabase.rpc('archive_classroom', {
        p_classroom_id: classroomId,
        p_actor_teacher_id: currentAdminActorId,
      })

      if (error) {
        throw error
      }

      if (selectedClassroomId === classroomId) {
        setSelectedClassroomId(null)
      }

      await Promise.all([
        refreshClassrooms(),
        refreshSchedulesAndParticipants(),
        refreshStudentsAndLogs(),
        refreshAdminActivities(),
      ])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete classroom.')
    } finally {
      setDeletingClassroomId(null)
    }
  }

  async function handleRestoreClassroom(classroomId: number) {
    if (!supabase) {
      return
    }

    try {
      setRestoringClassroomId(classroomId)
      const { error } = await supabase.rpc('restore_classroom', {
        p_classroom_id: classroomId,
        p_actor_teacher_id: currentAdminActorId,
      })

      if (error) {
        throw error
      }

      await Promise.all([refreshClassrooms(), refreshAdminActivities()])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to restore classroom.')
    } finally {
      setRestoringClassroomId(null)
    }
  }

  async function handleStudentRenewalSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!selectedStudent || !supabase) {
      return
    }

    const parsedHours = Number.parseInt(studentFormState.addHours, 10)
    const hoursToAdd =
      Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 0

    try {
      setIsSavingStudent(true)
      setStudentSaveError(null)

      const { error } = await supabase.rpc('renew_student_record', {
        p_student_id: selectedStudent.id,
        p_add_hours: hoursToAdd,
        p_new_lesson_expiry_date:
          studentFormState.lessonExpiryDate || selectedStudent.lessonExpiryDate,
        p_new_account_fee_expiry_date:
          studentFormState.accountFeeExpiryDate ||
          selectedStudent.accountFeeExpiryDate,
        p_new_mirai_club_expiry_date:
          studentFormState.miraiClubExpiryDate ||
          selectedStudent.miraiClubExpiryDate,
        p_remark: studentFormState.remark.trim() || null,
        p_actor_teacher_id: currentAdminActorId,
      })

      if (error) {
        throw error
      }

      if (!selectedStudent.isActive) {
        const { error: reactivateError } = await supabase
          .from('students')
          .update({ is_active: true })
          .eq('id', selectedStudent.id)

        if (reactivateError) {
          throw reactivateError
        }
      }

      await recordAdminActivity(
        'student_renewed',
        'student',
        selectedStudent.id,
        selectedStudent.name,
        {
          classes_added: hoursToAdd,
          lesson_expiry: studentFormState.lessonExpiryDate,
          account_fee_expiry: studentFormState.accountFeeExpiryDate,
          mirai_club_expiry: studentFormState.miraiClubExpiryDate,
        },
      )

      await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
      closeStudentRenewal()
    } catch (error) {
      setStudentSaveError(
        error instanceof Error ? error.message : 'Failed to save renewal.',
      )
    } finally {
      setIsSavingStudent(false)
    }
  }

  async function syncScheduleParticipants(scheduleId: number, participantIds: number[]) {
    if (!supabase) {
      return
    }

    const existing = scheduleParticipants.filter(
      (membership) => membership.scheduleId === scheduleId,
    )
    const existingIds = new Set(existing.map((membership) => membership.studentId))
    const nextIds = new Set(participantIds)

    const rowsToUpsert = participantIds.map((studentId) => ({
      schedule_id: scheduleId,
      student_id: studentId,
      is_active: true,
    }))

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from('schedule_students')
        .upsert(rowsToUpsert, {
          onConflict: 'schedule_id,student_id',
        })

      if (error) {
        throw error
      }
    }

    const idsToDeactivate = [...existingIds].filter((id) => !nextIds.has(id))
    if (idsToDeactivate.length > 0) {
      const { error } = await supabase
        .from('schedule_students')
        .update({ is_active: false })
        .eq('schedule_id', scheduleId)
        .in('student_id', idsToDeactivate)

      if (error) {
        throw error
      }
    }

    const { data: nextParticipants, error: participantError } = await supabase
      .from('schedule_students')
      .select('id, schedule_id, student_id, is_active')
      .order('schedule_id')

    if (participantError) {
      throw participantError
    }

    setScheduleParticipants(nextParticipants.map(mapScheduleParticipantRow))
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const participantIds = scheduleFormState.participantIds.map(Number)
    const linkedClassroom =
      scheduleFormState.classroomId
        ? classroomMap.get(Number(scheduleFormState.classroomId)) ?? null
        : null

    let teacherId = Number(scheduleFormState.teacherId)
    let title = scheduleFormState.title.trim()

    if (scheduleFormState.eventType === 'regular') {
      if (!linkedClassroom) {
        setScheduleSaveError('Please select a classroom for this regular schedule.')
        return
      }

      if (!linkedClassroom.teacherId) {
        setScheduleSaveError(
          'This classroom needs an assigned teacher before setting the weekly timetable.',
        )
        return
      }

      teacherId = linkedClassroom.teacherId
      title = linkedClassroom.name
    } else {
      if (!teacherId) {
        setScheduleSaveError('Please select a teacher for this replacement schedule.')
        return
      }

      if (!title) {
        setScheduleSaveError('Please enter a title for this replacement schedule.')
        return
      }

      if (participantIds.length === 0) {
        setScheduleSaveError(
          'Please assign at least one student for the replacement class.',
        )
        return
      }
    }

    const payload: Database['public']['Tables']['schedules']['Update'] = {
      teacher_id: teacherId,
      student_id:
        scheduleFormState.eventType === 'replacement' ? participantIds[0] ?? null : null,
      classroom_id:
        scheduleFormState.eventType === 'regular' && linkedClassroom
          ? linkedClassroom.id
          : null,
      title,
      event_type: scheduleFormState.eventType,
      recurrence_type:
        scheduleFormState.eventType === 'regular' ? 'weekly' : 'none',
      day_of_week:
        scheduleFormState.eventType === 'regular'
          ? Number(scheduleFormState.dayOfWeek)
          : null,
      scheduled_date:
        scheduleFormState.eventType === 'replacement'
          ? scheduleFormState.scheduledDate
          : null,
      start_time: `${scheduleFormState.startTime}:00`,
      end_time: `${scheduleFormState.endTime}:00`,
      start_recur:
        scheduleFormState.eventType === 'regular'
          ? scheduleFormState.startRecur
          : null,
      end_recur:
        scheduleFormState.eventType === 'regular' &&
        scheduleFormState.endRecur.trim()
          ? scheduleFormState.endRecur
          : null,
      notes: scheduleFormState.notes.trim() || null,
      status: 'active',
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      if (isCreatingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .insert(payload as Database['public']['Tables']['schedules']['Insert'])
          .select(
            'id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
          )
          .single()

        if (error) {
          throw error
        }

        const nextSchedule = mapScheduleRow(data)
        setSchedules((currentSchedules) =>
          [...currentSchedules, nextSchedule].sort((left, right) =>
            left.title.localeCompare(right.title),
          ),
        )
        if (scheduleFormState.eventType === 'replacement') {
          await syncScheduleParticipants(nextSchedule.id, participantIds)
        } else {
          await refreshSchedulesAndParticipants()
        }
        await recordAdminActivity(
          'schedule_created',
          'schedule',
          nextSchedule.id,
          nextSchedule.title,
          { event_type: nextSchedule.eventType, teacher_id: nextSchedule.teacherId },
        )
      } else if (editingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .update(payload)
          .eq('id', editingSchedule.id)
          .select(
            'id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
          )
          .single()

        if (error) {
          throw error
        }

        const updatedSchedule = mapScheduleRow(data)
        setSchedules((currentSchedules) =>
          currentSchedules.map((schedule) =>
            schedule.id === updatedSchedule.id ? updatedSchedule : schedule,
          ),
        )
        if (scheduleFormState.eventType === 'replacement') {
          await syncScheduleParticipants(updatedSchedule.id, participantIds)
        } else {
          await refreshSchedulesAndParticipants()
        }
        await recordAdminActivity(
          'schedule_updated',
          'schedule',
          updatedSchedule.id,
          updatedSchedule.title,
          { event_type: updatedSchedule.eventType, teacher_id: updatedSchedule.teacherId },
        )
      }

      await refreshAdminActivities()
      closeScheduleModal()
    } catch (error) {
      setScheduleSaveError(
        error instanceof Error ? error.message : 'Failed to save schedule.',
      )
    } finally {
      setIsSavingSchedule(false)
    }
  }

  async function handleCancelSchedule() {
    if (!editingSchedule || !supabase) {
      return
    }

    if (!(await confirm('Cancel this schedule from the timetable?'))) {
      return
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      const { data, error } = await supabase
        .from('schedules')
        .update({ status: 'cancelled' })
        .eq('id', editingSchedule.id)
        .select(
          'id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
        )
        .single()

      if (error) {
        throw error
      }

      const cancelledSchedule = mapScheduleRow(data)
      setSchedules((currentSchedules) =>
        currentSchedules.map((schedule) =>
          schedule.id === cancelledSchedule.id ? cancelledSchedule : schedule,
        ),
      )

      await recordAdminActivity(
        'schedule_cancelled',
        'schedule',
        cancelledSchedule.id,
        cancelledSchedule.title,
      )
      await refreshAdminActivities()

      closeScheduleModal()
    } catch (error) {
      setScheduleSaveError(
        error instanceof Error ? error.message : 'Failed to cancel schedule.',
      )
    } finally {
      setIsSavingSchedule(false)
    }
  }

  function getScheduleRosterStudentIds(scheduleId: number) {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) {
      return []
    }

    if (schedule.eventType === 'regular') {
      return schedule.classroomId
        ? (classroomStudentMap.get(schedule.classroomId) ?? []).map(
            (student) => student.id,
          )
        : []
    }

    return scheduleParticipantMap.get(scheduleId) ?? []
  }

  async function openAttendanceForEvent(
    scheduleId: number,
    occurrenceDate: string,
    title: string,
  ) {
    setAttendanceSaveError(null)
    setAttendanceModal({
      scheduleId,
      occurrenceDate,
      title,
    })
    setAttendanceRemark('')
    setAttendanceStatuses({})
    setAttendanceRosterIds([])
    setAttendanceReviews({})
    setAttendanceExistingLog(null)
    setAttendanceLocked(false)

    try {
      setIsLoadingAttendance(true)
      const { summary, students: latestAttendanceRows, reviews: latestReviewRows } =
        await fetchLatestLessonLogStudents(scheduleId, occurrenceDate)

      const rosterIds = summary
        ? latestAttendanceRows.map((row) => row.studentId)
        : getScheduleRosterStudentIds(scheduleId)
      const nextStatuses: Record<number, AttendanceStatus> = {}
      const nextReviews: Record<number, AttendanceReviewFormState> = {}

      for (const studentId of rosterIds) {
        nextStatuses[studentId] = 'present'
        nextReviews[studentId] = createEmptyAttendanceReviewForm()
      }

      for (const row of latestAttendanceRows) {
        nextStatuses[row.studentId] = row.attendanceStatus
      }

      for (const review of latestReviewRows) {
        nextReviews[review.studentId] = mapReviewToFormState(review)
      }

      setAttendanceStatuses(nextStatuses)
      setAttendanceRosterIds(rosterIds)
      setAttendanceReviews(nextReviews)
      setAttendanceExistingLog(summary)
      setAttendanceRemark(summary?.lessonRemark ?? '')

      if (summary) {
        const editableUntil =
          new Date(summary.submittedAt).getTime() + 24 * 60 * 60 * 1000
        setAttendanceLocked(Date.now() > editableUntil)
      }
    } catch (error) {
      setAttendanceSaveError(
        error instanceof Error ? error.message : 'Failed to load attendance log.',
      )
    } finally {
      setIsLoadingAttendance(false)
    }
  }

  function closeAttendanceModal() {
    setAttendanceModal(null)
    setAttendanceSaveError(null)
    setAttendanceRemark('')
    setAttendanceStatuses({})
    setAttendanceRosterIds([])
    setAttendanceReviews({})
    setAttendanceExistingLog(null)
    setAttendanceLocked(false)
  }

  function updateAttendanceReviewScore(
    studentId: number,
    scoreField: ReviewScoreField,
    remarkField: ReviewRemarkField,
    score: number,
  ) {
    setAttendanceReviews((currentState) => ({
      ...currentState,
      [studentId]: {
        ...(currentState[studentId] ?? createEmptyAttendanceReviewForm()),
        [scoreField]: score,
        ...(score >= 3 ? { [remarkField]: '' } : {}),
      },
    }))
  }

  function updateAttendanceReviewRemark(
    studentId: number,
    remarkField: ReviewRemarkField,
    remark: string,
  ) {
    setAttendanceReviews((currentState) => ({
      ...currentState,
      [studentId]: {
        ...(currentState[studentId] ?? createEmptyAttendanceReviewForm()),
        [remarkField]: remark,
      },
    }))
  }

  async function handleAttendanceSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!attendanceModal || !supabase || !currentSession?.teacherId) {
      return
    }

    const studentNameById = new Map(
      Array.from(studentMap.entries()).map(([id, student]) => [id, student.name]),
    )
    const submission = buildAttendanceSubmission(
      attendanceRosterIds,
      attendanceStatuses,
      attendanceReviews,
      studentNameById,
    )

    if (!submission.ok) {
      setAttendanceSaveError(submission.error)
      return
    }

    try {
      setIsSavingAttendance(true)
      setAttendanceSaveError(null)

      const { error } = await supabase.rpc('submit_lesson_attendance', {
        p_schedule_id: attendanceModal.scheduleId,
        p_occurrence_date: attendanceModal.occurrenceDate,
        p_teacher_id: currentSession.teacherId,
        p_lesson_remark: attendanceRemark.trim() || null,
        p_attendance: submission.payload,
        p_student_reviews: submission.reviewPayload,
      })

      if (error) {
        throw error
      }

      await refreshStudentsAndLogs()
      closeAttendanceModal()
    } catch (error) {
      setAttendanceSaveError(
        error instanceof Error ? error.message : 'Failed to submit attendance.',
      )
    } finally {
      setIsSavingAttendance(false)
    }
  }

  function renderCalendarEventContent(eventInfo: EventContentArg) {
    if (eventInfo.event.extendedProps.isHoliday) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-500 px-2 py-1.5 text-white shadow-sm">
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-red-700">
            Public Holiday
          </span>
          <div className="mt-1 text-[11px] font-semibold leading-snug">
            {eventInfo.event.title}
          </div>
        </div>
      )
    }

    const eventType = eventInfo.event.extendedProps.eventType as
      | 'regular'
      | 'replacement'
    const teacherName = eventInfo.event.extendedProps.teacherName as string
    const participantNames = eventInfo.event.extendedProps.participantNames as string
    const scheduleId = Number(eventInfo.event.extendedProps.scheduleId)
    const occurrenceDate = eventInfo.event.start
      ? getDateKeyFromDate(eventInfo.event.start)
      : ''
    const completed = latestLessonLogMap.has(`${scheduleId}:${occurrenceDate}`)

    return (
      <div
        className={cn(
          'rounded-lg border px-2 py-1.5 shadow-sm',
          eventType === 'regular' && !completed && 'border-sky-200 bg-sky-500 text-white',
          eventType === 'replacement' &&
            !completed &&
            'border-orange-200 bg-orange-500 text-white',
          eventType === 'regular' &&
            completed &&
            'border-sky-200 bg-sky-100 text-sky-700 opacity-75',
          eventType === 'replacement' &&
            completed &&
            'border-orange-200 bg-orange-100 text-orange-700 opacity-75',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
              eventType === 'regular' && !completed && 'bg-sky-100 text-sky-700',
              eventType === 'replacement' &&
                !completed &&
                'bg-orange-100 text-orange-700',
              completed && 'bg-white/80 text-slate-600',
            )}
          >
            {completed
              ? 'Completed'
              : eventType === 'regular'
                ? 'Regular'
                : 'Replacement'}
          </span>
          <span
            className={cn(
              'text-[10px] font-medium',
              completed ? 'text-slate-500' : 'text-white/90',
            )}
          >
            {eventInfo.timeText}
          </span>
        </div>
        <div
          className={cn(
            'mt-1 text-[11px] font-semibold leading-snug',
            completed ? 'text-slate-700' : 'text-white',
          )}
        >
          {eventInfo.event.title}
        </div>
        <div
          className={cn(
            'mt-0.5 text-[10px]',
            completed ? 'text-slate-500' : 'text-white/90',
          )}
        >
          {teacherName}
        </div>
        <div
          className={cn(
            'mt-0.5 truncate text-[10px]',
            completed ? 'text-slate-400' : 'text-white/80',
          )}
        >
          {participantNames}
        </div>
      </div>
    )
  }

  return (
    <main className="compact-admin min-h-screen bg-[#f3f4f6] pb-20 text-slate-900 lg:pb-0">
      {confirmDialog}
      {toastHost}
      <div className="flex min-h-screen">
        <aside className="hidden w-[220px] shrink-0 bg-[#2f2f2f] text-white lg:flex lg:flex-col">
          <div className="flex flex-col items-center gap-1 border-b border-white/10 px-4 py-4">
            <img src={miraiLogo} alt="Mirai AI School" className="h-24 w-auto" />
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              Teaching System
            </div>
          </div>

          <div className="px-3 py-3">
            <div className="rounded-xl bg-[#fc0c97] px-3 py-2.5">
              <div className="text-sm font-semibold">
                {currentSession?.role === 'teacher'
                  ? 'Teacher Workspace'
                  : 'Admin Workspace'}
              </div>
              <div className="mt-1 text-xs text-white/85">
                {currentSession?.role === 'teacher'
                  ? 'Calendar, attendance, and classroom overview'
                  : 'Calendar, attendance, and student control center'}
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => {
              const active = activeSection === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key as AppSection)}
                  className={cn(
                    'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                    active
                      ? 'bg-white text-[#be185d]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <item.icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  <span className="ml-3">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="border-t border-white/10 px-6 py-5 text-xs text-white/50">
            Phase 4 attendance flow - mobile ready
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#be185d]">
                  {activeSection === 'calendar'
                    ? 'Calendar Board'
                    : activeSection === 'classrooms'
                      ? 'Classroom Board'
                      : activeSection === 'teachers'
                        ? 'Teacher Board'
                        : activeSection === 'activity'
                          ? 'Admin Audit'
                          : 'Student Board'}
                </div>
                <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                  {activeSection === 'calendar'
                    ? 'Classes, Attendance & Timetable'
                    : activeSection === 'classrooms'
                      ? 'My Classroom'
                      : activeSection === 'teachers'
                        ? 'My Teacher'
                        : activeSection === 'activity'
                          ? 'Admin Activity Log'
                          : 'Student Classes & Expiry'}
                </h1>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  Local Date: {formatDate(todayString)}
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                  <span className="font-medium">View As</span>
                  <select
                    value={currentSession?.key ?? ''}
                    onChange={(event) => setSelectedSessionKey(event.target.value)}
                    className="!min-h-0 bg-transparent !p-0 text-xs font-semibold text-slate-900 outline-none"
                  >
                    {sessionOptions.map((session) => (
                      <option key={session.key} value={session.key}>
                        {session.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!isSupabaseConfigured && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
                    <WarningCircle size={16} weight="fill" aria-hidden="true" />
                    Setup Required
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-5">
            {loadError && (
              <section className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                <img
                  src={mascotEggy}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-auto shrink-0"
                />
                <div>
                  <div className="font-heading text-sm font-bold text-amber-900">
                    Eggy hit a snag
                  </div>
                  <div className="mt-0.5">{loadError}</div>
                </div>
              </section>
            )}

            {activeSection === 'calendar' && (
              <>
                <SummaryBar
                  metrics={[
                    {
                      label: 'Active Schedule Cards',
                      value: activeVisibleSchedules.length,
                    },
                    { label: 'Regular Classes', value: regularCount, tone: 'blue' },
                    {
                      label: 'Replacement Classes',
                      value: replacementCount,
                      tone: 'orange',
                    },
                    { label: 'Visible Teachers', value: visibleTeacherCount, tone: 'brand' },
                  ]}
                />

                <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          Full Calendar Timetable Board
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Blue = Regular Class. Orange = Replacement Class. Teachers
                          tap a card to take attendance. Completed lessons fade and
                          remain editable for 24 hours.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-sky-500" />
                          <span>Regular Class</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-orange-500" />
                          <span>Replacement Class</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-red-500" />
                          <span>Public Holiday</span>
                        </div>
                        {isAdminView && (
                          <button
                            type="button"
                            onClick={() => openCreateSchedule()}
                            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                          >
                            New Replacement Class
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4">
                    <FullCalendar
                      key={`calendar-${isMobile ? 'mobile' : 'desktop'}-${currentSession?.key ?? 'anon'}`}
                      plugins={[
                        dayGridPlugin,
                        timeGridPlugin,
                        listPlugin,
                        interactionPlugin,
                        rrulePlugin,
                      ]}
                      initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
                      headerToolbar={
                        isMobile
                          ? {
                              left: 'prev,next',
                              center: 'title',
                              right: 'dayGridMonth,listWeek',
                            }
                          : {
                              left: 'prev,next today',
                              center: 'title',
                              right: 'dayGridMonth,timeGridWeek,listWeek',
                            }
                      }
                      buttonText={{
                        today: 'Today',
                        dayGridMonth: 'Month',
                        timeGridWeek: 'Week',
                        listWeek: 'Agenda',
                      }}
                      height="auto"
                      timeZone="local"
                      events={calendarEvents}
                      dayMaxEvents={2}
                      nowIndicator
                      eventDisplay="block"
                      displayEventTime
                      eventTimeFormat={{
                        hour: 'numeric',
                        minute: '2-digit',
                        meridiem: 'short',
                      }}
                      dateClick={(arg: DateClickArg) => {
                        if (isAdminView) {
                          openCreateSchedule(arg.dateStr)
                        }
                      }}
                      eventClick={(arg: EventClickArg) => {
                        if (arg.event.extendedProps.isHoliday) {
                          return
                        }

                        const scheduleId = Number(arg.event.extendedProps.scheduleId)
                        const occurrenceDate = arg.event.start
                          ? getDateKeyFromDate(arg.event.start)
                          : todayString

                        if (isAdminView) {
                          openEditSchedule(scheduleId)
                          return
                        }

                        void openAttendanceForEvent(
                          scheduleId,
                          occurrenceDate,
                          arg.event.title,
                        )
                      }}
                      eventContent={renderCalendarEventContent}
                    />
                  </div>
                </section>
              </>
            )}

            {activeSection === 'classrooms' && (
              <ClassListingSection
                classrooms={visibleClassrooms}
                classroomStudentMap={classroomStudentMap}
                deletingClassroomId={deletingClassroomId}
                restoringClassroomId={restoringClassroomId}
                isAdminView={isAdminView}
                onDeleteClassroom={handleDeleteClassroom}
                onEditClassroom={openEditClassroom}
                onEditSchedule={openEditSchedule}
                onOpenCreateClassroom={isAdminView ? openCreateClassroom : undefined}
                onOpenCreateRegularSchedule={
                  isAdminView
                    ? (classroomId) => openCreateSchedule(undefined, classroomId)
                    : undefined
                }
                onOpenStudentDetail={openStudentDetail}
                onRestoreClassroom={handleRestoreClassroom}
                onSelectAgeGroup={setSelectedAgeGroup}
                schedules={activeClassroomSchedules}
                selectedAgeGroup={selectedAgeGroup}
                selectedClassroomId={selectedClassroomId}
                setSelectedClassroomId={setSelectedClassroomId}
                teacherMap={teacherMap}
                todayString={todayString}
              />
            )}

            {activeSection === 'students' && (
              <StudentDashboardSection
                activeFilter={studentFilter}
                deactivatingStudentId={deactivatingStudentId}
                isLoading={isLoading}
                students={students}
                todayString={todayString}
                onDeactivateStudent={handleDeactivateStudent}
                onEditStudent={openEditStudent}
                onOpenCreateStudent={openCreateStudentModal}
                onOpenStudentDetail={openStudentDetail}
                onOpenRenewal={openStudentRenewal}
                onToggleFilter={(filter) =>
                  setStudentFilter((currentFilter) =>
                    currentFilter === filter ? 'all' : filter,
                  )
                }
              />
            )}

            {activeSection === 'teachers' && isAdminView && (
              <TeacherManagementSection
                deletingTeacherId={deletingTeacherId}
                isLoading={isLoading}
                teachers={teachers}
                onDeleteTeacher={handleDeleteTeacher}
                onEditTeacher={openEditTeacherModal}
                onOpenCreateTeacher={openCreateTeacherModal}
                protectedTeacherIds={protectedTeacherIds}
              />
            )}

            {activeSection === 'activity' && isAdminView && (
              <AdminActivitySection
                activities={adminActivities}
                teacherMap={teacherMap}
              />
            )}
          </div>
        </section>
      </div>

      {editingStudent && (
        <EditStudentModal
          studentName={editingStudent.name}
          classrooms={classrooms}
          teacherMap={teacherMap}
          formState={studentDetailsFormState}
          saveError={studentDetailsSaveError}
          isSaving={isSavingStudentDetails}
          onClose={closeEditStudent}
          onSubmit={handleStudentDetailsSubmit}
          onFieldChange={updateStudentDetailsForm}
        />
      )}

      {isCreateStudentOpen && (
        <CreateStudentModal
          activeVisibleClassrooms={activeVisibleClassrooms}
          teacherMap={teacherMap}
          formState={createStudentFormState}
          saveError={createStudentSaveError}
          isSaving={isCreatingStudentRecord}
          onClose={closeCreateStudentModal}
          onSubmit={handleCreateStudentSubmit}
          onFieldChange={updateCreateStudentForm}
        />
      )}

      {(isCreatingClassroom || editingClassroom) && (
        <ClassroomModal
          isCreating={isCreatingClassroom}
          editingClassroom={editingClassroom}
          assignableTeachers={assignableTeachers}
          formState={classroomFormState}
          saveError={classroomSaveError}
          isSaving={isSavingClassroom}
          onClose={closeClassroomModal}
          onSubmit={handleClassroomSubmit}
          onFieldChange={updateClassroomForm}
        />
      )}

      {isCreateTeacherOpen && (
        <TeacherModal
          editingTeacher={editingTeacher}
          formState={createTeacherFormState}
          saveError={createTeacherSaveError}
          isSaving={isCreatingTeacherRecord}
          onClose={closeCreateTeacherModal}
          onSubmit={handleCreateTeacherSubmit}
          onFieldChange={updateCreateTeacherForm}
        />
      )}

      {selectedStudentDetail && (
        <StudentDetailModal
          classrooms={classrooms}
          student={selectedStudentDetail}
          lessonLogs={lessonLogs}
          lessonReviews={lessonReviews}
          onClose={closeStudentDetail}
          schedules={schedules}
          teacherMap={teacherMap}
        />
      )}

      {selectedStudent && (
        <StudentRenewalModal
          student={selectedStudent}
          todayString={todayString}
          formState={studentFormState}
          saveError={studentSaveError}
          isSaving={isSavingStudent}
          onClose={closeStudentRenewal}
          onSubmit={handleStudentRenewalSubmit}
          onFieldChange={updateStudentForm}
        />
      )}

      {(isCreatingSchedule || editingSchedule) && (
        <ScheduleModal
          isCreatingSchedule={isCreatingSchedule}
          editingSchedule={editingSchedule}
          formState={scheduleFormState}
          saveError={scheduleSaveError}
          isSaving={isSavingSchedule}
          activeVisibleClassrooms={activeVisibleClassrooms}
          scheduleLinkedClassroom={scheduleLinkedClassroom}
          scheduleClassroomRoster={scheduleClassroomRoster}
          teacherMap={teacherMap}
          assignableTeachers={assignableTeachers}
          students={students}
          todayString={todayString}
          onClose={closeScheduleModal}
          onSubmit={handleScheduleSubmit}
          onFieldChange={updateScheduleForm}
          onToggleParticipant={toggleScheduleParticipant}
          onCancelSchedule={handleCancelSchedule}
        />
      )}

      {attendanceModal && (
        <AttendanceModal
          attendanceModal={attendanceModal}
          attendanceExistingLog={attendanceExistingLog}
          attendanceLocked={attendanceLocked}
          isLoadingAttendance={isLoadingAttendance}
          attendanceRoster={attendanceRoster}
          attendanceStatuses={attendanceStatuses}
          attendanceReviews={attendanceReviews}
          attendanceRemark={attendanceRemark}
          attendanceSaveError={attendanceSaveError}
          isSavingAttendance={isSavingAttendance}
          onClose={closeAttendanceModal}
          onSubmit={handleAttendanceSubmit}
          onSetStatus={(studentId, status) =>
            setAttendanceStatuses((current) => ({
              ...current,
              [studentId]: status,
            }))
          }
          onUpdateReviewScore={updateAttendanceReviewScore}
          onUpdateReviewRemark={updateAttendanceReviewRemark}
          onRemarkChange={setAttendanceRemark}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = activeSection === item.key
            return (
              <button
                key={`mobile-${item.key}`}
                type="button"
                onClick={() => setActiveSection(item.key as AppSection)}
                className={cn(
                  'flex min-w-fit flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition',
                  active
                    ? 'bg-[#fff1f8] text-[#be185d]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )}
              >
                <item.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </main>
  )
}

export default App
