import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { brand } from './lib/brand'
import type { Session } from '@supabase/supabase-js'
import type {
  EventApi,
  EventClickArg,
  EventContentArg,
  EventDropArg,
} from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { BrandLogo } from './components/BrandLogo'
import { BrandMascot } from './components/BrandMascot'
import { malaysiaHolidayEvents } from './lib/holidays'
import {
  CalendarBlank,
  Chalkboard,
  House,
  ClockCounterClockwise,
  CaretDoubleLeft,
  CaretDoubleRight,
  ClipboardText,
  Funnel,
  GraduationCap,
  IdentificationBadge,
  Exam,
  GearSix,
  Package as PackageIcon,
  ChatsCircle,
  ChatCircleDots,
  DeviceMobile,
  ChartLineUp,
  FilmStrip,
  Brain,
  Megaphone,
  Images,
  Lightning,
  WarningCircle,
  WhatsappLogo,
  ChatCenteredText,
  Calculator,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useLiveSync } from './hooks/useLiveSync'
import { fetchTableVersions, type CoreGroup, type CoreSyncTarget, type TableVersions } from './lib/coreSync'
import { useWhatsAppNumbers } from './hooks/useWhatsAppNumbers'
import { showsStudentInbox, zoneFilter } from './lib/inboxZones'
import { useChannelAlerts } from './hooks/useChannelAlerts'
import { ChannelAlertBar } from './components/ChannelAlertBar'
import { CHANNEL_ACCESS_HASH } from './lib/channelAlerts'
import { formatDate, getTodayString, parseLocalDate } from './domain/studentStatus'
import type { Database } from './types/database'
import type {
  AdminActivity,
  AgeGroup,
  AppSection,
  AttendanceModalState,
  AttendanceReviewFormState,
  AttendanceStatus,
  AttendanceStatusOption,
  Classroom,
  ClassroomFormState,
  CreateStudentFormState,
  CreateTeacherFormState,
  FilterKey,
  Lead,
  LeadFormState,
  LeadOption,
  LeadBulkAction,
  LeadCheckSlot,
  LeadOptionKind,
  Package,
  StudentEnrollment,
  LeadStatus,
  LessonLogStudentReview,
  LessonLogSummary,
  MakeupPlan,
  RenewalFormState,
  ReviewCriterion,
  Schedule,
  ScheduleException,
  ScheduleFormState,
  ScheduleParticipant,
  Student,
  StudentDetailsFormState,
  Teacher,
  TrialBooking,
  TrialBookingFormState,
  PermissionAction,
  PermissionModule,
  UserSession,
} from './types/domain'
import {
  createEmptyAttendanceReviewForm,
  getLatestLessonLogMap,
  mapAttendanceStatusRow,
  mapReviewCriterionRow,
  mapReviewToFormState,
  mapScheduleParticipantRow,
  mapLeadOptionRow,
  mapPackageRow,
  mapScheduleRow,
} from './lib/mappers'
import { buildAttendanceSubmission } from './lib/attendance'
import { defaultReviewCriteria, getReviewMetrics, type ReviewMetric } from './lib/reviewCriteria'
import { defaultAttendanceStatuses, getStatusOption, isAttendedStatus } from './lib/attendanceStatuses'
import {
  fetchRewardLevels,
  fetchRewardPresets,
  setAttendanceStatusPoints,
  type RewardLevel,
  type RewardPreset,
} from './lib/rewards'
import type { BulkLeadRow } from './lib/leadCsv'
import type { BulkPreviewStudentRow } from './lib/studentCsv'
import { provisionTeacherLogin, resetTeacherPassword, syncTeacherLoginName } from './lib/teacherAuth'
import { usernameToInternalEmail } from './lib/auth'
import {
  fetchAdminActivityForDay,
  fetchClassroomsFromSupabase,
  fetchLatestLessonLogStudents,
  fetchLeadFormSubmissions,
  fetchLeadOptionsFromSupabase,
  fetchPackagesFromSupabase,
  fetchLateFeedbackEdit,
  fetchStudentEnrollments,
  fetchLeadsFromSupabase,
  fetchMakeupPlansFromSupabase,
  fetchStudentAttendanceRows,
  fetchLessonLogStudentReviewsFromSupabase,
  fetchReviewCriteriaFromSupabase,
  fetchAttendanceStatusesFromSupabase,
  fetchZoomMeetingOptions,
  type ZoomMeetingOptions,
  fetchLessonLogSummariesFromSupabase,
  fetchScheduleExceptionsFromSupabase,
  fetchScheduleParticipantsFromSupabase,
  fetchSchedulesFromSupabase,
  fetchStudentsFromSupabase,
  fetchTeachersFromSupabase,
  fetchTrialBookingsFromSupabase,
  getSupabaseLoadErrorMessage,
} from './lib/api'
import {
  buildScheduleEvents,
  buildScheduleFormState,
  buildTrialBookingMap,
  getDateKeyFromDate,
  getScheduleClassKind,
  getTrialSlotKey,
  weekdayLabels,
} from './lib/schedule'
import { lessonFixedZoomLink, normalizeLessonLink, regularLessonOwner, SCHEDULE_SELECT } from './lib/scheduleLinks'
import { fetchCalendarLayout, fetchMonthWeekly, MONTH_WEEKLY_DEFAULT, readCalendarLayout, usesDayList, type CalendarLayout } from './lib/calendarLayout'
import { monthWeeks, type DayListItem, type DayListLesson } from './lib/calendarDayList'
import {
  ALL_KINDS,
  defaultCalendarFilter,
  fetchCalendarTeams,
  filterPeople,
  isFiltered,
  itemKind,
  itemShown,
  loadCalendarFilter,
  saveCalendarFilter,
  scheduleKind,
  scheduleShown,
  type CalendarFilter,
  type CalendarTeam,
} from './lib/calendarFilter'
import { CalendarFilterBar } from './components/calendar/CalendarFilterBar'
import { CalendarDayList, type CalendarView } from './components/calendar/CalendarDayList'
import { LessonWindow } from './components/calendar/LessonWindow'
import { SpecialMonthCard } from './components/calendar/SpecialMonthCard'
import { bookedTrialEvents, linkReplacements, monthSpecialEvents, type SpecialCard } from './lib/calendarSpecial'
import {
  MAX_LEAD_FOLLOW_UPS,
  ageGroupOptions,
  leadStatusOptions,
  programLevelOptions,
} from './lib/constants'
import { cn } from './lib/cn'
import { getErrorMessage } from './lib/errors'
import { useIsMobile } from './hooks/useIsMobile'
import { useConfirm } from './hooks/useConfirm'
import { useToast } from './hooks/useToast'
import { AuthScreen } from './components/AuthScreen'
import { ClassListingSection } from './components/sections/ClassListingSection'
import { StudentDashboardSection } from './components/sections/StudentDashboardSection'
import { TeacherHomeSection } from './components/sections/TeacherHomeSection'
import { AdminHomeSection } from './components/sections/AdminHomeSection'
import { buildStudentRows } from './lib/studentRows'
import { useAutomationSummary } from './hooks/useAutomationSummary'
import { buildTeacherAgenda, formatClockTime, getAgendaItems, getWeekRange, type AgendaItem } from './lib/teacherAgenda'
import {
  attendanceTakerRole,
  buildSubstituteMap,
  canTakeAttendance,
  coveredLessons,
  defaultAttendanceTakerRules,
  fetchAttendanceTakers,
  saveLessonSubstitute,
  substituteKey,
  teachesSchedule,
  type AttendanceTakerRules,
  type LessonSubstitute,
} from './lib/attendanceTakers'
import {
  addMonthPlan,
  fetchStudentCodeEnabled,
  fetchStudentCodes,
  saveStudentCode,
  setStudentCodeEnabled,
} from './lib/studentExtras'
import { convertHoaStudent, findHoaStudentForChild, type ConvertHoaInput } from './lib/convertHoa'
import { ConvertHoaModal } from './components/modals/ConvertHoaModal'
import { buildTeacherClasses } from './lib/teacherDetails'
import { TeacherDetailsSection } from './components/sections/TeacherDetailsSection'
import { TeacherManagementSection } from './components/sections/TeacherManagementSection'
import { MyTeamTabs } from './components/teams/MyTeamTabs'
import { TeamsPanel } from './components/teams/TeamsPanel'
import { WorkingHoursPanel } from './components/teams/WorkingHoursPanel'
import type { InboxOption } from './components/teams/ChannelAccessSection'
import { useStaffTeams } from './hooks/useStaffTeams'
import { teamsOf } from './lib/staffTeams'
import { fetchHoursInUse } from './lib/staffHours'
import { FormsSection } from './components/sections/FormsSection'
import { WhatsAppSection } from './components/sections/WhatsAppSection'
import type { WhatsAppNumbersView } from './components/whatsapp/WhatsAppInbox'
import { AppChatPanel } from './components/appChat/AppChatPanel'
import { AiKnowledgeSection } from './components/sections/AiKnowledgeSection'
import { ContentStudioSection } from './components/contentStudio/ContentStudioSection'
import { FeeCalculatorSection } from './components/feeCalculator/FeeCalculatorSection'
import { useFeeCalculatorEnabled } from './hooks/useFeeCalculatorEnabled'
import { useQuotationsEnabled } from './hooks/useQuotationsEnabled'
import { ContentLibrarySection } from './components/contentStudio/ContentLibrarySection'
import { fetchThread } from './lib/aiLearning'
import { ProgrammesSection } from './components/sections/ProgrammesSection'
import { AppLoginsSection } from './components/sections/AppLoginsSection'
import { useProgrammes } from './hooks/useProgrammes'
import { AutomationsSection } from './components/sections/AutomationsSection'
import { WhatsAppOpenProvider, type WhatsAppTarget } from './components/WhatsAppLink'
import type { LeadFormValues, WhatsAppCrm } from './components/whatsapp/crm'
import { todaysFollowUps } from './lib/followUps'
import { FollowUpReminders } from './components/whatsapp/FollowUpReminders'
import { StaffNotificationBell } from './components/StaffNotificationBell'
import { TeacherQualitySection } from './components/sections/TeacherQualitySection'
import { describeHoaSlot, upcomingHoaSlots, type HoaSlot } from './lib/hoaSlots'
import { classesOfStudent } from './lib/studentClasses'
import { findLeadsByPhone, sameNumberMessage } from './lib/chatLink'
import { getChatwootUrl } from './lib/chatwoot'
import { createChatwootClient } from './lib/chatwootClient'
import { useWhatsAppUnread } from './hooks/useWhatsAppUnread'
import { useInboxCopyLive } from './hooks/useInboxCopyLive'
import { useAppChat } from './hooks/useAppChat'
import { chatTargetForLead } from './lib/leadChat'
import { useLeadFormAnswers } from './hooks/useLeadFormAnswers'
import { useUnreadFormSubmissions } from './hooks/useUnreadFormSubmissions'
import { LeadsSection } from './components/sections/LeadsSection'
import { AdminActivitySection } from './components/sections/AdminActivitySection'
import { TeamRepliesSection } from './components/sections/TeamRepliesSection'
import { StudentDetailModal } from './components/StudentDetailModal'
import { StudentExtraInputs, StudentExtraSummary } from './components/StudentExtraFields'
import { StudentFieldsSettings } from './components/StudentFieldsSettings'
import { useStudentFields } from './hooks/useStudentFields'
import { useStudentTags } from './hooks/useStudentTags'
import { PersonTags } from './components/PersonTags'
import { setPersonTags } from './lib/personTags'
import { anyStudentField, consultantOptions, EMPTY_STUDENT_EXTRAS_FORM, extrasChanges, extrasToForm, salesPersonOptions, type StudentExtrasForm } from './lib/studentFields'
import { buildStudentParents } from './lib/studentParents'
import { getAttendedStudentIds } from './lib/studentLessons'
import { EditStudentModal } from './components/modals/EditStudentModal'
import { CreateStudentModal } from './components/modals/CreateStudentModal'
import { ClassroomModal } from './components/modals/ClassroomModal'
import { TeacherModal } from './components/modals/TeacherModal'
import { DeleteTeacherModal } from './components/modals/DeleteTeacherModal'
import { LeadModal } from './components/modals/LeadModal'
import { LeadOptionsModal } from './components/modals/LeadOptionsModal'
import { LeadStagesModal } from './components/modals/LeadStagesModal'
import { useLeadStages } from './hooks/useLeadStages'
import { PackagesModal, type PackageDraft } from './components/modals/PackagesModal'
import { QuestionBankSection } from './components/sections/QuestionBankSection'
import { ClassVideosSection } from './components/sections/ClassVideosSection'
import { EnrolFlowsSettings } from './components/EnrolFlowsSettings'
import { MobileNav, SideNav, type NavEntry, type NavGroupKey } from './components/AppNav'
import { fetchSubjects, saveSubject, type Subject } from './lib/subjects'
import {
  AgeGroupsContext,
  ageGroupNames,
  defaultAgeGroups,
  fetchAgeGroups,
  saveAgeGroup,
  type AgeGroupOption,
} from './lib/ageGroups'
import {
  ProgramLevelsContext,
  defaultProgramLevels,
  fetchProgramLevels,
  saveProgramLevel,
  type ProgramLevelOption,
} from './lib/programLevels'
import { ClassSettingsModal, type ReviewCriterionDraft } from './components/modals/ClassSettingsModal'
import { ChangePackageModal, type PackageChange } from './components/modals/ChangePackageModal'
import {
  AssignPackagesModal,
  type PackageAssignment,
} from './components/modals/AssignPackagesModal'
import { LeadBulkImportModal } from './components/modals/LeadBulkImportModal'
import { PreviewStudentBulkImportModal } from './components/modals/PreviewStudentBulkImportModal'
import { LeadFollowUpModal } from './components/modals/LeadFollowUpModal'
import { StudentRenewalModal } from './components/modals/StudentRenewalModal'
import { ScheduleModal } from './components/modals/ScheduleModal'
import { TrialBookingModal } from './components/modals/TrialBookingModal'
import { CancelledOccurrenceModal } from './components/modals/CancelledOccurrenceModal'
import { CalendarItemModal } from './components/modals/CalendarItemModal'
import { useCalendarItems } from './hooks/useCalendarItems'
import { useFollowUpReminders } from './hooks/useFollowUpReminders'
import { useStaffNotifications } from './hooks/useStaffNotifications'
import { useLeadChannels } from './hooks/useLeadChannels'
import { contactSiblings, mergeLeads } from './lib/leadChannels'
import { leadParentName } from './lib/parentLabel'
import { makeLeadCodes } from './lib/studentCodeLabel'
import { upcomingZoomSlots } from './lib/zoomSlots'
import { MOCK_SOCIAL_CHANNELS, MOCK_SOCIAL_LEADS } from './lib/mockSocialLeads'

// The "mock" Vite mode (npm run dev -- --mode mock) shows made-up Messenger / Instagram leads on the Leads page.
const isMockMode = import.meta.env.MODE === 'mock'

import { buildCalendarItemEvents, itemsVisibleTo, type CalendarItem } from './lib/calendarItems'
import { AttendanceModal } from './components/modals/AttendanceModal'
import { LiveClassConsole } from './components/LiveClassConsole'
import { studentBackgrounds } from './lib/studentBackground'
import { startChat } from './lib/startChat'
import { MakeupPlanModal, type MakeupPlanInput } from './components/modals/MakeupPlanModal'
import {
  MoveClassModal,
  type MoveClassDraft,
  type MoveClassInput,
} from './components/modals/MoveClassModal'
import { getDragBlockReason, getTimeFromDate, getTrialSlotsOnDate } from './lib/move'
import { clashMessage, findTeacherClashes, newClashes, scheduleAsCandidate, type ClashCandidate } from './lib/clash'
import { closeCalendarMorePopover } from './lib/calendarPopover'
import { hasPermission } from './lib/permissions'
import { getClassroomRosterOn, getStudentClassIds } from './lib/roster'
import { teachesClassroom } from './lib/classroomTeachers'
import { fetchHasClassVideos } from './lib/classVideos'
import {
  getOfferedPackages,
  getRenewalStartDate,
  planEnrollment,
  planFeeChange,
  type FeeChange,
} from './lib/packages'
import {
  addMinutesToTime,
  buildMakeupMap,
  flattenMakeupPlans,
  getUpcomingClassDates,
  makeupKey,
  sumMakeupMinutes,
  type MakeupEntry,
} from './lib/makeup'

// The menu's order (AppNav groups them).
const NAV_ORDER = ['home', 'leads', 'whatsapp', 'automations', 'forms', 'ai-knowledge', 'content-studio', 'content-library', 'calendar', 'classrooms', 'videos', 'questions', 'students', 'student-inbox', 'student-chat', 'fee-calculator', 'app-logins', 'programmes', 'packages', 'teachers', 'teacher-quality', 'team-replies', 'class-settings', 'activity']

// The shared WhatsApp inbox only shows up once its address is set.
const chatwootUrl = getChatwootUrl(import.meta.env.VITE_CHATWOOT_URL)
// Where the school's own inbox page reads and sends WhatsApp chats through.
const whatsAppApiUrl = getChatwootUrl(import.meta.env.VITE_WHATSAPP_API_URL)

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'
// The package end and fee dates of a student who joined a class without a package.
const NO_PACKAGE_END = '2099-12-31'

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'yes'
  } catch {
    return false
  }
}

// True when a fresh read of the data is the same as what the page already shows.
function sameData(current: unknown, next: unknown) {
  return current === next || JSON.stringify(current) === JSON.stringify(next)
}

// The review criteria never hold up the page: on a failed read the attendance
// form keeps the five starting criteria (same ids as the seeded rows).
async function loadReviewCriteria() {
  try {
    return await fetchReviewCriteriaFromSupabase()
  } catch (error) {
    console.error('Could not load the review criteria.', error)
    return null
  }
}

// Subjects too: without them questions and classes simply have none.
async function loadSubjects() {
  try {
    return await fetchSubjects()
  } catch (error) {
    console.error('Could not load the subjects.', error)
    return null
  }
}

// Class levels: on a failed read the six usual ones stay.
async function loadProgramLevels() {
  try {
    return await fetchProgramLevels()
  } catch (error) {
    console.error('Could not load the class levels.', error)
    return null
  }
}

// Age groups: on a failed read the four usual ones stay.
async function loadAgeGroups() {
  try {
    return await fetchAgeGroups()
  } catch (error) {
    console.error('Could not load the age groups.', error)
    return null
  }
}

// Rewards are optional too: without them the points bar and card stay hidden.
async function loadRewards() {
  try {
    const [presets, levels] = await Promise.all([fetchRewardPresets(), fetchRewardLevels()])
    return { presets, levels }
  } catch (error) {
    console.error('Could not load the rewards.', error)
    return null
  }
}

// Same for attendance statuses: on a failed read the form keeps Present,
// Absent and Leave.
async function loadAttendanceStatuses() {
  try {
    return await fetchAttendanceStatusesFromSupabase()
  } catch (error) {
    console.error('Could not load the attendance statuses.', error)
    return null
  }
}

function App() {
  const isMobile = useIsMobile()
  const todayString = getTodayString()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { showToast, toastHost } = useToast()

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  // Lead Source and PIC names the admin manages.
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([])
  const [isLeadOptionsOpen, setIsLeadOptionsOpen] = useState(false)
  const [isLeadStagesOpen, setIsLeadStagesOpen] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [isPackagesOpen, setIsPackagesOpen] = useState(false)
  const [isAssignPackagesOpen, setIsAssignPackagesOpen] = useState(false)
  const [isSavingAssignments, setIsSavingAssignments] = useState(false)
  const [assignPackagesError, setAssignPackagesError] = useState<string | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleParticipants, setScheduleParticipants] = useState<
    ScheduleParticipant[]
  >([])
  const [scheduleExceptions, setScheduleExceptions] = useState<ScheduleException[]>([])
  const [trialBookings, setTrialBookings] = useState<TrialBooking[]>([])
  // The trial slot (schedule + day) whose bookings are open in the modal.
  const [trialBookingSlot, setTrialBookingSlot] = useState<{
    scheduleId: number
    dateKey: string
  } | null>(null)
  const [isSavingTrialBooking, setIsSavingTrialBooking] = useState(false)
  const [trialBookingError, setTrialBookingError] = useState<string | null>(null)
  // The cancelled day (schedule + date) whose Restore/Add Replacement
  // options are open.
  const [cancelledOccurrenceModal, setCancelledOccurrenceModal] = useState<{
    scheduleId: number
    occurrenceDate: string
  } | null>(null)
  const [makeupPlans, setMakeupPlans] = useState<MakeupPlan[]>([])
  // The make-up plan being created or edited (planId null = new).
  const [makeupEditor, setMakeupEditor] = useState<{
    classroomId: number
    planId: number | null
    missedDate: string
    studentId: number | null
    // Recently missed classes offered as one-click choices (student make-ups).
    missedOptions?: { date: string; label: string }[]
  } | null>(null)
  // Attendance rows of the student whose detail is open (admin only), so
  // "Arrange Make-up" can suggest their missed classes without a wait.
  const [prefetchedAttendance, setPrefetchedAttendance] = useState<{
    studentId: number
    rows: Awaited<ReturnType<typeof fetchStudentAttendanceRows>>
  } | null>(null)
  const [isSavingMakeup, setIsSavingMakeup] = useState(false)
  const [makeupError, setMakeupError] = useState<string | null>(null)
  // A class dragged to another day, waiting for the admin to confirm.
  const [moveDraft, setMoveDraft] = useState<MoveClassDraft | null>(null)
  const [isSavingMove, setIsSavingMove] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  // Why the spot under the dragged card was refused, shown when the drag ends.
  const dragBlockReasonRef = useRef<string | null>(null)
  // The cancelled day an "Add Replacement Class" form is making up, until that form is saved or closed.
  const replacementForDayRef = useRef<{ scheduleId: number; occurrenceDate: string } | null>(null)
  const [lessonLogs, setLessonLogs] = useState<LessonLogSummary[]>([])
  const [lessonReviews, setLessonReviews] = useState<LessonLogStudentReview[]>([])
  // The school's own review criteria (Settings > Review criteria).
  const [reviewCriteria, setReviewCriteria] = useState<ReviewCriterion[]>(defaultReviewCriteria)
  // The school's attendance statuses (Settings > Attendance).
  const [attendanceStatusOptions, setAttendanceStatusOptions] =
    useState<AttendanceStatusOption[]>(defaultAttendanceStatuses)
  // Rewards teachers give in class, and the level names (Settings > Rewards).
  const [rewardPresets, setRewardPresets] = useState<RewardPreset[]>([])
  const [rewardLevels, setRewardLevels] = useState<RewardLevel[]>([])
  // The school's subjects (Class Settings > Subjects).
  const [subjects, setSubjects] = useState<Subject[]>([])
  // The school's age groups (Class Settings > Subjects & ages).
  const [ageGroups, setAgeGroups] = useState<AgeGroupOption[]>(defaultAgeGroups)
  const schoolAgeGroupNames = useMemo(() => ageGroupNames(ageGroups), [ageGroups])
  // The school's class levels (Class Settings > Class options).
  const [programLevels, setProgramLevels] = useState<ProgramLevelOption[]>(defaultProgramLevels)
  const schoolLevelNames = useMemo(() => ageGroupNames(programLevels), [programLevels])
  const [isClassSettingsOpen, setIsClassSettingsOpen] = useState(false)
  // Loaded when Class Settings opens.
  const [zoomOptions, setZoomOptions] = useState<ZoomMeetingOptions | null>(null)
  const [adminActivities, setAdminActivities] = useState<AdminActivity[]>([])
  // The Activity Log shows one day at a time, loaded only while it is open.
  const [activityDay, setActivityDay] = useState(todayString)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [isSavingStudent, setIsSavingStudent] = useState(false)
  const [deactivatingStudentId, setDeactivatingStudentId] = useState<number | null>(null)
  const [deletingTeacherId, setDeletingTeacherId] = useState<number | null>(null)
  // The teacher whose remove dialog (with successor picker) is open.
  const [deleteTeacherTargetId, setDeleteTeacherTargetId] = useState<number | null>(null)
  const [deletingClassroomId, setDeletingClassroomId] = useState<number | null>(null)
  const [restoringClassroomId, setRestoringClassroomId] = useState<number | null>(null)
  const [studentSaveError, setStudentSaveError] = useState<string | null>(null)
  const [isCreatingStudentRecord, setIsCreatingStudentRecord] = useState(false)
  const [createStudentSaveError, setCreateStudentSaveError] = useState<string | null>(null)
  const [isCreatingTeacherRecord, setIsCreatingTeacherRecord] = useState(false)
  const [createTeacherSaveError, setCreateTeacherSaveError] = useState<string | null>(null)
  const [teacherLoginPassword, setTeacherLoginPassword] = useState('')
  const [isProvisioningLogin, setIsProvisioningLogin] = useState(false)
  const [provisionLoginError, setProvisionLoginError] = useState<string | null>(null)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null)
  const [isSavingAttendance, setIsSavingAttendance] = useState(false)
  const [attendanceSaveError, setAttendanceSaveError] = useState<string | null>(
    null,
  )

  const [studentFilter, setStudentFilter] = useState<FilterKey>('all')
  const [studentFollowUpOnly, setStudentFollowUpOnly] = useState(false)
  const [activeSection, setActiveSection] = useState<AppSection>('calendar')
  // The teacher whose details (classes and students) are open on My Team.
  const [teacherDetailsId, setTeacherDetailsId] = useState<number | null>(null)
  // The menu can shrink to icons so the page beside it (the WhatsApp inbox) gets the room.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed)

  function toggleSidebar() {
    setIsSidebarCollapsed((collapsed) => {
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'no' : 'yes')
      } catch {
        // Private windows can refuse storage; the choice just won't be remembered.
      }
      return !collapsed
    })
  }
  const [authSession, setAuthSession] = useState<Session | null>(null)
  // supabase-js hands onAuthStateChange a brand-new session object on every
  // TOKEN_REFRESHED event, including the proactive refresh it runs whenever
  // this tab regains focus (its visibilitychange listener) — even though the
  // signed-in user hasn't changed. Effects that only care about *which user*
  // is signed in must depend on this stable id, not on `authSession` itself,
  // or every alt-tab-and-back would look like a fresh login and re-trigger a
  // full data reload (see the effect below).
  const authUserId = authSession?.user.id ?? null
  const [authInitializing, setAuthInitializing] = useState(true)
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null)
  const [viewAsTeacherId, setViewAsTeacherId] = useState<number | null>(null)
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>(ageGroupOptions[0])
  // The Calendar's filters (only mine, team, people, kinds), kept in the browser per login.
  const [calendarFilter, setCalendarFilterState] = useState<CalendarFilter>(() => defaultCalendarFilter())
  const [calendarTeams, setCalendarTeams] = useState<CalendarTeam[]>([])

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  // A school with class videos gets a Videos tab on the student page.
  const [hasClassVideos, setHasClassVideos] = useState(false)
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
  // The HOA student being converted to a regular student.
  const [convertingStudentId, setConvertingStudentId] = useState<number | null>(null)
  const [isBulkImportPreviewStudentsOpen, setIsBulkImportPreviewStudentsOpen] =
    useState(false)
  const [isImportingPreviewStudents, setIsImportingPreviewStudents] = useState(false)
  const [bulkImportPreviewStudentError, setBulkImportPreviewStudentError] =
    useState<string | null>(null)
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false)
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null)
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false)
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null)
  const [convertingLeadId, setConvertingLeadId] = useState<number | null>(null)
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null)
  const [isSavingLead, setIsSavingLead] = useState(false)
  const [leadSaveError, setLeadSaveError] = useState<string | null>(null)
  const [isBulkImportLeadsOpen, setIsBulkImportLeadsOpen] = useState(false)
  const [isImportingLeads, setIsImportingLeads] = useState(false)
  const [bulkImportLeadError, setBulkImportLeadError] = useState<string | null>(null)
  const [followUpLeadId, setFollowUpLeadId] = useState<number | null>(null)
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false)
  const [followUpSaveError, setFollowUpSaveError] = useState<string | null>(null)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null)
  const [studentFormState, setStudentFormState] = useState<RenewalFormState>({
    packageId: '',
    startDate: todayString,
    addHours: '0',
    lessonExpiryDate: '',
    accountFeeExpiryDate: '',
    miraiClubExpiryDate: '',
    remark: '',
  })
  const [createStudentFormState, setCreateStudentFormState] =
    useState<CreateStudentFormState>({
      packageId: '',
      startDate: todayString,
      fullName: '',
      phone: '',
      classroomId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      studentType: 'regular',
      dateOfBirth: '',
    })
  const [studentDetailsFormState, setStudentDetailsFormState] =
    useState<StudentDetailsFormState>({
      fullName: '',
      phone: '',
      classroomId: '',
      notes: '',
      studentType: 'regular',
      dateOfBirth: '',
    })
  const [isSavingClassroom, setIsSavingClassroom] = useState(false)
  const [classroomSaveError, setClassroomSaveError] = useState<string | null>(null)
  const [classroomFormState, setClassroomFormState] = useState<ClassroomFormState>({
    category: 'regular',
    name: '',
    ageGroup: ageGroupOptions[0],
    programLevel: programLevelOptions[0],
    teacherId: '',
    teacherEffectiveDate: todayString,
    notes: '',
    zoomLink: '',
    programmeId: '',
    subjectId: '',
  })
  const [createTeacherFormState, setCreateTeacherFormState] =
    useState<CreateTeacherFormState>({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
      permissions: {},
    })
  const [leadFormState, setLeadFormState] = useState<LeadFormState>({
    fullName: '',
    phone: '',
    sourceId: '',
    picId: '',
    state: '',
    tagIds: [],
    status: 'new',
    children: [],
    notes: '',
    addedDate: todayString,
  })

  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  // The calendar day the admin clicked, so a single occurrence of a weekly
  // class can be cancelled without cancelling the whole series.
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<string | null>(null)
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
  // The lesson open in the live class console (Home > Today > Live class).
  const [liveLesson, setLiveLesson] = useState<{
    scheduleId: number
    date: string
    title: string
    classroomId: number | null
    studentCount: number
  } | null>(null)
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
  // Admin switch: past attendance and feedback stay editable after 24 hours.
  const [lateFeedbackEdit, setLateFeedbackEdit] = useState(false)
  // Who besides admin and the class teacher takes attendance (the school's
  // switches), and each class day's substitute teacher.
  const [attendanceTakerRules, setAttendanceTakerRules] = useState<AttendanceTakerRules>(defaultAttendanceTakerRules)
  const [lessonSubstitutes, setLessonSubstitutes] = useState<LessonSubstitute[]>([])
  const [isSavingSubstitute, setIsSavingSubstitute] = useState(false)
  // The school's own number for each child, when the school switched student codes on.
  const [studentCodeEnabled, setStudentCodeEnabledState] = useState(false)
  const [studentCodes, setStudentCodes] = useState<Map<number, string>>(new Map())
  // The student codes of a lead's students, shown in front of the contact's name (a school with no codes shows none).
  const leadCodeOf = useMemo(() => (studentCodeEnabled ? makeLeadCodes(students, studentCodes) : undefined), [studentCodeEnabled, students, studentCodes])
  // The school's extra student fields (Class Settings > Student fields) and the form's values for them.
  const studentFields = useStudentFields(authUserId !== null, loadAttempt)
  // The students' tags: the same tags the leads use (Tags on the student details and in the list's filter).
  const studentTags = useStudentTags(authUserId !== null, loadAttempt, students.length)
  const tagOptions = useMemo(() => leadOptions.filter((option) => option.kind === 'tag'), [leadOptions])
  const [studentExtrasForm, setStudentExtrasForm] = useState<StudentExtrasForm>(EMPTY_STUDENT_EXTRAS_FORM)
  const studentConsultants = useMemo(() => consultantOptions(teachers), [teachers])
  const studentSalesPeople = useMemo(() => salesPersonOptions(teachers), [teachers])
  const [isSavingStudentCodeSetting, setIsSavingStudentCodeSetting] = useState(false)
  const [isSavingLateFeedbackEdit, setIsSavingLateFeedbackEdit] = useState(false)
  // A class later than today opens read-only: who is coming, no attendance yet.
  const [attendanceUpcoming, setAttendanceUpcoming] = useState(false)
  const [attendanceViewOnly, setAttendanceViewOnly] = useState(false)
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  )
  const teacherNames = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.fullName])),
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

    // A student taking several subjects is in each of their classes.
    for (const student of students) {
      for (const classroomId of getStudentClassIds(student)) {
        const existing = nextMap.get(classroomId) ?? []
        existing.push(student)
        nextMap.set(classroomId, existing)
      }
    }

    return nextMap
  }, [students])
  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.isActive),
    [teachers],
  )
  const assignableTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.role === 'teacher' && teacher.isActive),
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
  const trialBookingMap = useMemo(() => buildTrialBookingMap(trialBookings), [trialBookings])
  const makeupEntries = useMemo(() => flattenMakeupPlans(makeupPlans), [makeupPlans])
  const makeupMap = useMemo(() => buildMakeupMap(makeupEntries), [makeupEntries])
  const latestLessonLogMap = useMemo(
    () => getLatestLessonLogMap(lessonLogs),
    [lessonLogs],
  )

  // The real, logged-in identity — resolved from the Supabase Auth session
  // via teachers.auth_user_id. Never used for RPC/audit attribution
  // spoofing: the server derives its own actor from auth.uid().
  const currentTeacher = useMemo(
    () =>
      authSession
        ? teachers.find((teacher) => teacher.authUserId === authSession.user.id) ?? null
        : null,
    [authSession, teachers],
  )

  // Dev-only convenience: lets a logged-in real admin locally preview
  // another teacher's view. Dead-code-eliminated from production builds
  // since `import.meta.env.DEV` is statically false there.
  const effectiveTeacher = useMemo(
    () =>
      import.meta.env.DEV && currentTeacher?.role === 'admin' && viewAsTeacherId
        ? teachers.find((teacher) => teacher.id === viewAsTeacherId) ?? currentTeacher
        : currentTeacher,
    [currentTeacher, teachers, viewAsTeacherId],
  )

  const currentSession: UserSession | null = useMemo(
    () =>
      effectiveTeacher
        ? {
            key: `teacher-${effectiveTeacher.id}`,
            role: effectiveTeacher.role,
            label: effectiveTeacher.fullName,
            teacherId: effectiveTeacher.id,
          }
        : null,
    [effectiveTeacher],
  )

  // What this account may do; admins may do everything. The database
  // enforces the same rules, so this only decides what the screens offer.
  const can = useCallback(
    (module: PermissionModule, action: PermissionAction = 'view') =>
      hasPermission(effectiveTeacher, module, action),
    [effectiveTeacher],
  )
  const isAdmin = currentSession?.role === 'admin'
  const isTeacherAccount = currentSession?.role === 'teacher'
  const canEditCalendar = can('calendar', 'edit')
  const canDeleteCalendar = can('calendar', 'delete')
  // Tasks, Zoom meetings and events on the calendar, beside the classes.
  // Also read by someone who only works the leads, for the Follow up button in the Inbox.
  const calendarItems = useCalendarItems(Boolean(authUserId) && (can('calendar') || can('leads')), currentSession?.teacherId ?? null)
  const [calendarItemEditor, setCalendarItemEditor] = useState<{ item: CalendarItem | null; date: string } | null>(null)
  // The chats each lead has: WhatsApp numbers, Messenger Pages, Instagram.
  const leadChannels = useLeadChannels(Boolean(authUserId) && (can('leads') || can('inbox')))
  // The courses the school signs parents up for (Programmes page); the Inbox and the class form read them.
  const programmes = useProgrammes({ enabled: Boolean(authUserId) && can('leads') })
  // The stages leads go through (Leads page: Manage stages). Loading them fills the list every stage picker reads.
  const leadStages = useLeadStages({ enabled: Boolean(authUserId) && can('leads') })
  // Same rule as can_view_classes(): any class module shows every class.
  // Without one, a teacher sees only their own classes.
  const seesAllClasses = can('calendar') || can('classrooms') || can('students')
  // Same rule as can_edit_classes(): may set a class day's substitute teacher.
  const canEditClasses = can('calendar', 'edit') || can('classrooms', 'edit') || can('students', 'edit')
  // Messages students send from the student app (when the school turned it on), on their own Student Chat page:
  // every staff login reads the chats written to it, with or without any tick; an admin reads them all.
  const appChat = useAppChat(Boolean(currentSession?.teacherId))
  // Teams and permissions (20261026000000): the Inbox has its own tick, copied from Leads; the Student Inbox
  // (20261029300000) has its own too. Either one opens the school's WhatsApp.
  const canUseWhatsApp = can('inbox') || can('student_inbox')
  // The school's WhatsApp numbers: which the signed-in person may see (an admin sees all), and which are students ones.
  const whatsAppNumbers = useWhatsAppNumbers(Boolean(whatsAppApiUrl) && canUseWhatsApp)
  const hasStudentInbox = showsStudentInbox(can('student_inbox'), whatsAppNumbers.studentInboxIds)
  // The Fee Calculator (20261030300000): the school's switch (Class Settings), apart from brand.usesFees.
  const feeCalculatorOn = useFeeCalculatorEnabled(authUserId !== null)
  // Quotations (20261031100000): the Inbox's Quotation tab, when the school switched them on.
  const quotationsOn = useQuotationsEnabled(authUserId !== null)
  const allowedSections = useMemo(() => {
    const sections: AppSection[] = []
    // A teacher's own day, or the admin's / staff's overview of the school.
    if (isTeacherAccount || isAdmin || can('calendar') || can('students') || can('leads') || can('inbox')) {
      sections.push('home')
    }
    if (can('leads')) sections.push('leads')
    // Same ticks as Leads: whoever follows up leads answers their WhatsApp.
    if (can('inbox') && chatwootUrl) sections.push('whatsapp')
    // Anyone who can see Leads can look at the automations; only an admin changes them.
    if (can('automations')) sections.push('automations')
    // What the AI reply drafts know about the school; same rule: everybody who sees Leads reads it, an admin edits.
    if (can('ai_knowledge')) sections.push('ai-knowledge')
    // Briefs → AI plan → review; approved posts are claimed in the Content Library.
    if (can('content_studio')) sections.push('content-studio')
    if (can('content_library')) sections.push('content-library')
    if (can('forms')) sections.push('forms')
    if (isTeacherAccount || can('calendar')) sections.push('calendar')
    if (isTeacherAccount || can('classrooms')) sections.push('classrooms')
    // Every teacher keeps questions for class; an admin sees all of them.
    if (isTeacherAccount || can('questions')) sections.push('questions')
    // A class's videos: whoever sees the classes (each teacher manages their own classes' videos).
    if (isTeacherAccount || can('classrooms') || can('videos')) sections.push('videos')
    // The courses the school signs parents up for: an admin makes them, so the page is the admin's.
    if (can('students')) sections.push('students')
    // The student app's logins: their own tick (copied from Students).
    if (can('app_logins')) sections.push('app-logins')
    // The Student Inbox: its own tick, once the school has a WhatsApp number set to the students zone.
    if (hasStudentInbox && chatwootUrl) sections.push('student-inbox')
    if (appChat.on) sections.push('student-chat')
    // The Fee Calculator: its own tick, once the school switched it on.
    if (feeCalculatorOn && can('fee_calculator')) sections.push('fee-calculator')
    // My Team: accounts and teams are the admin's; Working hours can be seen with its own tick.
    if (isAdmin || can('staff_hours')) sections.push('teachers')
    // How each person answers the chats: its own tick, since it is about the team's work.
    if (can('team_replies')) sections.push('team-replies')
    // The teacher scorecard, retention and the class alert settings: their own tick.
    if (can('quality')) sections.push('teacher-quality')
    if (can('activity')) sections.push('activity')
    return sections
  }, [can, isAdmin, isTeacherAccount, appChat.on, hasStudentInbox, feeCalculatorOn])
  const visibleSection = allowedSections.includes(activeSection) ? activeSection : null
  useEffect(() => {
    if (!currentSession) return
    let cancelled = false
    fetchHasClassVideos()
      .then((has) => {
        if (!cancelled) setHasClassVideos(has)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [currentSession])
  const [hasOpenedWhatsApp, setHasOpenedWhatsApp] = useState(false)
  const [hasOpenedStudentInbox, setHasOpenedStudentInbox] = useState(false)
  useEffect(() => {
    if (visibleSection === 'whatsapp') {
      setHasOpenedWhatsApp(true)
    }
    if (visibleSection === 'student-inbox') {
      setHasOpenedStudentInbox(true)
    }
  }, [visibleSection])
  const { unread: unreadFormSubmissions, markSeen: markFormSubmissionsSeen } =
    useUnreadFormSubmissions(can('forms'))
  const whatsAppClient = useMemo(
    () => (whatsAppApiUrl && canUseWhatsApp ? createChatwootClient(whatsAppApiUrl) : null),
    [canUseWhatsApp],
  )
  // Channels that stopped working (a WhatsApp number logged out, restricted, silent): the red bar on Today and the Inbox.
  const channelAlerts = useChannelAlerts(Boolean(whatsAppApiUrl) && canUseWhatsApp, whatsAppNumbers.allowedInboxIds, isAdmin)
  const whatsAppSiblings = useMemo(() => contactSiblings(leadChannels.rows), [leadChannels.rows])
  // The Inbox and the Student Inbox count their own numbers (each has its own red dot).
  const marketingNumbers = useMemo(
    () => zoneFilter('marketing', whatsAppNumbers.allowedInboxIds, whatsAppNumbers.studentInboxIds),
    [whatsAppNumbers.allowedInboxIds, whatsAppNumbers.studentInboxIds],
  )
  const studentNumbers = useMemo(
    () => zoneFilter('students', whatsAppNumbers.allowedInboxIds, whatsAppNumbers.studentInboxIds),
    [whatsAppNumbers.allowedInboxIds, whatsAppNumbers.studentInboxIds],
  )
  // The CRM's copy of the inbox. Its live line is open only while an Inbox page is on screen, for that page's
  // numbers (2026-10-23: every tab listening to every chat was EduHero's heaviest database load); the badges read a
  // light list every half minute instead.
  const inboxPageNumbers = visibleSection === 'student-inbox' ? studentNumbers : visibleSection === 'whatsapp' ? marketingNumbers : undefined
  const inboxCopy = useInboxCopyLive(Boolean(whatsAppClient), whatsAppClient, {
    listen: inboxPageNumbers !== undefined,
    inboxIds: inboxPageNumbers?.allowed ?? null,
  })
  const {
    unread: unreadWhatsApp,
    waiting: waitingWhatsApp,
    openChats: everyOpenChat,
  } = useWhatsAppUnread(
    // Nothing is counted until it is known which numbers this person may see.
    marketingNumbers === undefined || !can('inbox') ? null : whatsAppClient,
    marketingNumbers?.allowed ?? null,
    whatsAppSiblings,
    inboxCopy,
    marketingNumbers?.excluded,
  )
  const {
    unread: unreadStudentInbox,
    openChats: everyOpenStudentChat,
  } = useWhatsAppUnread(
    studentNumbers === undefined || !hasStudentInbox ? null : whatsAppClient,
    studentNumbers?.allowed ?? [],
    whatsAppSiblings,
    inboxCopy,
  )
  // The admin's / staff's Today (a teacher has their own).
  const showAdminHome = visibleSection === 'home' && !isTeacherAccount
  const showTeacherDetails = visibleSection === 'teachers' && teacherDetailsId !== null
  const { summary: automationSummary, unavailable: automationUnavailable } = useAutomationSummary(
    showAdminHome && can('automations'),
  )
  const whatsAppUser = useMemo(
    () => (effectiveTeacher ? { id: effectiveTeacher.id, name: effectiveTeacher.fullName } : null),
    [effectiveTeacher],
  )
  // Team Replies counts only working time first once anyone has working hours.
  const [teamHoursInUse, setTeamHoursInUse] = useState(false)
  useEffect(() => {
    if (visibleSection !== 'team-replies') return
    let cancelled = false
    void fetchHoursInUse().then((inUse) => {
      if (!cancelled) setTeamHoursInUse(inUse)
    })
    return () => {
      cancelled = true
    }
  }, [visibleSection])
  // Teams and working hours (My Team): the admin's, and Working hours with its own tick.
  const staffTeams = useStaffTeams(Boolean(authUserId) && (isAdmin || can('staff_hours')))
  const teamPeople = useMemo(
    () =>
      teachers
        .filter((teacher) => teacher.isActive && teacher.role !== 'admin')
        .map((teacher) => ({ id: teacher.id, name: teacher.fullName, role: teacher.role })),
    [teachers],
  )
  // The Chatwoot inboxes, for picking a channel in My Team > Teams.
  const listTeamInboxes = useMemo(
    () =>
      whatsAppClient
        ? async (): Promise<InboxOption[]> =>
            (await whatsAppClient.listInboxes()).map((inbox) => ({
              id: inbox.id,
              name: inbox.name,
              kind: /instagram/i.test(inbox.channelType)
                ? 'instagram'
                : /facebook/i.test(inbox.channelType)
                  ? 'messenger'
                  : /api|whatsapp/i.test(inbox.channelType)
                    ? 'whatsapp'
                    : 'other',
            }))
        : undefined,
    [whatsAppClient],
  )
  // Team Replies names everybody who may have answered a chat, those no longer active included.
  const teamReplyStaff = useMemo(
    () => teachers.map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    [teachers],
  )
  const whatsAppStaff = useMemo(
    () => teachers.filter((teacher) => teacher.isActive).map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    [teachers],
  )
  // The WhatsApp button next to a phone number asks for that number's chat on the WhatsApp page.
  const [whatsAppRequest, setWhatsAppRequest] = useState<(WhatsAppTarget & { id: number }) | null>(null)
  const openWhatsAppChat = useCallback((target: WhatsAppTarget) => {
    setWhatsAppRequest((current) => ({ ...target, id: (current?.id ?? 0) + 1 }))
    setActiveSection('whatsapp')
  }, [])
  // What both Inboxes (Marketing and Student) know about the school's WhatsApp numbers.
  const whatsAppNumbersView: WhatsAppNumbersView = {
    numbers: whatsAppNumbers.numbers,
    assignments: whatsAppNumbers.assignments,
    allowedInboxIds: whatsAppNumbers.allowedInboxIds,
    studentInboxIds: whatsAppNumbers.studentInboxIds,
    isAdmin,
    // Admins see every number anyway, so only the other accounts can be given one.
    staff: teachers
      .filter((teacher) => teacher.isActive && teacher.role !== 'admin')
      .map((teacher) => ({ id: teacher.id, name: teacher.fullName })),
    onSave: whatsAppNumbers.save,
    onRemove: whatsAppNumbers.remove,
    onReload: whatsAppNumbers.reload,
    problems: channelAlerts.problemOf,
  }
  // Only when the school's own WhatsApp page is there to open; otherwise the button opens wa.me.
  const canOpenWhatsAppChat = allowedSections.includes('whatsapp') && Boolean(whatsAppApiUrl && whatsAppUser)
  // Follow-ups whose time has come ring for the person they are for (cards in the corner of the screen).
  const followUpReminders = useFollowUpReminders(calendarItems.items, currentSession?.teacherId ?? null)
  // Notes automations left for the signed-in person (the bell at the top).
  const staffNotes = useStaffNotifications({ enabled: Boolean(currentSession?.teacherId) })
  // A follow-up's "Open chat": the lead's own chat (also a Messenger / Instagram lead with no phone), else its number;
  // only a lead with no chat at all opens its profile, saying so.
  function openFollowUpChat(leadId: number) {
    const lead = leads.find((entry) => entry.id === leadId) ?? null
    const target = canOpenWhatsAppChat ? chatTargetForLead(lead, leadChannels.rows) : null
    if (target) {
      openWhatsAppChat(target)
      return
    }
    openEditLeadModal(leadId)
    if (canOpenWhatsAppChat && lead) {
      showToast('This lead has no chat yet.', 'info')
    }
  }
  const {
    leadIdsWithForms,
    submissions: editingLeadFormSubmissions,
    isLoading: isLoadingEditingLeadForms,
  } = useLeadFormAnswers(can('leads'), leads, editingLeadId)
  const [focusFormAnswers, setFocusFormAnswers] = useState(false)
  const protectedTeacherIds = useMemo(() => {
    const next = new Set<number>()
    const bootstrapAdmin = teachers.find((teacher) => teacher.username === 'admin_demo')
    if (bootstrapAdmin) {
      next.add(bootstrapAdmin.id)
    }
    if (currentTeacher?.id) {
      next.add(currentTeacher.id)
    }
    return next
  }, [currentTeacher, teachers])
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null
  const selectedStudentDetail =
    students.find((student) => student.id === selectedStudentDetailId) ?? null
  // Trial-type rows of a lead that became a regular student. They are kept
  // for the trial attendance/reviews (shown on the regular student), but
  // listing them would show the same child twice on the Students page.
  const listedStudents = useMemo(() => {
    const convertedLeadIds = new Set(
      leads.filter((lead) => lead.convertedStudentId !== null).map((lead) => lead.id),
    )
    const convertedTrialIds = new Set(
      trialBookings
        .filter((booking) => booking.leadId !== null && convertedLeadIds.has(booking.leadId))
        .map((booking) => booking.studentId),
    )
    return students.filter(
      (student) => !(student.studentType === 'trial' && convertedTrialIds.has(student.id)),
    )
  }, [leads, students, trialBookings])
  // A student converted from a lead keeps the trial-type rows its trial
  // bookings created; their attendance/reviews belong to this student too.
  const selectedStudentTrialIds = useMemo(() => {
    if (!selectedStudentDetailId) {
      return []
    }

    const sourceLead = leads.find((lead) => lead.convertedStudentId === selectedStudentDetailId)
    if (!sourceLead) {
      return []
    }

    return trialBookings
      .filter((booking) => booking.leadId === sourceLead.id)
      .map((booking) => booking.studentId)
      .filter((studentId): studentId is number => studentId !== null)
  }, [leads, selectedStudentDetailId, trialBookings])
  const attendedStudentIds = useMemo(
    () => getAttendedStudentIds(lessonLogs, lessonReviews),
    [lessonLogs, lessonReviews],
  )
  const studentParents = useMemo(
    () => buildStudentParents({ students, leads, trialBookings }),
    [students, leads, trialBookings],
  )
  const substituteMap = useMemo(() => buildSubstituteMap(lessonSubstitutes), [lessonSubstitutes])
  // Mirrors can_take_attendance: admin, the class teacher, its assistants and the day's substitute.
  const attendanceTakerContext = useMemo(
    () => ({
      isAdmin,
      teacherId: currentSession?.teacherId,
      rules: attendanceTakerRules,
      substitutes: substituteMap,
      classroomMap,
    }),
    [isAdmin, currentSession?.teacherId, attendanceTakerRules, substituteMap, classroomMap],
  )
  // What a teacher sees on Today: the classes they take attendance for (their own,
  // the ones they assist, the days they cover), by day.
  const teacherAgenda = useMemo(
    () =>
      isTeacherAccount && currentSession?.teacherId
        ? buildTeacherAgenda(
            {
              teacherId: currentSession.teacherId,
              schedules,
              exceptions: scheduleExceptions,
              classroomMap,
              lessonLogs,
              makeupEntries,
              getRosterIds: getScheduleRosterStudentIds,
              takes: (schedule, date) => canTakeAttendance(attendanceTakerContext, schedule, date),
            },
            todayString,
          )
        : null,
    // getScheduleRosterStudentIds reads students, the maps and the bookings, so they
    // are dependencies even though they are not named in the callback.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      isTeacherAccount,
      currentSession?.teacherId,
      schedules,
      scheduleExceptions,
      classroomMap,
      lessonLogs,
      makeupEntries,
      students,
      trialBookingMap,
      makeupMap,
      scheduleParticipantMap,
      todayString,
      attendanceTakerContext,
    ],
  )
  const teacherHomeClasses = useMemo(() => {
    const teacherId = currentSession?.teacherId
    if (!teacherAgenda || !teacherId) {
      return []
    }
    // Their own classes and the ones they assist.
    const isMine = (schedule: Schedule) =>
      teachesSchedule(schedule, schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) : null, teacherId)
    const classroomIds = new Set<number>()
    for (const schedule of schedules) {
      if (isMine(schedule) && schedule.status === 'active' && schedule.classroomId !== null) {
        classroomIds.add(schedule.classroomId)
      }
    }
    return [...classroomIds]
      .map((id) => classroomMap.get(id))
      .filter(
        (classroom): classroom is Classroom =>
          classroom !== undefined && classroom.status === 'active' && classroom.category !== 'trial',
      )
      .map((classroom) => ({
        id: classroom.id,
        name: classroom.name,
        subtitle: `${classroom.ageGroup} · ${classroom.programLevel}`,
        studentCount: (classroomStudentMap.get(classroom.id) ?? []).length,
        slots: schedules
          .filter(
            (schedule) =>
              schedule.classroomId === classroom.id &&
              isMine(schedule) &&
              schedule.eventType === 'regular' &&
              schedule.status === 'active' &&
              schedule.dayOfWeek !== null,
          )
          .sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || a.startTime.localeCompare(b.startTime))
          .map(
            (schedule) =>
              `${weekdayLabels[schedule.dayOfWeek ?? 0].slice(0, 3)} ${formatClockTime(schedule.startTime)}-${formatClockTime(schedule.endTime)}`,
          ),
        missing: teacherAgenda.todo.filter((item) => item.classroomId === classroom.id).length,
      }))
  }, [teacherAgenda, currentSession?.teacherId, schedules, classroomMap, classroomStudentMap])
  // What the admin sees on Today: every teacher's classes, and who owes attendance. Only worked
  // out while that page is open, and only for an account that has the calendar.
  const adminAgenda = useMemo(
    () =>
      showAdminHome && can('calendar')
        ? buildTeacherAgenda(
            {
              teacherId: null,
              schedules,
              exceptions: scheduleExceptions,
              classroomMap,
              lessonLogs,
              makeupEntries,
              getRosterIds: getScheduleRosterStudentIds,
            },
            todayString,
          )
        : null,
    // Same dependencies as teacherAgenda above.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      showAdminHome,
      can,
      schedules,
      scheduleExceptions,
      classroomMap,
      lessonLogs,
      makeupEntries,
      students,
      trialBookingMap,
      makeupMap,
      scheduleParticipantMap,
      todayString,
    ],
  )
  const adminStudentRows = useMemo(
    () =>
      (showAdminHome && can('students')) || showTeacherDetails
        ? buildStudentRows({
            students: listedStudents,
            packages,
            classrooms,
            schedules,
            teacherMap,
            trialBookings,
            parents: studentParents,
            attendedStudentIds,
            todayString,
          })
        : null,
    [
      showAdminHome,
      showTeacherDetails,
      can,
      listedStudents,
      packages,
      classrooms,
      schedules,
      teacherMap,
      trialBookings,
      studentParents,
      attendedStudentIds,
      todayString,
    ],
  )
  // The details of one teacher on My Team: the week, and every class with its students. Only worked
  // out while that page is open.
  const teacherDetailsAgenda = useMemo(() => {
    if (!showTeacherDetails || teacherDetailsId === null) {
      return null
    }
    const sources = {
      teacherId: teacherDetailsId,
      schedules,
      exceptions: scheduleExceptions,
      classroomMap,
      lessonLogs,
      makeupEntries,
      getRosterIds: getScheduleRosterStudentIds,
    }
    const week = getWeekRange(todayString)
    return {
      weekStart: week.start,
      items: getAgendaItems(sources, todayString, week.start, week.end),
      summary: buildTeacherAgenda(sources, todayString),
    }
    // Same dependencies as teacherAgenda above.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showTeacherDetails,
    teacherDetailsId,
    schedules,
    scheduleExceptions,
    classroomMap,
    lessonLogs,
    makeupEntries,
    students,
    trialBookingMap,
    makeupMap,
    scheduleParticipantMap,
    todayString,
  ])
  const teacherDetailsClasses = useMemo(
    () =>
      showTeacherDetails && teacherDetailsId !== null && adminStudentRows
        ? buildTeacherClasses({
            teacherId: teacherDetailsId,
            classrooms,
            schedules,
            studentRows: adminStudentRows,
            trialBookings,
            todayString,
          })
        : [],
    [showTeacherDetails, teacherDetailsId, adminStudentRows, classrooms, schedules, trialBookings, todayString],
  )
  const editingStudent =
    students.find((student) => student.id === editingStudentId) ?? null
  const editingTeacher =
    teachers.find((teacher) => teacher.id === editingTeacherId) ?? null
  const deleteTeacherTarget =
    teachers.find((teacher) => teacher.id === deleteTeacherTargetId) ?? null
  const editingLead = leads.find((lead) => lead.id === editingLeadId) ?? null
  const followUpLead = leads.find((lead) => lead.id === followUpLeadId) ?? null
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

  // The teacher this timetable form would book, and whether they are already
  // teaching something else at that time. A regular timetable is taught by its
  // classroom's teacher (or the co-teacher it already belongs to); a
  // replacement class picks its own.
  const scheduleClashTeacherId =
    scheduleFormState.eventType === 'regular'
      ? scheduleLinkedClassroom
        ? regularLessonOwner(scheduleLinkedClassroom, isCreatingSchedule ? null : editingSchedule).teacherId
        : null
      : scheduleFormState.teacherId
        ? Number(scheduleFormState.teacherId)
        : null
  const scheduleClashes = useMemo(() => {
    if (scheduleClashTeacherId === null || (!isCreatingSchedule && !editingScheduleId)) {
      return []
    }

    const base = {
      teacherId: scheduleClashTeacherId,
      startTime: scheduleFormState.startTime,
      endTime: scheduleFormState.endTime,
      excludeScheduleId: editingScheduleId,
      today: todayString,
    }
    let candidate: ClashCandidate | null = null

    if (scheduleFormState.eventType === 'regular') {
      if (scheduleFormState.startRecur) {
        candidate = {
          ...base,
          kind: 'weekly',
          dayOfWeek: Number(scheduleFormState.dayOfWeek),
          startRecur: scheduleFormState.startRecur,
          endRecur: scheduleFormState.endRecur.trim() || null,
        }
      }
    } else if (scheduleFormState.scheduledDate) {
      candidate = { ...base, kind: 'single', date: scheduleFormState.scheduledDate }
    }

    if (!candidate) {
      return []
    }
    const clashes = findTeacherClashes(candidate, schedules, scheduleExceptions, classroomMap)
    // A lesson that already clashed (from before the check existed) may still be edited.
    const before = !isCreatingSchedule && editingSchedule ? scheduleAsCandidate(editingSchedule, todayString) : null
    return before ? newClashes(clashes, findTeacherClashes(before, schedules, scheduleExceptions, classroomMap)) : clashes
  }, [
    classroomMap,
    editingSchedule,
    editingScheduleId,
    isCreatingSchedule,
    scheduleClashTeacherId,
    scheduleExceptions,
    scheduleFormState,
    schedules,
    todayString,
  ])

  useEffect(() => {
    if (!supabase) {
      setAuthInitializing(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session)
      setAuthInitializing(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session)
      if (session) {
        setAuthBlockedMessage(null)
      } else {
        setLoadedUserId(null)
        setViewAsTeacherId(null)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authSession || !supabase || isLoading || loadError || loadedUserId !== authSession.user.id) {
      return
    }

    if (!currentTeacher) {
      setAuthBlockedMessage("This login isn't linked to a teacher profile. Contact your admin.")
      supabase.auth.signOut()
      return
    }

    if (!currentTeacher.isActive) {
      setAuthBlockedMessage('Your account has been deactivated. Contact your admin.')
      supabase.auth.signOut()
    }
  }, [authSession, currentTeacher, isLoading, loadError, loadedUserId])

  useEffect(() => {
    if (visibleSection !== 'activity') {
      return
    }
    let cancelled = false
    setIsLoadingActivity(true)
    fetchAdminActivityForDay(activityDay)
      .then((rows) => {
        if (!cancelled) {
          setAdminActivities(rows)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAdminActivities([])
          showToast(getErrorMessage(error, 'Failed to load the activity log.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingActivity(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [visibleSection, activityDay, showToast])

  useEffect(() => {
    if (allowedSections.length > 0 && !allowedSections.includes(activeSection)) {
      setActiveSection(allowedSections.includes('calendar') ? 'calendar' : allowedSections[0])
    }
  }, [activeSection, allowedSections])

  // Everybody starts on Today, not on the full calendar.
  const hasHome = allowedSections.includes('home')
  useEffect(() => {
    if (hasHome) {
      setActiveSection('home')
    }
  }, [hasHome, isTeacherAccount, currentSession?.teacherId])

  useEffect(() => {
    if (!selectedStudentDetailId) {
      return
    }

    let cancelled = false
    fetchStudentAttendanceRows(selectedStudentDetailId)
      .then((rows) => {
        if (!cancelled) {
          setPrefetchedAttendance({ studentId: selectedStudentDetailId, rows })
        }
      })
      .catch(() => {
        // Attendance is only extra on the student page, and a speed-up for
        // Arrange Make-up, which fetches again if this is missing.
      })

    return () => {
      cancelled = true
    }
  }, [selectedStudentDetailId])

  useEffect(() => {
    if (!selectedStudent) {
      return
    }

    setStudentFormState({
      packageId: '',
      startDate: getRenewalStartDate(selectedStudent.lessonExpiryDate, todayString),
      addHours: '0',
      lessonExpiryDate: selectedStudent.lessonExpiryDate,
      accountFeeExpiryDate: selectedStudent.accountFeeExpiryDate,
      miraiClubExpiryDate: selectedStudent.miraiClubExpiryDate,
      remark: '',
    })
  }, [selectedStudent, todayString])

  // Package history shown in the open student's details.
  const [detailEnrollments, setDetailEnrollments] = useState<StudentEnrollment[]>([])
  // Bumped after a package change so the history reloads.
  const [detailEnrollmentsVersion, setDetailEnrollmentsVersion] = useState(0)
  const [isChangePackageOpen, setIsChangePackageOpen] = useState(false)
  const [isSavingPackageChange, setIsSavingPackageChange] = useState(false)
  const [changePackageError, setChangePackageError] = useState<string | null>(null)
  useEffect(() => {
    setDetailEnrollments([])
    if (selectedStudentDetailId === null) {
      return
    }
    let cancelled = false
    fetchStudentEnrollments(selectedStudentDetailId)
      .then((rows) => {
        if (!cancelled) {
          setDetailEnrollments(rows)
        }
      })
      .catch(() => {
        // The history is extra; the details still open without it.
      })
    return () => {
      cancelled = true
    }
  }, [selectedStudentDetailId, detailEnrollmentsVersion])

  // Corrects the day the open student joined their class.
  async function handleSetClassStart(startDate: string | null) {
    if (!supabase || !selectedStudentDetailId) {
      return 'Not connected.'
    }
    const { error } = await supabase.rpc('set_student_class_start', {
      p_student_id: selectedStudentDetailId,
      p_start_date: startDate,
    })
    if (error) {
      return getErrorMessage(error, 'Failed to save the day they joined.')
    }
    await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
    return null
  }

  // Puts the open student in one more class, or takes them out of one.
  async function handleStudentClass(action: 'add' | 'remove', classroomId: number) {
    if (!supabase || !selectedStudentDetailId) {
      return 'Not connected.'
    }
    const { error } = await supabase.rpc(
      action === 'add' ? 'add_student_to_classroom' : 'remove_student_from_classroom',
      { p_student_id: selectedStudentDetailId, p_classroom_id: classroomId },
    )
    if (error) {
      return getErrorMessage(error, action === 'add' ? 'Failed to add the class.' : 'Failed to remove the class.')
    }
    await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
    return null
  }

  async function handleChangePackage(change: PackageChange) {
    if (!supabase || !selectedStudentDetailId) {
      return
    }
    setIsSavingPackageChange(true)
    setChangePackageError(null)
    const { error } = await supabase.rpc('change_student_package', {
      p_student_id: selectedStudentDetailId,
      p_package_id: change.packageId,
      p_start_date: change.startDate,
      p_class_count: change.classCount,
      p_lesson_expiry_date: change.lessonExpiryDate,
      p_account_fee_expiry_date: change.accountFeeExpiryDate,
      p_mirai_club_expiry_date: change.miraiClubExpiryDate,
      p_remark: change.remark || null,
    })
    setIsSavingPackageChange(false)
    if (error) {
      setChangePackageError(getErrorMessage(error, 'Failed to change the package.'))
      return
    }
    setIsChangePackageOpen(false)
    setDetailEnrollmentsVersion((version) => version + 1)
    await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
  }

  // The renewing student's past packages, for the fee-year rules.
  const [renewalHistory, setRenewalHistory] = useState<StudentEnrollment[]>([])
  const renewingStudentId = selectedStudent?.id ?? null
  useEffect(() => {
    setRenewalHistory([])
    if (renewingStudentId === null) {
      return
    }
    let cancelled = false
    fetchStudentEnrollments(renewingStudentId)
      .then((rows) => {
        if (!cancelled) {
          setRenewalHistory(rows)
        }
      })
      .catch(() => {
        // Without history only the trial-counts rule is skipped.
      })
    return () => {
      cancelled = true
    }
  }, [renewingStudentId])

  useEffect(() => {
    if (!isCreatingClassroom && !editingClassroom) {
      return
    }

    setClassroomFormState({
      category: editingClassroom?.category ?? 'regular',
      name: editingClassroom?.name ?? '',
      ageGroup: editingClassroom?.ageGroup ?? selectedAgeGroup,
      programLevel: editingClassroom?.programLevel ?? programLevelOptions[0],
      teacherId: editingClassroom?.teacherId ? String(editingClassroom.teacherId) : '',
      teacherEffectiveDate: todayString,
      notes: editingClassroom?.notes ?? '',
      zoomLink: editingClassroom?.zoomLink ?? '',
      programmeId: editingClassroom?.programmeId ? String(editingClassroom.programmeId) : '',
      subjectId: editingClassroom?.subjectId ? String(editingClassroom.subjectId) : '',
      categoryName: editingClassroom?.categoryName ?? '',
    })
  }, [editingClassroom, isCreatingClassroom, selectedAgeGroup, todayString])

  useEffect(() => {
    // Only reacts to opening/loading an EXISTING schedule for edit — it
    // re-derives currentParticipantIds once scheduleParticipantMap catches
    // up asynchronously (openEditSchedule itself sets nothing but the id).
    // A *new* schedule's form state is fully set by whichever opener created
    // it (openCreateSchedule, openReplacementForCancelledDay, ...) — this
    // must not also run then, or it clobbers that prefill a moment later
    // with buildScheduleFormState(null, ...), which always resets back to
    // eventType 'regular' regardless of what was actually being created.
    if (!editingSchedule) {
      return
    }

    const currentParticipantIds =
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
  }, [currentSession, editingSchedule, scheduleParticipantMap, teachers, todayString])

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

      if (!authUserId) {
        return
      }

      try {
        setIsLoading(true)
        setLoadError(null)
        setLoadedUserId(null)

        // Each table's change number, asked before the data: a change made while the data is read then
        // shows up in the next check (useLiveSync), which reads again only what changed.
        const nextVersions = await fetchTableVersions()
        const [
          nextClassrooms,
          nextTeachers,
          nextStudents,
          nextSchedules,
          nextParticipants,
          nextScheduleExceptions,
          nextTrialBookings,
          nextLessonLogs,
          nextLessonReviews,
          nextLeads,
          nextMakeupPlans,
          nextLeadOptions,
          nextPackages,
          nextReviewCriteria,
          nextAttendanceStatuses,
          nextRewards,
          nextSubjects,
          nextAgeGroups,
          nextProgramLevels,
        ] = await Promise.all([
          fetchClassroomsFromSupabase(),
          fetchTeachersFromSupabase(),
          fetchStudentsFromSupabase(),
          fetchSchedulesFromSupabase(),
          fetchScheduleParticipantsFromSupabase(),
          fetchScheduleExceptionsFromSupabase(),
          fetchTrialBookingsFromSupabase(),
          fetchLessonLogSummariesFromSupabase(),
          fetchLessonLogStudentReviewsFromSupabase(),
          fetchLeadsFromSupabase(),
          fetchMakeupPlansFromSupabase(),
          fetchLeadOptionsFromSupabase(),
          fetchPackagesFromSupabase(),
          loadReviewCriteria(),
          loadAttendanceStatuses(),
          loadRewards(),
          loadSubjects(),
          loadAgeGroups(),
          loadProgramLevels(),
        ])

        if (!cancelled) {
          setClassrooms(nextClassrooms)
          setTeachers(nextTeachers)
          setStudents(nextStudents)
          setSchedules(nextSchedules)
          setScheduleParticipants(nextParticipants)
          setScheduleExceptions(nextScheduleExceptions)
          setTrialBookings(nextTrialBookings)
          setLessonLogs(nextLessonLogs)
          setLessonReviews(nextLessonReviews)
          setLeads(nextLeads)
          setMakeupPlans(nextMakeupPlans)
          setLeadOptions(nextLeadOptions)
          setPackages(nextPackages)
          if (nextReviewCriteria) {
            setReviewCriteria(nextReviewCriteria)
          }
          if (nextAttendanceStatuses) {
            setAttendanceStatusOptions(nextAttendanceStatuses)
          }
          if (nextRewards) {
            setRewardPresets(nextRewards.presets)
            setRewardLevels(nextRewards.levels)
          }
          if (nextSubjects) {
            setSubjects(nextSubjects)
          }
          if (nextAgeGroups) {
            setAgeGroups(nextAgeGroups)
          }
          if (nextProgramLevels) {
            setProgramLevels(nextProgramLevels)
          }
          coreVersions.current = nextVersions
          setLoadedUserId(authUserId)
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
  }, [authUserId, loadAttempt])

  // The change number of each table the data on screen matches (see useLiveSync).
  const coreVersions = useRef<TableVersions | null>(null)
  // Reads the core data again without the loading screen and swaps in only what changed, so another
  // staff member's change (or a teacher's) shows up by itself. Given some parts, only those are read.
  async function syncCoreQuietly(target: CoreSyncTarget = 'all') {
    const read = <T,>(group: CoreGroup, load: () => Promise<T>): Promise<T | null> =>
      target === 'all' || target.has(group) ? load() : Promise.resolve(null)
    const [
      nextClassrooms,
      nextTeachers,
      nextStudents,
      nextSchedules,
      nextParticipants,
      nextScheduleExceptions,
      nextTrialBookings,
      nextLessonLogs,
      nextLessonReviews,
      nextLeads,
      nextMakeupPlans,
      nextLeadOptions,
      nextPackages,
      nextReviewCriteria,
      nextAttendanceStatuses,
      nextRewards,
      nextSubjects,
      nextAgeGroups,
      nextProgramLevels,
    ] = await Promise.all([
      read('classrooms', fetchClassroomsFromSupabase),
      read('teachers', fetchTeachersFromSupabase),
      read('students', fetchStudentsFromSupabase),
      read('schedules', fetchSchedulesFromSupabase),
      read('participants', fetchScheduleParticipantsFromSupabase),
      read('exceptions', fetchScheduleExceptionsFromSupabase),
      read('trialBookings', fetchTrialBookingsFromSupabase),
      read('lessonLogs', fetchLessonLogSummariesFromSupabase),
      read('lessonReviews', fetchLessonLogStudentReviewsFromSupabase),
      read('leads', fetchLeadsFromSupabase),
      read('makeupPlans', fetchMakeupPlansFromSupabase),
      read('leadOptions', fetchLeadOptionsFromSupabase),
      read('packages', fetchPackagesFromSupabase),
      read('reviewCriteria', loadReviewCriteria),
      read('attendanceStatuses', loadAttendanceStatuses),
      read('rewards', loadRewards),
      read('subjects', loadSubjects),
      read('ageGroups', loadAgeGroups),
      read('programLevels', loadProgramLevels),
    ])
    if (nextClassrooms) {
      setClassrooms((current) => (sameData(current, nextClassrooms) ? current : nextClassrooms))
    }
    if (nextTeachers) {
      setTeachers((current) => (sameData(current, nextTeachers) ? current : nextTeachers))
    }
    if (nextStudents) {
      setStudents((current) => (sameData(current, nextStudents) ? current : nextStudents))
    }
    if (nextSchedules) {
      setSchedules((current) => (sameData(current, nextSchedules) ? current : nextSchedules))
    }
    if (nextParticipants) {
      setScheduleParticipants((current) => (sameData(current, nextParticipants) ? current : nextParticipants))
    }
    if (nextScheduleExceptions) {
      setScheduleExceptions((current) => (sameData(current, nextScheduleExceptions) ? current : nextScheduleExceptions))
    }
    if (nextTrialBookings) {
      setTrialBookings((current) => (sameData(current, nextTrialBookings) ? current : nextTrialBookings))
    }
    if (nextLessonLogs) {
      setLessonLogs((current) => (sameData(current, nextLessonLogs) ? current : nextLessonLogs))
    }
    if (nextLessonReviews) {
      setLessonReviews((current) => (sameData(current, nextLessonReviews) ? current : nextLessonReviews))
    }
    if (nextLeads) {
      setLeads((current) => (sameData(current, nextLeads) ? current : nextLeads))
    }
    if (nextMakeupPlans) {
      setMakeupPlans((current) => (sameData(current, nextMakeupPlans) ? current : nextMakeupPlans))
    }
    if (nextLeadOptions) {
      setLeadOptions((current) => (sameData(current, nextLeadOptions) ? current : nextLeadOptions))
    }
    if (nextPackages) {
      setPackages((current) => (sameData(current, nextPackages) ? current : nextPackages))
    }
    if (nextReviewCriteria) {
      setReviewCriteria((current) => (sameData(current, nextReviewCriteria) ? current : nextReviewCriteria))
    }
    if (nextAttendanceStatuses) {
      setAttendanceStatusOptions((current) =>
        sameData(current, nextAttendanceStatuses) ? current : nextAttendanceStatuses,
      )
    }
    if (nextRewards) {
      setRewardPresets((current) => (sameData(current, nextRewards.presets) ? current : nextRewards.presets))
      setRewardLevels((current) => (sameData(current, nextRewards.levels) ? current : nextRewards.levels))
    }
    if (nextSubjects) {
      setSubjects((current) => (sameData(current, nextSubjects) ? current : nextSubjects))
    }
    if (nextAgeGroups) {
      setAgeGroups((current) => (sameData(current, nextAgeGroups) ? current : nextAgeGroups))
    }
    if (nextProgramLevels) {
      setProgramLevels((current) => (sameData(current, nextProgramLevels) ? current : nextProgramLevels))
    }
  }
  useLiveSync(
    Boolean(authUserId) && loadedUserId === authUserId && !isLoading && !loadError,
    syncCoreQuietly,
    coreVersions,
  )

  useEffect(() => {
    if (!authUserId) {
      return
    }
    let cancelled = false
    fetchLateFeedbackEdit()
      .then((open) => {
        if (!cancelled) {
          setLateFeedbackEdit(open)
        }
      })
      .catch(() => undefined)
    fetchAttendanceTakers()
      .then((takers) => {
        if (!cancelled) {
          setAttendanceTakerRules(takers.rules)
          setLessonSubstitutes(takers.substitutes)
        }
      })
      .catch(() => undefined)
    // Codes are read only when the school uses them (never before the database update).
    fetchStudentCodeEnabled()
      .then(async (enabled) => {
        const codes = enabled ? await fetchStudentCodes() : new Map<number, string>()
        if (!cancelled) {
          setStudentCodeEnabledState(enabled)
          setStudentCodes(codes)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [authUserId, loadAttempt])

  async function handleToggleLateFeedbackEdit() {
    if (!supabase) {
      return
    }
    const next = !lateFeedbackEdit
    setIsSavingLateFeedbackEdit(true)
    const { error } = await supabase.rpc('set_late_feedback_edit', { p_open: next })
    setIsSavingLateFeedbackEdit(false)
    if (error) {
      showToast(getErrorMessage(error, 'Failed to change late editing.'))
      return
    }
    setLateFeedbackEdit(next)
    showToast(
      next
        ? 'Late editing is on: teachers can edit past feedback.'
        : 'Late editing is off: feedback locks 24 hours after it is submitted.',
    )
    await refreshAdminActivities()
  }

  const visibleSchedules = useMemo(() => {
    if (!currentSession || seesAllClasses) {
      return schedules
    }

    // Their own classes and the ones they assist (a day they only cover is added on the calendar below).
    return schedules.filter((schedule) =>
      teachesSchedule(
        schedule,
        schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) : null,
        currentSession.teacherId,
      ),
    )
  }, [currentSession, schedules, seesAllClasses, classroomMap])

  // Whose things the Calendar shows: the filter's people, or (a teacher who sees only their own classes) them.
  const calendarPeople = useMemo(() => {
    const picked = filterPeople(calendarFilter, currentSession?.teacherId ?? null, calendarTeams)
    return picked ?? (currentSession && !seesAllClasses && currentSession.teacherId !== null ? new Set<number>([currentSession.teacherId]) : null)
  }, [calendarFilter, currentSession, calendarTeams, seesAllClasses])

  // The days the people shown cover on someone else's class: only those days show on the calendar.
  const coveredScheduleEvents = useMemo(() => {
    if (!calendarPeople) {
      return []
    }
    const ownById = new Map(
      schedules.map((schedule) => [schedule.id, scheduleShown(schedule, classroomMap, { ...calendarFilter, kinds: ALL_KINDS }, calendarPeople)]),
    )
    return [...calendarPeople].flatMap((personId) =>
      coveredLessons(lessonSubstitutes, personId, (id) => ownById.get(id) === true).flatMap((entry) => {
        const schedule = schedules.find((candidate) => candidate.id === entry.scheduleId)
        if (!schedule || !calendarFilter.kinds.includes(scheduleKind(schedule, classroomMap))) {
          return []
        }
        const oneDay =
          schedule.eventType === 'regular'
            ? { ...schedule, startRecur: entry.lessonDate, endRecur: entry.lessonDate }
            : schedule
        return buildScheduleEvents(
          [oneDay],
          classroomMap,
          classroomStudentMap,
          teacherMap,
          scheduleParticipantMap,
          studentMap,
          scheduleExceptions,
          makeupEntries,
        ).map((event) => ({ ...event, id: `${event.id}-cover-${entry.lessonDate}` }))
      }),
    )
  }, [
    calendarPeople,
    calendarFilter,
    lessonSubstitutes,
    schedules,
    classroomMap,
    classroomStudentMap,
    teacherMap,
    scheduleParticipantMap,
    studentMap,
    scheduleExceptions,
    makeupEntries,
  ])

  const visibleClassrooms = useMemo(() => {
    if (!currentSession || seesAllClasses) {
      return classrooms
    }

    // Every class this teacher teaches, not only those where they are the main teacher.
    return classrooms.filter((classroom) => teachesClassroom(classroom, currentSession.teacherId))
  }, [classrooms, currentSession, seesAllClasses])

  const calendarEvents = useMemo(
    () => [
      // A make-up day of a weekly class is a make-up; the rest go by the class's kind.
      ...buildScheduleEvents(
        visibleSchedules.filter((schedule) => scheduleShown(schedule, classroomMap, { ...calendarFilter, kinds: ALL_KINDS }, calendarPeople)),
        classroomMap,
        classroomStudentMap,
        teacherMap,
        scheduleParticipantMap,
        studentMap,
        scheduleExceptions,
        makeupEntries,
      ).filter((event) => {
        const props = event.extendedProps ?? {}
        const kind = props.isMakeupOnly ? 'makeup' : props.classKind === 'trial' ? 'trial' : props.classKind === 'replacement' ? 'makeup' : 'class'
        return calendarFilter.kinds.includes(kind)
      }),
      ...coveredScheduleEvents,
      ...malaysiaHolidayEvents,
      ...buildCalendarItemEvents(
        itemsVisibleTo(calendarItems.items, {
          teacherId: currentSession?.teacherId ?? null,
          sees: canEditCalendar ? 'all' : 'own',
        }).filter((item) => itemShown(item, calendarFilter, calendarPeople)),
        (id) => (id === null ? null : (teacherMap.get(id)?.fullName ?? null)),
      ),
    ],
    [
      calendarFilter,
      calendarPeople,
      calendarItems.items,
      canEditCalendar,
      classroomMap,
      classroomStudentMap,
      coveredScheduleEvents,
      currentSession?.teacherId,
      makeupEntries,
      scheduleExceptions,
      scheduleParticipantMap,
      studentMap,
      teacherMap,
      visibleSchedules,
    ],
  )

  // The month calendar shows only the special class days: cancelled, replacement, extra class and booked trial
  // (lib/calendarSpecial), except in the classic layout, which shows every class. Week and agenda show everything.
  // Null until the calendar says which view it shows.
  const [calendarViewType, setCalendarViewType] = useState<string | null>(null)
  // Whether the month also shows each weekly class, faded (Class Settings > Calendar).
  const [monthWeekly, setMonthWeekly] = useState(MONTH_WEEKLY_DEFAULT)
  const replacementLinks = useMemo(
    () => linkReplacements(scheduleExceptions, schedules, classroomMap),
    [scheduleExceptions, schedules, classroomMap],
  )

  // The Calendar's day list (a school with many classes a day; Class Settings > Calendar). Month, week and
  // agenda stay one click away; null = the layout's own first view.
  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>('auto')
  const [calendarMode, setCalendarMode] = useState<'day_list' | CalendarView | null>(null)
  const [dayListDate, setDayListDate] = useState<string | null>(null)
  const [dayListMonth, setDayListMonth] = useState<string | null>(null)
  const [openDayLesson, setOpenDayLesson] = useState<DayListLesson | null>(null)
  const [dayListNow, setDayListNow] = useState(() => new Date())
  // The filters this login used last time (a teacher starts on their own things).
  useEffect(() => {
    if (!currentSession) return
    setCalendarFilterState(
      loadCalendarFilter(String(currentSession.teacherId), defaultCalendarFilter(currentSession.role === 'teacher')),
    )
    void fetchCalendarTeams().then(setCalendarTeams)
  }, [currentSession])
  function setCalendarFilter(next: CalendarFilter) {
    setCalendarFilterState(next)
    if (currentSession) saveCalendarFilter(String(currentSession.teacherId), next)
  }
  useEffect(() => {
    if (!currentSession) return
    // Local development only: ?calendarLayout=day_list (or classic) previews a layout without saving it.
    const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('calendarLayout') : null
    void fetchCalendarLayout().then((saved) => setCalendarLayout(preview ? readCalendarLayout(preview) : saved))
    void fetchMonthWeekly().then(setMonthWeekly)
  }, [currentSession])
  const dayListOn = usesDayList(calendarLayout, schedules)
  // A school that picked the classic layout (Class Settings > Calendar) keeps the month it always had: every class
  // a solid block, no "nothing on" note. Automatic and day list show the small special-day cards.
  const classicMonth = calendarLayout === 'classic'
  const shownCalendarEvents = useMemo(() => {
    // The classic month shows every class; with "show each weekly class" switched off it keeps just the special
    // days (still drawn as blocks).
    if (calendarViewType !== 'dayGridMonth' || (classicMonth && monthWeekly)) return calendarEvents
    const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]))
    const trialSlots = visibleSchedules.filter(
      (schedule) =>
        getScheduleClassKind(schedule, classroomMap) === 'trial' &&
        scheduleShown(schedule, classroomMap, calendarFilter, calendarPeople),
    )
    return [
      ...monthSpecialEvents(calendarEvents, {
        schedules,
        classroomMap,
        subjectName: (id) => subjectName.get(id) ?? null,
        links: replacementLinks,
        makeupPlans,
        weekly: monthWeekly,
      }),
      ...bookedTrialEvents(trialBookings, trialSlots, scheduleExceptions, classroomMap, (id) => teacherMap.get(id)?.fullName ?? ''),
    ]
  }, [
    calendarViewType,
    classicMonth,
    monthWeekly,
    calendarEvents,
    subjects,
    visibleSchedules,
    classroomMap,
    calendarFilter,
    calendarPeople,
    schedules,
    replacementLinks,
    makeupPlans,
    trialBookings,
    scheduleExceptions,
    teacherMap,
  ])
  const showDayList = dayListOn && (calendarMode ?? 'day_list') === 'day_list'
  const shownDayListDate = dayListDate ?? todayString
  const shownDayListMonth = dayListMonth ?? shownDayListDate.slice(0, 7)
  useEffect(() => {
    if (visibleSection !== 'calendar' || !showDayList) return undefined
    const timer = window.setInterval(() => setDayListNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [visibleSection, showDayList])
  const dayListLessons = useMemo(() => {
    if (visibleSection !== 'calendar' || !showDayList) return []
    const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]))
    const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]))
    // The people shown: the classes each of them takes attendance for that day (their own, the ones they
    // assist, the days they cover).
    const takesFor = (schedule: Schedule, date: string) =>
      [...(calendarPeople ?? [])].some((personId) =>
        canTakeAttendance({ ...attendanceTakerContext, isAdmin: false, teacherId: personId }, schedule, date),
      )
    // Who is in a class: today's members for the month's counts (quick), the list on the day for the chosen day.
    const quickRoster = (scheduleId: number, date: string) => {
      const schedule = scheduleById.get(scheduleId)
      const classroom = schedule?.classroomId ? classroomMap.get(schedule.classroomId) : null
      return schedule?.eventType === 'regular' && classroom && classroom.category !== 'trial'
        ? (classroomStudentMap.get(classroom.id) ?? []).map((student) => student.id)
        : getScheduleRosterStudentIds(scheduleId, date)
    }
    const sources = {
      teacherId: null,
      schedules: calendarPeople ? schedules : visibleSchedules,
      exceptions: scheduleExceptions,
      classroomMap,
      lessonLogs,
      makeupEntries,
      takes: calendarPeople ? takesFor : undefined,
    }
    const weeks = monthWeeks(shownDayListMonth)
    const week = getWeekRange(shownDayListDate)
    const from = [weeks[0][0], week.start].sort()[0]
    const to = [weeks[weeks.length - 1][6], week.end].sort()[1]
    const items = [
      ...getAgendaItems({ ...sources, getRosterIds: quickRoster }, todayString, from, to).filter((item) => item.date !== shownDayListDate),
      ...getAgendaItems({ ...sources, getRosterIds: getScheduleRosterStudentIds }, todayString, shownDayListDate, shownDayListDate),
    ]
    const kindOf = (item: AgendaItem) =>
      item.isMakeupOnly || item.kind === 'replacement' ? 'makeup' : item.kind === 'trial' ? 'trial' : 'class'
    return items.filter((item) => calendarFilter.kinds.includes(kindOf(item))).map((item): DayListLesson => {
      const schedule = scheduleById.get(item.scheduleId)
      const classroom = item.classroomId !== null ? classroomMap.get(item.classroomId) ?? null : null
      return {
        ...item,
        teacherName: teacherMap.get(item.teacherId)?.fullName ?? 'Unknown teacher',
        grade: classroom?.ageGroup ?? '',
        subject: classroom?.subjectId ? subjectName.get(classroom.subjectId) ?? null : null,
        fbGroupUrl: schedule?.fbGroupUrl ?? null,
        zoomLink: lessonFixedZoomLink(schedule, classroom),
      }
    })
    // getScheduleRosterStudentIds reads students, the maps and the bookings (see teacherAgenda above).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleSection,
    showDayList,
    schedules,
    visibleSchedules,
    subjects,
    calendarPeople,
    calendarFilter.kinds,
    classroomMap,
    classroomStudentMap,
    scheduleExceptions,
    lessonLogs,
    makeupEntries,
    attendanceTakerContext,
    shownDayListMonth,
    shownDayListDate,
    todayString,
    teacherMap,
    students,
    trialBookingMap,
    makeupMap,
    scheduleParticipantMap,
  ])

  // One class day as the day list's window shows it (the month calendar opens a replacement or extra class in it).
  function dayLessonFor(scheduleId: number, date: string): DayListLesson | null {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) return null
    const [item] = getAgendaItems(
      {
        teacherId: null,
        schedules: [schedule],
        exceptions: scheduleExceptions,
        classroomMap,
        lessonLogs,
        makeupEntries,
        getRosterIds: getScheduleRosterStudentIds,
      },
      todayString,
      date,
      date,
    )
    if (!item) return null
    // A replacement made from a cancelled day is that day's class: its grade and subject.
    const madeFor = replacementLinks.byReplacement.get(scheduleId)
    const ownClass = schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) ?? null : null
    const madeForSchedule = madeFor ? schedules.find((entry) => entry.id === madeFor.scheduleId) : undefined
    const classroom =
      ownClass ?? (madeForSchedule?.classroomId != null ? classroomMap.get(madeForSchedule.classroomId) ?? null : null)
    return {
      ...item,
      teacherName: teacherMap.get(item.teacherId)?.fullName ?? 'Unknown teacher',
      grade: classroom?.ageGroup ?? '',
      subject: classroom?.subjectId ? subjects.find((subject) => subject.id === classroom.subjectId)?.name ?? null : null,
      fbGroupUrl: schedule.fbGroupUrl ?? null,
      zoomLink: lessonFixedZoomLink(schedule, ownClass),
    }
  }
  // The tasks, meetings, events and follow-ups on the days the day list shows.
  const dayListItems = useMemo((): DayListItem[] => {
    if (visibleSection !== 'calendar' || !showDayList) return []
    const weeks = monthWeeks(shownDayListMonth)
    const week = getWeekRange(shownDayListDate)
    const from = [weeks[0][0], week.start].sort()[0]
    const to = [weeks[weeks.length - 1][6], week.end].sort()[1]
    return itemsVisibleTo(calendarItems.items, {
      teacherId: currentSession?.teacherId ?? null,
      sees: canEditCalendar ? 'all' : 'own',
    })
      .filter((item) => item.date >= from && item.date <= to && itemShown(item, calendarFilter, calendarPeople))
      .map((item) => ({
        id: item.id,
        kind: itemKind(item) as DayListItem['kind'],
        title: item.title,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        assigneeName: item.assigneeId === null ? null : teacherMap.get(item.assigneeId)?.fullName ?? null,
        isDone: item.isDone,
      }))
  }, [
    visibleSection,
    showDayList,
    shownDayListMonth,
    shownDayListDate,
    calendarItems.items,
    currentSession?.teacherId,
    canEditCalendar,
    calendarFilter,
    calendarPeople,
    teacherMap,
  ])
  // Teachers and staff for the People filter.
  const calendarFilterPeople = useMemo(
    () =>
      teachers
        .filter((teacher) => teacher.isActive)
        .map((teacher) => ({ id: teacher.id, name: teacher.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teachers],
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

  // The menu: Today, then Marketing, Teaching, Students and Admin (see AppNav).
  const navEntries: NavEntry[] = [
    ...(
      [
        { key: 'home', label: 'Today', icon: House },
        { key: 'leads', label: 'Leads', icon: Funnel, group: 'marketing' },
        { key: 'whatsapp', label: 'Inbox', icon: WhatsappLogo, group: 'marketing' },
        { key: 'automations', label: 'Automations', icon: Lightning, group: 'marketing' },
        { key: 'forms', label: 'Forms', icon: ClipboardText, group: 'marketing' },
        { key: 'ai-knowledge', label: 'AI Knowledge', icon: Brain, group: 'marketing' },
        { key: 'content-studio', label: 'Content Studio', icon: Megaphone, group: 'marketing' },
        { key: 'content-library', label: 'Content Library', icon: Images, group: 'marketing' },
        { key: 'calendar', label: 'Calendar', icon: CalendarBlank, group: 'teaching' },
        { key: 'classrooms', label: 'My Classroom', icon: Chalkboard, group: 'teaching' },
        { key: 'videos', label: 'Class Videos', icon: FilmStrip, group: 'teaching' },
        { key: 'questions', label: 'Question Bank', icon: Exam, group: 'teaching' },
        { key: 'students', label: 'Student List', icon: GraduationCap, group: 'students' },
        { key: 'app-logins', label: 'App Logins', icon: DeviceMobile, group: 'students' },
        { key: 'student-inbox', label: 'Student Inbox', icon: ChatCircleDots, group: 'students' },
        { key: 'student-chat', label: 'Student Chat', icon: ChatsCircle, group: 'students' },
        { key: 'fee-calculator', label: 'Fee Calculator', icon: Calculator, group: 'students' },
        { key: 'teachers', label: 'My Team', icon: IdentificationBadge, group: 'admin' },
        { key: 'team-replies', label: 'Team Replies', icon: ChatCenteredText, group: 'admin' },
        { key: 'teacher-quality', label: 'Teacher Quality', icon: ChartLineUp, group: 'admin' },
        { key: 'activity', label: 'Activity Log', icon: ClockCounterClockwise, group: 'admin' },
      ] satisfies { key: AppSection; label: string; icon: Icon; group?: NavGroupKey }[]
    )
      .filter((item) => allowedSections.includes(item.key))
      .map((item) => ({
        id: item.key,
        label: item.label,
        icon: item.icon,
        group: 'group' in item ? item.group : undefined,
        section: item.key,
        badge:
          item.key === 'forms'
            ? { count: unreadFormSubmissions, noun: 'new submissions' }
            : item.key === 'whatsapp'
              ? { count: unreadWhatsApp, noun: 'chats waiting' }
              : item.key === 'student-inbox'
                ? { count: unreadStudentInbox, noun: 'chats waiting' }
                : item.key === 'student-chat'
                  ? { count: appChat.unread, noun: 'unread messages' }
                  : undefined,
      })),
    // Windows that used to sit behind a button on a page.
    ...(can('packages')
      ? [{ id: 'packages', label: 'Packages', icon: PackageIcon, group: 'students' as const, onSelect: () => setIsPackagesOpen(true) }]
      : []),
    ...(can('class_settings')
      ? [{ id: 'class-settings', label: 'Class Settings', icon: GearSix, group: 'admin' as const, onSelect: openClassSettings }]
      : []),
  ]
  // Students sit before Programmes and Packages; My Team before Class Settings and the log.
  navEntries.sort(
    (a, b) => NAV_ORDER.indexOf(a.id) - NAV_ORDER.indexOf(b.id),
  )

  function selectNav(entry: NavEntry) {
    if (entry.section) setActiveSection(entry.section)
    else entry.onSelect?.()
  }

  // What the open attendance form rates: every switched-on criterion, plus
  // switched-off ones the lesson's saved reviews were scored on.
  const attendanceReviewMetrics = useMemo(
    () => getReviewMetrics(reviewCriteria, Object.values(attendanceReviews)),
    [attendanceReviews, reviewCriteria],
  )

  const attendanceRoster = useMemo(() => {
    if (!attendanceModal) {
      return []
    }

    return attendanceRosterIds
      .map((studentId) => studentMap.get(studentId))
      .filter((student): student is Student => Boolean(student))
  }, [attendanceModal, attendanceRosterIds, studentMap])

  // A class day's substitute teacher, why this login may take its attendance,
  // and (for whoever may edit classes, when the school uses substitutes) who
  // may cover it: anyone who teaches, except the class's own teacher.
  function getLessonSubstitute(scheduleId: number, lessonDate: string) {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    const teacherId = substituteMap.get(substituteKey(scheduleId, lessonDate)) ?? null
    return {
      teacherId,
      teacherName: teacherId !== null ? (teacherMap.get(teacherId)?.fullName ?? 'Substitute teacher') : null,
      role: schedule ? attendanceTakerRole(attendanceTakerContext, schedule, lessonDate) : null,
      options:
        canEditClasses && attendanceTakerRules.substitutes && schedule
          ? teachers
              .filter((teacher) => teacher.isActive && teacher.role !== 'staff' && teacher.id !== schedule.teacherId)
              .map((teacher) => ({ id: teacher.id, name: teacher.fullName }))
          : null,
      isSaving: isSavingSubstitute,
      onChange: (next: number | null) => void handleSetLessonSubstitute(scheduleId, lessonDate, next),
    }
  }

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

  function updateLeadForm<K extends keyof LeadFormState>(
    key: K,
    value: LeadFormState[K],
  ) {
    setLeadFormState((currentState) => ({
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
      phone: student.phone ?? '',
      classroomId: student.classroomId ? String(student.classroomId) : '',
      notes: student.notes ?? '',
      studentType: student.studentType,
      dateOfBirth: student.dateOfBirth ?? '',
      studentCode: studentCodes.get(student.id) ?? '',
    })
    setStudentExtrasForm(extrasToForm(studentFields.extras.get(student.id)))
  }

  // Admin: switches the school's student codes on or off.
  async function handleToggleStudentCode() {
    const next = !studentCodeEnabled
    setIsSavingStudentCodeSetting(true)
    const failure = await setStudentCodeEnabled(next)
    const codes = !failure && next ? await fetchStudentCodes() : studentCodes
    setIsSavingStudentCodeSetting(false)
    if (failure) {
      showToast(failure)
      return
    }
    setStudentCodeEnabledState(next)
    setStudentCodes(codes)
  }

  // Saves a student's code and keeps the list in step. Throws with a reason to show.
  async function saveStudentCodeFor(studentId: number, next: string | undefined) {
    if (!studentCodeEnabled || next === undefined) {
      return
    }
    await saveStudentCode(studentId, next, studentCodes.get(studentId) ?? null)
    setStudentCodes((current) => {
      const updated = new Map(current)
      if (next.trim()) updated.set(studentId, next.trim())
      else updated.delete(studentId)
      return updated
    })
  }

  function closeEditStudent() {
    setEditingStudentId(null)
    setStudentDetailsSaveError(null)
  }

  // The birth date is written on its own, so the long create and update functions stay as they are.
  // `current` is what the student has now: undefined means the database has no such column yet.
  async function saveBirthDate(studentId: number, next: string, current: string | null | undefined) {
    const value = next.trim() || null
    if (value === (current ?? null) || (value === null && current === undefined)) {
      return
    }
    if (value && value > todayString) {
      throw new Error('The date of birth cannot be in the future.')
    }
    const { error } = await supabase!.from('students').update({ date_of_birth: value }).eq('id', studentId)
    if (error) {
      throw new Error(
        error.code === '42703' || error.code === 'PGRST204'
          ? "The date of birth can't be saved until the database update for it is applied."
          : error.message,
      )
    }
  }

  const offeredPackages = useMemo(() => getOfferedPackages(packages), [packages])

  function findPackage(packageId: string) {
    return packages.find((pkg) => String(pkg.id) === packageId) ?? null
  }

  // A new student: the package sets the classes and lesson dates, and starts
  // the fee year when it has fees (no-fee packages leave the fees unpaid).
  function applyCreatePackage(packageId: string, startDate: string) {
    const pkg = findPackage(packageId)
    setCreateStudentFormState((current) => {
      if (!pkg) {
        return { ...current, packageId: '', startDate }
      }
      const plan = planEnrollment(pkg, startDate)
      const feeExpiry = planFeeChange(pkg, startDate, plan.endDate, null, [])?.to ?? startDate
      return {
        ...current,
        packageId,
        startDate,
        initialHours: String(plan.classCount),
        lessonExpiryDate: plan.endDate,
        accountFeeExpiryDate: feeExpiry,
        miraiClubExpiryDate: feeExpiry,
      }
    })
  }

  function getCreatePackageNotice() {
    const pkg = findPackage(createStudentFormState.packageId)
    if (!pkg || !brand.usesFees) {
      return null
    }
    return pkg.includesFees
      ? `Account Fee and ${brand.clubName} run for a year, to ${formatDate(createStudentFormState.accountFeeExpiryDate)}.`
      : `No Account Fee or ${brand.clubName} for this package.`
  }

  // A renewal: the package sets the classes and lesson dates. Fee changes
  // are only offered on save, in a confirm box.
  function applyRenewalPackage(packageId: string, startDate: string) {
    const pkg = findPackage(packageId)
    setStudentFormState((current) => {
      if (!pkg) {
        return { ...current, packageId: '', startDate }
      }
      const plan = planEnrollment(pkg, startDate)
      return {
        ...current,
        packageId,
        startDate,
        addHours: String(plan.classCount),
        lessonExpiryDate: plan.endDate,
      }
    })
  }

  function getRenewalFeeChanges(): { label: string; change: FeeChange }[] {
    const pkg = findPackage(studentFormState.packageId)
    if (!pkg || !selectedStudent || !studentFormState.lessonExpiryDate) {
      return []
    }
    const kindById = new Map(packages.map((entry) => [entry.id, entry.kind]))
    const history = renewalHistory.map((entry) => ({
      startDate: entry.startDate,
      kind: kindById.get(entry.packageId) ?? 'regular',
    }))
    const plan = (current: string) =>
      planFeeChange(pkg, studentFormState.startDate, studentFormState.lessonExpiryDate, current, history)
    return [
      { label: 'Account Fee', change: plan(selectedStudent.accountFeeExpiryDate) },
      { label: brand.clubName, change: plan(selectedStudent.miraiClubExpiryDate) },
    ].filter((entry): entry is { label: string; change: FeeChange } => entry.change !== null)
  }

  function describeFeeChanges(changes: { label: string; change: FeeChange }[]) {
    return changes
      .map(({ label, change }) =>
        change.kind === 'extend'
          ? `${label}: ${formatDate(change.from!)} -> ${formatDate(change.to)}`
          : `${label}: ran out${change.from ? ` on ${formatDate(change.from)}` : ''}, new year to ${formatDate(change.to)}`,
      )
      .join('\n')
  }

  function getRenewalPackageNotice() {
    const pkg = findPackage(studentFormState.packageId)
    if (!pkg || !brand.usesFees) {
      return null
    }
    if (!pkg.includesFees) {
      return `No Account Fee or ${brand.clubName} for this package; their dates stay as they are.`
    }
    const changes = getRenewalFeeChanges()
    if (changes.length === 0) {
      return `Account Fee and ${brand.clubName} already cover this package.`
    }
    return changes.some(({ change }) => change.kind === 'new')
      ? `Account Fee / ${brand.clubName} have run out. You will be asked on save whether to start a new year.`
      : `This package goes past the Account Fee / ${brand.clubName} year. You will be asked on save whether to extend them.`
  }

  function openStudentRenewal(studentId: number) {
    // An HOA student is not renewed: they become a regular student first, class and package in one step.
    if (students.find((entry) => entry.id === studentId)?.studentType === 'trial') {
      setConvertingStudentId(studentId)
      return
    }
    setStudentSaveError(null)
    setSelectedStudentId(studentId)
  }

  // The lead an HOA student came through, while it is not converted yet.
  function getOpenHoaLeadId(studentId: number) {
    const leadIds = trialBookings
      .filter((booking) => booking.studentId === studentId && booking.leadId !== null)
      .map((booking) => booking.leadId as number)
    return leadIds.find((id) => leads.find((lead) => lead.id === id)?.convertedStudentId == null) ?? null
  }

  // HOA -> regular on the same student. Null when done, else the reason.
  async function convertHoa(input: ConvertHoaInput) {
    const failure = await convertHoaStudent(input)
    if (failure) {
      return failure
    }
    await Promise.all([refreshStudentsAndLogs(), refreshClassrooms(), refreshLeads(), refreshAdminActivities()])
    return null
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
    setStudentExtrasForm(EMPTY_STUDENT_EXTRAS_FORM)
    setIsCreateStudentOpen(true)
    setCreateStudentFormState({
      packageId: '',
      startDate: todayString,
      fullName: '',
      phone: '',
      classroomId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      studentType: 'regular',
      dateOfBirth: '',
    })
  }

  function closeCreateStudentModal() {
    setIsCreateStudentOpen(false)
    setCreateStudentSaveError(null)
    setConvertingLeadId(null)
  }

  function openBulkImportPreviewStudentsModal() {
    setBulkImportPreviewStudentError(null)
    setIsBulkImportPreviewStudentsOpen(true)
  }

  function closeBulkImportPreviewStudentsModal() {
    setIsBulkImportPreviewStudentsOpen(false)
    setBulkImportPreviewStudentError(null)
  }

  function openCreateTeacherModal() {
    setCreateTeacherSaveError(null)
    setEditingTeacherId(null)
    setIsCreateTeacherOpen(true)
    setTeacherLoginPassword('')
    setProvisionLoginError(null)
    setCreateTeacherFormState({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
      permissions: {},
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
    setTeacherLoginPassword('')
    setProvisionLoginError(null)
    setCreateTeacherFormState({
      username: teacher.username,
      fullName: teacher.fullName,
      email: teacher.email ?? '',
      phone: teacher.phone ?? '',
      role: teacher.role,
      permissions: teacher.permissions,
    })
  }

  function closeCreateTeacherModal() {
    setIsCreateTeacherOpen(false)
    setEditingTeacherId(null)
    setCreateTeacherSaveError(null)
    setTeacherLoginPassword('')
    setProvisionLoginError(null)
  }

  async function handleProvisionTeacherLogin() {
    if (!editingTeacher) {
      return
    }

    if (teacherLoginPassword.length < 8) {
      setProvisionLoginError('Password must be at least 8 characters.')
      return
    }

    setIsProvisioningLogin(true)
    setProvisionLoginError(null)

    const result = editingTeacher.authUserId
      ? await resetTeacherPassword(editingTeacher.id, teacherLoginPassword)
      : await provisionTeacherLogin(editingTeacher.id, teacherLoginPassword)

    setIsProvisioningLogin(false)

    if (!result.ok) {
      setProvisionLoginError(result.error)
      return
    }

    setTeacherLoginPassword('')
    await refreshTeachers()
  }

  function openCreateLeadModal() {
    setLeadSaveError(null)
    setEditingLeadId(null)
    setIsCreateLeadOpen(true)
    // New leads start on the "Other" source, as before; PIC starts empty.
    const otherSource = leadOptions.find(
      (option) => option.kind === 'source' && option.legacyKey === 'other',
    )
    setLeadFormState({
      fullName: '',
      phone: '',
      sourceId: otherSource ? String(otherSource.id) : '',
      picId: '',
      state: '',
      tagIds: [],
      status: 'new',
      children: [],
      notes: '',
      addedDate: todayString,
    })
  }

  function openLeadFormAnswers(leadId: number) {
    openEditLeadModal(leadId)
    setFocusFormAnswers(true)
  }

  function openEditLeadModal(leadId: number) {
    const lead = leads.find((entry) => entry.id === leadId)
    if (!lead) {
      return
    }

    setLeadSaveError(null)
    setFocusFormAnswers(false)
    setEditingLeadId(leadId)
    setIsCreateLeadOpen(true)
    setLeadFormState({
      fullName: lead.fullName ?? '',
      phone: lead.phone ?? '',
      sourceId: lead.sourceId !== null ? String(lead.sourceId) : '',
      picId: lead.picId !== null ? String(lead.picId) : '',
      state: lead.state ?? '',
      nameZh: lead.nameZh ?? '',
      secondParentPhone: lead.secondParentPhone ?? '',
      tagIds: lead.tagIds,
      status: lead.status,
      children: lead.children.map((child) => ({
        name: child.name,
        age: String(child.age),
        phone: child.phone ?? '',
      })),
      notes: lead.notes ?? '',
      addedDate: lead.addedDate,
    })
  }

  function closeLeadModal() {
    setIsCreateLeadOpen(false)
    setEditingLeadId(null)
    setLeadSaveError(null)
  }

  // Adds a Source, PIC or Tag name (a tag also gets its colour); returns it so a
  // picker can select it at once.
  async function handleAddLeadOption(kind: LeadOptionKind, label: string, color?: string) {
    if (!supabase) {
      return null
    }

    const { data, error } = await supabase
      .from('lead_options')
      .insert({ kind, label: label.trim(), ...(color ? { color } : {}) })
      .select('id, kind, label, is_active, legacy_key, color')
      .single()

    if (error) {
      showToast(
        error.code === '23505'
          ? `"${label.trim()}" is already in the list.`
          : getErrorMessage(error, 'Failed to add this name.'),
      )
      return null
    }

    const option = mapLeadOptionRow(data)
    setLeadOptions((current) => [...current, option])
    return option
  }

  // Renaming changes the name on every lead that uses it.
  async function handleRenameLeadOption(option: LeadOption, label: string) {
    if (!supabase) {
      return false
    }

    const { error } = await supabase
      .from('lead_options')
      .update({ label })
      .eq('id', option.id)

    if (error) {
      showToast(
        error.code === '23505'
          ? `"${label}" is already in the list.`
          : getErrorMessage(error, 'Failed to rename.'),
      )
      return false
    }

    setLeadOptions((current) =>
      current.map((entry) => (entry.id === option.id ? { ...entry, label } : entry)),
    )
    return true
  }

  async function handleSetLeadOptionColor(option: LeadOption, color: string) {
    if (!supabase) {
      return
    }

    const { error } = await supabase.from('lead_options').update({ color }).eq('id', option.id)

    if (error) {
      showToast(getErrorMessage(error, 'Failed to change the colour.'))
      return
    }

    setLeadOptions((current) =>
      current.map((entry) => (entry.id === option.id ? { ...entry, color } : entry)),
    )
  }

  // Hidden names leave the pickers but stay on existing leads.
  async function handleSetLeadOptionActive(option: LeadOption, isActive: boolean) {
    if (!supabase) {
      return
    }

    const { error } = await supabase
      .from('lead_options')
      .update({ is_active: isActive })
      .eq('id', option.id)

    if (error) {
      showToast(getErrorMessage(error, 'Failed to update this name.'))
      return
    }

    setLeadOptions((current) =>
      current.map((entry) => (entry.id === option.id ? { ...entry, isActive } : entry)),
    )
  }

  function toPackageRow(draft: PackageDraft) {
    return {
      name: draft.name,
      kind: draft.kind,
      class_count: draft.classCount,
      duration_months: draft.durationMonths,
      includes_fees: draft.includesFees,
    }
  }

  const packageColumns = 'id, name, kind, class_count, duration_months, includes_fees, is_active, sort_order'

  function openClassSettings() {
    setIsClassSettingsOpen(true)
    fetchZoomMeetingOptions()
      .then(setZoomOptions)
      .catch((error) => showToast(getErrorMessage(error, 'Failed to load the Zoom settings.')))
  }

  // Adds (criterion null) or changes a review criterion; null when saved,
  // else the reason.
  async function saveReviewCriterion(
    criterion: ReviewCriterion | null,
    changes: Partial<ReviewCriterionDraft> & { sortOrder?: number; isActive?: boolean },
  ) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }

    const { data, error } = await supabase.rpc('save_review_criterion', {
      p_id: criterion?.id ?? null,
      p_name: changes.name ?? criterion?.name ?? '',
      p_description: changes.description !== undefined ? changes.description : (criterion?.description ?? null),
      p_max_score: changes.maxScore ?? null,
      p_remark_required_at_or_below: changes.remarkRequiredAtOrBelow ?? null,
      p_sort_order: changes.sortOrder ?? null,
      p_is_active: changes.isActive ?? null,
    })

    if (error) {
      return error.code === '23505'
        ? `"${changes.name ?? criterion?.name}" is already a criterion.`
        : getErrorMessage(error, 'Failed to save this criterion.')
    }

    const saved = mapReviewCriterionRow(data)
    setReviewCriteria((current) =>
      current.some((entry) => entry.id === saved.id)
        ? current.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...current, saved],
    )
    return null
  }

  // Swaps the order with the next shown criterion up or down.
  async function moveReviewCriterion(criterion: ReviewCriterion, direction: -1 | 1) {
    const shown = reviewCriteria
      .filter((entry) => entry.isActive)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    const index = shown.findIndex((entry) => entry.id === criterion.id)
    const other = shown[index + direction]
    if (!other) {
      return null
    }
    // Equal orders would not move; spread them first.
    const mine = criterion.sortOrder === other.sortOrder ? criterion.sortOrder + direction : other.sortOrder
    return (
      (await saveReviewCriterion(criterion, { sortOrder: mine })) ??
      (await saveReviewCriterion(other, { sortOrder: criterion.sortOrder }))
    )
  }

  // Adds (status null) or changes an attendance status; null when saved,
  // else the reason.
  async function saveAttendanceStatus(
    status: AttendanceStatusOption | null,
    changes: Partial<Pick<AttendanceStatusOption, 'label' | 'attended' | 'deductsLesson' | 'color' | 'sortOrder' | 'isActive'>>,
  ) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }

    const { data, error } = await supabase.rpc('save_attendance_status', {
      p_key: status?.key ?? null,
      p_label: changes.label ?? status?.label ?? null,
      p_attended: changes.attended ?? null,
      p_deducts_lesson: changes.deductsLesson ?? null,
      p_color: changes.color ?? null,
      p_sort_order: changes.sortOrder ?? null,
      p_is_active: changes.isActive ?? null,
    })

    if (error) {
      return error.code === '23505'
        ? `"${changes.label ?? status?.label}" is already a status.`
        : getErrorMessage(error, 'Failed to save this status.')
    }

    const saved = mapAttendanceStatusRow(data)
    setAttendanceStatusOptions((current) =>
      current.some((entry) => entry.key === saved.key)
        ? current.map((entry) => (entry.key === saved.key ? saved : entry))
        : [...current, saved],
    )
    return null
  }

  async function reloadRewards() {
    const next = await loadRewards()
    if (next) {
      setRewardPresets(next.presets)
      setRewardLevels(next.levels)
    }
  }

  async function saveAttendanceStatusPoints(status: AttendanceStatusOption, points: number) {
    const failure = await setAttendanceStatusPoints(status.key, points)
    if (!failure) {
      setAttendanceStatusOptions((current) =>
        current.map((entry) => (entry.key === status.key ? { ...entry, rewardPoints: points } : entry)),
      )
    }
    return failure
  }

  async function saveZoomOptions(options: ZoomMeetingOptions) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }
    const { error } = await supabase.rpc('set_zoom_meeting_options', { p_options: options })
    if (error) {
      return getErrorMessage(error, 'Failed to save the Zoom settings.')
    }
    setZoomOptions(options)
    return null
  }

  async function handleAddPackage(draft: PackageDraft) {
    if (!supabase) {
      return false
    }

    const sortOrder = Math.max(0, ...packages.map((pkg) => pkg.sortOrder)) + 10
    const { data, error } = await supabase
      .from('packages')
      .insert({ ...toPackageRow(draft), sort_order: sortOrder })
      .select(packageColumns)
      .single()

    if (error) {
      showToast(
        error.code === '23505'
          ? `"${draft.name}" is already a package.`
          : getErrorMessage(error, 'Failed to add this package.'),
      )
      return false
    }

    setPackages((current) => [...current, mapPackageRow(data)])
    return true
  }

  // Changing a package only affects later sign-ups; past enrollments keep
  // the classes and dates they were given.
  async function handleSavePackage(pkg: Package, draft: PackageDraft) {
    if (!supabase) {
      return false
    }

    const { data, error } = await supabase
      .from('packages')
      .update(toPackageRow(draft))
      .eq('id', pkg.id)
      .select(packageColumns)
      .single()

    if (error) {
      showToast(
        error.code === '23505'
          ? `"${draft.name}" is already a package.`
          : getErrorMessage(error, 'Failed to save this package.'),
      )
      return false
    }

    const saved = mapPackageRow(data)
    setPackages((current) => current.map((entry) => (entry.id === pkg.id ? saved : entry)))
    return true
  }

  async function handleSetPackageActive(pkg: Package, isActive: boolean) {
    if (!supabase) {
      return
    }

    const { error } = await supabase.from('packages').update({ is_active: isActive }).eq('id', pkg.id)

    if (error) {
      showToast(getErrorMessage(error, 'Failed to update this package.'))
      return
    }

    setPackages((current) =>
      current.map((entry) => (entry.id === pkg.id ? { ...entry, isActive } : entry)),
    )
  }

  // Tags students with the package they are already on; classes and dates
  // stay as they are.
  async function handleAssignPackages(changes: PackageAssignment[]) {
    if (!supabase) {
      return
    }

    setIsSavingAssignments(true)
    setAssignPackagesError(null)
    try {
      for (const change of changes) {
        const { error } = await supabase.rpc('set_student_package', {
          p_student_id: change.studentId,
          p_package_id: change.packageId,
        })
        if (error) {
          throw error
        }
      }
      setIsAssignPackagesOpen(false)
    } catch (error) {
      setAssignPackagesError(getErrorMessage(error, 'Failed to save the packages.'))
    } finally {
      // Some may have saved before a failure, so always reload.
      await refreshStudentsAndLogs().catch(() => undefined)
      setIsSavingAssignments(false)
    }
  }

  function openBulkImportLeadsModal() {
    setBulkImportLeadError(null)
    setIsBulkImportLeadsOpen(true)
  }

  function closeBulkImportLeadsModal() {
    setIsBulkImportLeadsOpen(false)
    setBulkImportLeadError(null)
  }

  async function handleBulkImportLeads(rows: BulkLeadRow[]) {
    if (!supabase || rows.length === 0) {
      return
    }

    try {
      setIsImportingLeads(true)
      setBulkImportLeadError(null)

      const { error } = await supabase.from('leads').insert(rows)

      if (error) {
        throw error
      }

      await recordAdminActivity('lead_bulk_imported', 'lead', null, `${rows.length} leads`, {
        count: rows.length,
      })

      await Promise.all([refreshLeads(), refreshAdminActivities()])
      closeBulkImportLeadsModal()
    } catch (error) {
      setBulkImportLeadError(
        error instanceof Error ? error.message : 'Failed to import leads.',
      )
    } finally {
      setIsImportingLeads(false)
    }
  }

  function openFollowUpModal(leadId: number) {
    setFollowUpSaveError(null)
    setFollowUpLeadId(leadId)
  }

  function closeFollowUpModal() {
    setFollowUpLeadId(null)
    setFollowUpSaveError(null)
    setTaskSaveError(null)
  }

  function openCreateClassroom() {
    setClassroomSaveError(null)
    setEditingClassroomId(null)
    setIsCreatingClassroom(true)
    setClassroomFormState({
      category: 'regular',
      name: '',
      ageGroup: selectedAgeGroup,
      programLevel: programLevelOptions[0],
      teacherId: '',
      teacherEffectiveDate: todayString,
      notes: '',
      zoomLink: '',
      programmeId: '',
      subjectId: '',
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

  function openTrialBooking(scheduleId: number, dateKey: string) {
    setTrialBookingError(null)
    setTrialBookingSlot({ scheduleId, dateKey })
  }

  function closeTrialBooking() {
    setTrialBookingSlot(null)
    setTrialBookingError(null)
  }

  // The replacement class a dragged day was moved to, if any.
  function getMovedToSchedule(scheduleId: number, occurrenceDate: string) {
    const exception = scheduleExceptions.find(
      (entry) => entry.scheduleId === scheduleId && entry.exceptionDate === occurrenceDate,
    )
    return exception?.movedToScheduleId
      ? schedules.find((entry) => entry.id === exception.movedToScheduleId) ?? null
      : null
  }

  function openCancelledOccurrenceOptions(scheduleId: number, occurrenceDate: string) {
    setCancelledOccurrenceModal({ scheduleId, occurrenceDate })
  }

  function closeCancelledOccurrenceOptions() {
    setCancelledOccurrenceModal(null)
  }

  async function refreshTrialBookings() {
    const nextTrialBookings = await fetchTrialBookingsFromSupabase()
    setTrialBookings(nextTrialBookings)
  }

  async function refreshMakeupPlans() {
    const nextMakeupPlans = await fetchMakeupPlansFromSupabase()
    setMakeupPlans(nextMakeupPlans)
  }

  // e.g. "Whole class +30 min (makes up Sep 23)" / "Ali +30 min (makes up Sep 16)"
  function describeMakeupEntries(entries: MakeupEntry[]) {
    return entries.map((entry) => {
      const who =
        entry.studentId === null
          ? 'Whole class'
          : (studentMap.get(entry.studentId)?.name ?? 'A student')
      return `${who} +${entry.extraMinutes} min (makes up ${formatDate(entry.missedDate)})`
    })
  }

  function getClassroomMakeupNotes(classroomId: number | null, date: string) {
    return classroomId === null
      ? []
      : describeMakeupEntries(makeupMap.get(makeupKey(classroomId, date)) ?? [])
  }

  function openMakeupEditor(editor: {
    classroomId: number
    planId: number | null
    missedDate: string
    studentId: number | null
    missedOptions?: { date: string; label: string }[]
  }) {
    setMakeupError(null)
    setMakeupEditor(editor)
  }

  // Student make-up: offer the classes they recently missed (latest
  // attendance revision says absent/leave, no plan yet), newest first, and
  // preselect the newest so the usual case is one click to save.
  // classroomId: which of the student's classes (a student can take several);
  // the main class when left out. Only that class's missed lessons are offered.
  async function openStudentMakeup(student: Student, classroomId: number | null = student.classroomId) {
    if (classroomId === null) {
      return
    }
    const scheduleClassroom = new Map(schedules.map((schedule) => [schedule.id, schedule.classroomId]))

    let missedOptions: { date: string; label: string }[] = []

    try {
      // Usually already fetched when the student's detail opened, so the
      // dialog opens instantly.
      const rows =
        prefetchedAttendance?.studentId === student.id
          ? prefetchedAttendance.rows
          : await fetchStudentAttendanceRows(student.id)
      const latestLogs = new Map(
        Array.from(latestLessonLogMap.values()).map((log) => [log.id, log]),
      )
      const plannedDates = new Set(
        makeupPlans
          .filter((plan) => plan.studentId === student.id)
          .map((plan) => plan.missedDate),
      )
      const seen = new Set<string>()

      missedOptions = rows
        .filter((row) => !isAttendedStatus(attendanceStatusOptions, row.status) && latestLogs.has(row.lessonLogId))
        .filter((row) => scheduleClassroom.get(latestLogs.get(row.lessonLogId)!.scheduleId) === classroomId)
        .map((row) => ({ date: latestLogs.get(row.lessonLogId)!.lessonDate, status: row.status }))
        .filter((entry) => !plannedDates.has(entry.date))
        .sort((left, right) => right.date.localeCompare(left.date))
        .filter((entry) => (seen.has(entry.date) ? false : (seen.add(entry.date), true)))
        .slice(0, 6)
        .map((entry) => ({
          date: entry.date,
          label: `${formatDate(entry.date)} · ${getStatusOption(attendanceStatusOptions, entry.status).label}`,
        }))
    } catch {
      // Suggestions are a convenience; the date can still be picked by hand.
    }

    openMakeupEditor({
      classroomId,
      planId: null,
      missedDate: missedOptions[0]?.date ?? todayString,
      studentId: student.id,
      missedOptions,
    })
  }

  function openMakeupPlan(planId: number) {
    const plan = makeupPlans.find((entry) => entry.id === planId)
    if (plan) {
      openMakeupEditor({
        classroomId: plan.classroomId,
        planId: plan.id,
        missedDate: plan.missedDate,
        studentId: plan.studentId,
      })
    }
  }

  function closeMakeupEditor() {
    setMakeupEditor(null)
    setMakeupError(null)
  }

  // Next normal class days of a classroom, for the make-up presets.
  function suggestMakeupDates(classroomId: number, afterDate: string, count: number) {
    return getUpcomingClassDates(
      schedules.filter((schedule) => schedule.classroomId === classroomId),
      scheduleExceptions,
      afterDate,
      count,
    )
  }

  async function handleSaveMakeup(input: MakeupPlanInput) {
    if (!supabase || !makeupEditor) {
      return
    }

    try {
      setIsSavingMakeup(true)
      setMakeupError(null)

      // The RPC validates every date and writes the activity log itself.
      const { error } = await supabase.rpc('save_makeup_plan', {
        p_plan_id: input.planId,
        p_classroom_id: makeupEditor.classroomId,
        p_missed_date: input.missedDate,
        p_student_id: input.studentId,
        p_missed_minutes: input.missedMinutes,
        p_notes: input.notes,
        p_sessions: input.sessions.map((session) => ({
          session_date: session.sessionDate,
          extra_minutes: session.extraMinutes,
        })),
      })

      if (error) {
        throw error
      }

      await Promise.all([refreshMakeupPlans(), refreshAdminActivities()])
      closeMakeupEditor()
      showToast('Make-up plan saved.')
    } catch (error) {
      setMakeupError(getErrorMessage(error, 'Failed to save the make-up plan.'))
    } finally {
      setIsSavingMakeup(false)
    }
  }

  async function handleDeleteMakeup(planId: number) {
    if (!supabase) {
      return
    }

    if (!(await confirm('Delete this make-up plan? The extra minutes will be removed from the calendar.'))) {
      return
    }

    try {
      setIsSavingMakeup(true)
      setMakeupError(null)

      const { error } = await supabase.rpc('delete_makeup_plan', { p_plan_id: planId })

      if (error) {
        throw error
      }

      await Promise.all([refreshMakeupPlans(), refreshAdminActivities()])
      closeMakeupEditor()
      showToast('Make-up plan deleted.')
    } catch (error) {
      setMakeupError(getErrorMessage(error, 'Failed to delete the make-up plan.'))
    } finally {
      setIsSavingMakeup(false)
    }
  }

  // Resolves true when the booking was saved, so the modal can reset its form.
  async function handleBookTrial(form: TrialBookingFormState) {
    if (!trialBookingSlot || !supabase) {
      return false
    }

    try {
      setIsSavingTrialBooking(true)
      setTrialBookingError(null)

      // The RPC also creates or updates the lead and writes the activity log.
      const { error } = await supabase.rpc('book_trial_slot', {
        p_schedule_id: trialBookingSlot.scheduleId,
        p_booking_date: trialBookingSlot.dateKey,
        p_child_name: form.childName.trim(),
        p_child_age: form.childAge.trim() ? Number(form.childAge) : null,
        p_phone: form.phone.trim() || null,
        p_lead_id: form.leadId,
        p_notes: form.notes.trim() || null,
      })

      if (error) {
        throw error
      }

      // Booking creates a lightweight trial-type student behind the scenes
      // (see 20260922010000_trial_attendance.sql) so attendance can be taken
      // against it — refresh students too, or it won't show up yet.
      await Promise.all([
        refreshTrialBookings(),
        refreshLeads(),
        refreshAdminActivities(),
        refreshStudentsAndLogs(),
      ])
      return true
    } catch (error) {
      setTrialBookingError(getErrorMessage(error, 'Failed to book this trial.'))
      return false
    } finally {
      setIsSavingTrialBooking(false)
    }
  }

  async function handleCancelTrialBooking(booking: TrialBooking) {
    if (!supabase) {
      return
    }

    if (!(await confirm(`Remove ${booking.childName} from this trial slot?`))) {
      return
    }

    try {
      setIsSavingTrialBooking(true)
      setTrialBookingError(null)

      const { error } = await supabase.rpc('cancel_trial_booking', {
        p_booking_id: booking.id,
      })

      if (error) {
        throw error
      }

      // Cancelling with no attendance recorded also removes the linked
      // trial-type student on the server — refresh students to match.
      await Promise.all([
        refreshTrialBookings(),
        refreshAdminActivities(),
        refreshStudentsAndLogs(),
      ])
    } catch (error) {
      setTrialBookingError(getErrorMessage(error, 'Failed to remove this booking.'))
    } finally {
      setIsSavingTrialBooking(false)
    }
  }

  function openCreateSchedule(prefillDate?: string, classroomId?: number) {
    setScheduleSaveError(null)
    setEditingScheduleId(null)
    setEditingOccurrenceDate(null)
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

  function openEditSchedule(scheduleId: number, occurrenceDate?: string) {
    setScheduleSaveError(null)
    setIsCreatingSchedule(false)
    setEditingScheduleId(scheduleId)
    setEditingOccurrenceDate(occurrenceDate ?? null)
  }

  // Prefills a new Replacement Class from a cancelled day of a regular class:
  // same teacher/time slot and the classroom's active roster already
  // checked, with the title/notes naming which day it makes up for. The
  // admin still picks the actual makeup date and can adjust anything.
  function openReplacementForCancelledDay(scheduleId: number, occurrenceDate: string) {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) {
      return
    }
    replacementForDayRef.current = { scheduleId, occurrenceDate }

    const classroom = schedule.classroomId ? classroomMap.get(schedule.classroomId) : null
    const label = classroom?.name ?? schedule.title
    const rosterIds = (
      schedule.classroomId ? getClassroomRosterOn(students, schedule.classroomId, occurrenceDate) : []
    )
      .filter((student) => student.isActive)
      .map((student) => String(student.id))

    setScheduleSaveError(null)
    setEditingScheduleId(null)
    setEditingOccurrenceDate(null)
    setIsCreatingSchedule(true)

    setScheduleFormState({
      title: `${label} Makeup`,
      teacherId: String(schedule.teacherId),
      classroomId: '',
      eventType: 'replacement',
      dayOfWeek: String(parseLocalDate(todayString).getDay()),
      scheduledDate: todayString,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      startRecur: todayString,
      endRecur: '',
      notes: `Makeup for ${label} (cancelled ${occurrenceDate}).`,
      participantIds: rosterIds,
    })
  }

  // A replacement made with "Add Replacement Class" remembers the cancelled day it makes up, so the month
  // calendar shows that day's green dot. Before the replacement link migration the call fails; the calendar
  // then finds the replacement by its "Makeup for ... (cancelled ...)" note, so nothing is lost.
  async function linkReplacementToCancelledDay(replacementScheduleId: number) {
    const day = replacementForDayRef.current
    if (!day || !supabase) return
    const { error } = await supabase.rpc('link_replacement_to_cancelled_day', {
      p_schedule_id: day.scheduleId,
      p_occurrence_date: day.occurrenceDate,
      p_replacement_schedule_id: replacementScheduleId,
    })
    if (error) return
    setScheduleExceptions((current) =>
      current.map((exception) =>
        exception.scheduleId === day.scheduleId && exception.exceptionDate === day.occurrenceDate
          ? { ...exception, replacementScheduleId }
          : exception,
      ),
    )
  }

  function closeScheduleModal() {
    replacementForDayRef.current = null
    setIsCreatingSchedule(false)
    setEditingScheduleId(null)
    setEditingOccurrenceDate(null)
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
    const [nextSchedules, nextParticipants, nextScheduleExceptions] = await Promise.all([
      fetchSchedulesFromSupabase(),
      fetchScheduleParticipantsFromSupabase(),
      fetchScheduleExceptionsFromSupabase(),
    ])
    setSchedules(nextSchedules)
    setScheduleParticipants(nextParticipants)
    setScheduleExceptions(nextScheduleExceptions)
  }

  async function refreshTeachers() {
    const nextTeachers = await fetchTeachersFromSupabase()
    setTeachers(nextTeachers)
  }

  // Two leads that turned out to be one family become one; the one with a phone number stays.
  async function handleMergeLeads(keepId: number, removeId: number) {
    try {
      const leadId = await mergeLeads(keepId, removeId)
      await Promise.all([refreshLeads(), leadChannels.refresh()])
      return { leadId, error: null }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : (failure as { message?: string } | null)?.message
      return { leadId: null, error: message && message.trim() ? message : 'Could not join the leads. Try again.' }
    }
  }

  async function refreshLeads() {
    const nextLeads = await fetchLeadsFromSupabase()
    setLeads(nextLeads)
  }

  // Called after every change; only reloads while the Activity Log is open
  // (it loads fresh when opened anyway).
  async function refreshAdminActivities() {
    if (visibleSection !== 'activity') {
      return
    }
    setAdminActivities(await fetchAdminActivityForDay(activityDay))
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

    // Always called after the real change is saved. A failed audit entry
    // must not surface as a failed save, or a retry would repeat the change
    // (a second lead, a second renewal...), so it only warns.
    const { error } = await supabase.rpc('record_admin_activity', {
      p_action_type: actionType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_entity_label: entityLabel,
      p_details: details,
    })

    if (error) {
      showToast('Saved, but the activity log entry could not be written.')
    }
  }

  // Title only: a teacher change goes through reassign_classroom_teacher,
  // which splits each weekly series at the effective date. Lessons with a
  // name of their own (e.g. "F1 SAINS MS JOEY") keep it.
  async function syncRegularScheduleTitles(classroomId: number, previousName: string, classroomName: string) {
    if (!supabase || previousName === classroomName) {
      return
    }

    const { error } = await supabase
      .from('schedules')
      .update({ title: classroomName })
      .eq('classroom_id', classroomId)
      .eq('event_type', 'regular')
      .eq('title', previousName)

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
    const isPreviewStudent = studentDetailsFormState.studentType === 'preview'
    if (!fullName) {
      setStudentDetailsSaveError('Please enter the student full name.')
      return
    }

    if (isPreviewStudent && !studentDetailsFormState.phone.trim()) {
      setStudentDetailsSaveError('Please enter the student phone number.')
      return
    }

    try {
      extrasChanges(studentExtrasForm, studentFields.extras.get(editingStudent.id), studentFields.setting)
    } catch (fieldsError) {
      setStudentDetailsSaveError(getErrorMessage(fieldsError, 'Please check the extra fields.'))
      return
    }

    try {
      setIsSavingStudentDetails(true)
      setStudentDetailsSaveError(null)

      const editClassroomId = studentDetailsFormState.classroomId
        ? Number(studentDetailsFormState.classroomId)
        : null
      const nextClassroomId = isPreviewStudent ? null : editClassroomId

      const { error } = await supabase.rpc('update_student_record', {
        p_student_id: editingStudent.id,
        p_full_name: fullName,
        p_phone: studentDetailsFormState.phone.trim() || null,
        p_teacher_id: nextClassroomId
          ? classroomMap.get(nextClassroomId)?.teacherId ?? null
          : null,
        p_classroom_id: nextClassroomId,
        p_notes: isPreviewStudent ? null : studentDetailsFormState.notes.trim() || null,
        p_student_type: studentDetailsFormState.studentType,
      })

      if (error) {
        throw error
      }

      if (!isPreviewStudent) {
        await saveBirthDate(editingStudent.id, studentDetailsFormState.dateOfBirth, editingStudent.dateOfBirth)
      }
      await saveStudentCodeFor(editingStudent.id, studentDetailsFormState.studentCode)
      await studentFields.saveFor(editingStudent.id, studentExtrasForm)

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
    const phone = createStudentFormState.phone.trim()
    const initialHours = Number.parseInt(createStudentFormState.initialHours, 10)
    const isPreviewStudent = createStudentFormState.studentType === 'preview'

    if (!fullName) {
      setCreateStudentSaveError('Please enter the student full name.')
      return
    }

    if (isPreviewStudent && !phone) {
      setCreateStudentSaveError('Please enter the student phone number.')
      return
    }

    if (!isPreviewStudent && !createStudentFormState.lessonExpiryDate) {
      setCreateStudentSaveError('Please select the lesson expiry date.')
      return
    }

    if (!isPreviewStudent && !createStudentFormState.accountFeeExpiryDate) {
      setCreateStudentSaveError('Please select the Account Fee expiry date.')
      return
    }

    if (!isPreviewStudent && !createStudentFormState.miraiClubExpiryDate) {
      setCreateStudentSaveError(`Please select the ${brand.clubName} expiry date.`)
      return
    }

    // A bad extra field is said before the student is made (it is saved right after).
    try {
      extrasChanges(studentExtrasForm, undefined, studentFields.setting)
    } catch (fieldsError) {
      setCreateStudentSaveError(getErrorMessage(fieldsError, 'Please check the extra fields.'))
      return
    }

    const signUpPackage =
      createStudentFormState.studentType === 'regular'
        ? findPackage(createStudentFormState.packageId)
        : null
    const startingClasses =
      !isPreviewStudent && Number.isFinite(initialHours) && initialHours > 0 ? initialHours : 0
    // A school that charges by the month, with no package picked: no class count, the far-off dates
    // the other students without a package have, and the months go on the class instead.
    const byMonth = !brand.usesPackages && createStudentFormState.studentType === 'regular' && !signUpPackage
    const signUpMonths = byMonth ? Number(createStudentFormState.months ?? '') : NaN
    if (byMonth && createStudentFormState.months?.trim()) {
      if (!Number.isInteger(signUpMonths) || signUpMonths < 1 || signUpMonths > 60) {
        setCreateStudentSaveError('Months must be a whole number from 1 to 60.')
        return
      }
      if (!createStudentFormState.classroomId) {
        setCreateStudentSaveError('Pick the class the months are for.')
        return
      }
      if (!createStudentFormState.startDate) {
        setCreateStudentSaveError('Pick the first day.')
        return
      }
    }

    try {
      setIsCreatingStudentRecord(true)
      setCreateStudentSaveError(null)

      // One call does it all atomically: create, assign the classroom, log
      // the activity, and convert the lead (when converting from Leads).
      // With a package the classes are added by the enrollment below instead.
      const { data: created, error } = await supabase.rpc('create_student_record', {
        p_full_name: fullName,
        p_phone: phone || null,
        p_teacher_id: null,
        p_classroom_id:
          !isPreviewStudent && createStudentFormState.classroomId
            ? Number(createStudentFormState.classroomId)
            : null,
        p_lead_id: convertingLeadId,
        p_initial_hours: signUpPackage ? 0 : startingClasses,
        p_lesson_expiry_date: isPreviewStudent
          ? todayString
          : byMonth
            ? NO_PACKAGE_END
            : createStudentFormState.lessonExpiryDate,
        p_account_fee_expiry_date: isPreviewStudent
          ? todayString
          : byMonth
            ? NO_PACKAGE_END
            : createStudentFormState.accountFeeExpiryDate,
        p_mirai_club_expiry_date: isPreviewStudent
          ? todayString
          : byMonth
            ? NO_PACKAGE_END
            : createStudentFormState.miraiClubExpiryDate,
        p_notes: isPreviewStudent ? null : createStudentFormState.notes.trim() || null,
        p_student_type: createStudentFormState.studentType,
      })

      if (error) {
        throw error
      }

      const createdStudentId = (created as { student_id: number }[] | null)?.[0]?.student_id
      if (!isPreviewStudent && createdStudentId && createStudentFormState.dateOfBirth) {
        await saveBirthDate(createdStudentId, createStudentFormState.dateOfBirth, null)
      }
      if (createdStudentId && createStudentFormState.studentCode?.trim()) {
        try {
          await saveStudentCodeFor(createdStudentId, createStudentFormState.studentCode)
        } catch (codeError) {
          // The student exists now, so closing (not retrying) avoids a duplicate.
          showToast(`Saved the student, but not the code: ${getErrorMessage(codeError, 'unknown error')}`)
        }
      }
      if (createdStudentId && anyStudentField(studentFields.setting)) {
        try {
          await studentFields.saveFor(createdStudentId, studentExtrasForm)
        } catch (fieldsError) {
          // The student exists now, so closing (not retrying) avoids a duplicate.
          showToast(`Saved the student, but not ${getErrorMessage(fieldsError, 'the extra fields')}`)
        }
      }
      if (createdStudentId && byMonth && Number.isInteger(signUpMonths) && createStudentFormState.classroomId) {
        const failure = await addMonthPlan({
          studentId: createdStudentId,
          classroomId: Number(createStudentFormState.classroomId),
          startDate: createStudentFormState.startDate,
          months: signUpMonths,
        })
        if (failure) {
          showToast(`Saved the student, but not the months: ${failure} Add them in the student's profile.`)
        }
      }
      if (signUpPackage && createdStudentId) {
        const { error: enrollError } = await supabase.rpc('enroll_student_package', {
          p_student_id: createdStudentId,
          p_package_id: signUpPackage.id,
          p_start_date: createStudentFormState.startDate,
          p_class_count: startingClasses,
          p_lesson_expiry_date: createStudentFormState.lessonExpiryDate,
          p_account_fee_expiry_date: createStudentFormState.accountFeeExpiryDate,
          p_mirai_club_expiry_date: createStudentFormState.miraiClubExpiryDate,
        })
        if (enrollError) {
          // The student exists now, so closing (not retrying) avoids a duplicate.
          showToast(
            `Saved the student, but not the package: ${getErrorMessage(enrollError, 'unknown error')}. Renew with the package to add it.`,
          )
        }
      }

      await Promise.all([
        refreshStudentsAndLogs(),
        refreshClassrooms(),
        refreshAdminActivities(),
        ...(convertingLeadId ? [refreshLeads()] : []),
      ])
      closeCreateStudentModal()
    } catch (error) {
      setCreateStudentSaveError(getErrorMessage(error, 'Failed to create student record.'))
    } finally {
      setIsCreatingStudentRecord(false)
    }
  }

  async function handleBulkImportPreviewStudents(rows: BulkPreviewStudentRow[]) {
    if (!supabase || rows.length === 0) {
      return
    }

    try {
      setIsImportingPreviewStudents(true)
      setBulkImportPreviewStudentError(null)

      const { error } = await supabase.rpc('create_preview_student_records', {
        p_students: rows,
      })

      if (error) {
        throw error
      }

      await recordAdminActivity(
        'preview_students_bulk_imported',
        'student',
        null,
        `${rows.length} preview students`,
        { count: rows.length },
      )

      await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
      closeBulkImportPreviewStudentsModal()
    } catch (error) {
      setBulkImportPreviewStudentError(
        error instanceof Error
          ? error.message
          : 'Failed to import preview students.',
      )
    } finally {
      setIsImportingPreviewStudents(false)
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

      let createdTeacherId: number | null = null
      if (!editingTeacher) {
        createdTeacherId = data?.[0]?.teacher_id ?? null
      }

      // A changed username: the login follows it, so the person signs in with the new name (same password).
      let loginNameError: string | null = null
      if (
        editingTeacher?.authUserId &&
        usernameToInternalEmail(username) !== usernameToInternalEmail(editingTeacher.username)
      ) {
        const synced = await syncTeacherLoginName(editingTeacher.id)
        if (!synced.ok) {
          loginNameError = `Saved, but the login still uses the old username "${editingTeacher.username}": ${synced.error}`
        }
      }

      // Admins can use everything, so their ticks are left as they are.
      const savedTeacherId = editingTeacher?.id ?? createdTeacherId
      let permissionsError: unknown = null
      if (savedTeacherId && createTeacherFormState.role !== 'admin') {
        ;({ error: permissionsError } = await supabase.rpc('set_account_permissions', {
          p_teacher_id: savedTeacherId,
          p_permissions: createTeacherFormState.permissions,
        }))
      }

      if (!editingTeacher) {
        await recordAdminActivity(
          'teacher_created',
          'teacher',
          createdTeacherId,
          fullName,
          { role: createTeacherFormState.role },
        )
      }

      await Promise.all([refreshTeachers(), refreshAdminActivities()])

      if (createdTeacherId) {
        // Keep the modal open, now in "edit" mode for the row just
        // created, so the admin can set up its login in one continuous flow.
        setEditingTeacherId(createdTeacherId)
      }
      if (permissionsError) {
        // The account itself saved; only the ticks need another try.
        throw permissionsError
      }
      if (loginNameError) {
        setCreateTeacherSaveError(loginNameError)
        return
      }
      if (!createdTeacherId) {
        closeCreateTeacherModal()
      }
    } catch (error) {
      setCreateTeacherSaveError(getErrorMessage(error, 'Failed to save teacher record.'))
    } finally {
      setIsCreatingTeacherRecord(false)
    }
  }

  async function handleLeadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const fullName = leadFormState.fullName.trim()
    const children = leadFormState.children
      .filter((child) => child.age !== '')
      .map((child) => ({
        name: child.name.trim(),
        age: Number(child.age),
        phone: child.phone.trim() || null,
      }))
    const activityLabel =
      fullName || children[0]?.name || leadFormState.phone.trim() || 'Unnamed Lead'

    try {
      setIsSavingLead(true)
      setLeadSaveError(null)

      const payload = {
        full_name: fullName || null,
        phone: leadFormState.phone.trim() || null,
        source_id: leadFormState.sourceId ? Number(leadFormState.sourceId) : null,
        pic_id: leadFormState.picId ? Number(leadFormState.picId) : null,
        state: leadFormState.state || null,
        // Only sent when there is something to save or to clear, so a database without the columns still saves leads.
        ...(leadFormState.nameZh?.trim() || editingLead?.nameZh ? { name_zh: leadFormState.nameZh?.trim() || null } : {}),
        ...(leadFormState.secondParentPhone?.trim() || editingLead?.secondParentPhone
          ? { second_parent_phone: leadFormState.secondParentPhone?.trim() || null }
          : {}),
        tag_ids: leadFormState.tagIds,
        status: leadFormState.status,
        children,
        notes: leadFormState.notes.trim() || null,
        added_date: leadFormState.addedDate || todayString,
      }

      if (editingLead) {
        const { error } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', editingLead.id)

        if (error) {
          throw error
        }

        await recordAdminActivity('lead_updated', 'lead', editingLead.id, activityLabel, {
          status: leadFormState.status,
        })
      } else {
        // One lead per number: look at the server (the list on this page may be behind) before a second
        // lead is made for a family that already has one.
        const same = findLeadsByPhone(payload.phone, await fetchLeadsFromSupabase())[0]
        if (same) {
          const who = same.fullName?.trim() || same.children[0]?.name?.trim() || 'another lead'
          throw new Error(
            `This number already belongs to the lead "${who}". Open that lead instead of adding a second one.`,
          )
        }
        const { data, error } = await supabase
          .from('leads')
          .insert(payload)
          .select('id')
          .single()

        if (error) {
          throw error
        }

        await recordAdminActivity('lead_created', 'lead', data?.id ?? null, activityLabel, {
          source_id: leadFormState.sourceId ? Number(leadFormState.sourceId) : null,
        })
      }

      await Promise.all([refreshLeads(), refreshAdminActivities()])
      closeLeadModal()
    } catch (error) {
      setLeadSaveError(
        error instanceof Error ? error.message : 'Failed to save lead record.',
      )
    } finally {
      setIsSavingLead(false)
    }
  }

  async function handleChangeLeadStatus(leadId: number, status: LeadStatus) {
    if (!supabase) {
      return
    }

    const lead = leads.find((entry) => entry.id === leadId)
    if (!lead) {
      return
    }

    const previousLeads = leads
    setLeads((current) =>
      current.map((entry) => (entry.id === leadId ? { ...entry, status } : entry)),
    )

    const { error } = await supabase.from('leads').update({ status }).eq('id', leadId)

    if (error) {
      setLeads(previousLeads)
      showToast('Failed to update lead stage.')
      return
    }

    await recordAdminActivity(
      'lead_stage_changed',
      'lead',
      leadId,
      lead.fullName || lead.children[0]?.name || lead.phone || 'Unnamed Lead',
      { status },
    )
    await refreshAdminActivities()
  }

  // Ticks or unticks one of the three boxes. It shows at once and is put back
  // if the database says no.
  async function handleToggleLeadCheck(leadId: number, slot: LeadCheckSlot, checked: boolean) {
    if (!supabase) {
      return
    }

    const previousLeads = leads
    setLeads((current) =>
      current.map((entry) => {
        if (entry.id !== leadId) {
          return entry
        }
        const checks = { ...entry.checks }
        if (checked) {
          checks[slot] = { at: new Date().toISOString(), by: currentTeacher?.id ?? null }
        } else {
          delete checks[slot]
        }
        return { ...entry, checks }
      }),
    )

    const { data, error } = await supabase.rpc('set_lead_check', {
      p_lead_id: leadId,
      p_slot: slot,
      p_checked: checked,
    })

    if (error || data === false) {
      setLeads(previousLeads)
      showToast(
        error ? getErrorMessage(error, 'Failed to update the tick.') : 'This lead could not be changed.',
      )
      return
    }

    // The database stamps the time and the person; load them back.
    await refreshLeads()
  }

  // Does one action to the ticked leads of the list, after asking. Only the
  // leads it would really change are touched; the rest are left alone and
  // mentioned. Returns true when it went through.
  async function handleBulkLeadAction(action: LeadBulkAction, leadIds: number[]) {
    if (!supabase) {
      return false
    }

    const chosen = leads.filter((entry) => leadIds.includes(entry.id))
    const nameOf = (id: number | null) => leadOptions.find((option) => option.id === id)?.label ?? ''
    const plural = (count: number) => `${count} lead${count === 1 ? '' : 's'}`

    let affected = chosen
    let question = ''
    let note = ''
    let activityValue = ''
    let confirmLabel = 'Confirm'

    switch (action.type) {
      case 'stage': {
        const open = chosen.filter((entry) => entry.status !== 'converted')
        affected = open.filter((entry) => entry.status !== action.status)
        const stage = leadStatusOptions.find((option) => option.key === action.status)?.label ?? ''
        activityValue = action.status
        question = `Move ${plural(affected.length)} to ${stage}?`
        note =
          chosen.length - open.length > 0
            ? `Left as they are: ${chosen.length - open.length} already converted.`
            : ''
        break
      }
      case 'pic':
        affected = chosen.filter((entry) => entry.picId !== action.picId)
        activityValue = nameOf(action.picId)
        question =
          action.picId === null
            ? `Clear the PIC of ${plural(affected.length)}?`
            : `Assign ${plural(affected.length)} to ${activityValue}?`
        break
      case 'source':
        affected = chosen.filter((entry) => entry.sourceId !== action.sourceId)
        activityValue = nameOf(action.sourceId)
        question = `Set the source of ${plural(affected.length)} to ${activityValue}?`
        break
      case 'tag-add':
        affected = chosen.filter((entry) => !entry.tagIds.includes(action.tagId))
        activityValue = nameOf(action.tagId)
        question = `Add the tag ${activityValue} to ${plural(affected.length)}?`
        break
      case 'tag-remove':
        affected = chosen.filter((entry) => entry.tagIds.includes(action.tagId))
        activityValue = nameOf(action.tagId)
        question = `Remove the tag ${activityValue} from ${plural(affected.length)}?`
        break
      case 'delete':
        question = `Delete ${plural(chosen.length)}?\nThis permanently removes the leads, their follow-up logs and their tasks. This cannot be undone.`
        confirmLabel = `Delete ${plural(chosen.length)}`
        break
    }

    if (affected.length === 0) {
      showToast('Nothing to change: the selected leads are already like that.')
      return false
    }
    if (affected.length < chosen.length && action.type !== 'stage' && action.type !== 'delete') {
      note = `Left as they are: ${chosen.length - affected.length} already like that.`
    }
    if (!(await confirm(note ? `${question}\n${note}` : question, { confirmLabel }))) {
      return false
    }

    const ids = affected.map((entry) => entry.id)
    // A long list is sent in pieces, so the request address stays short.
    const pieces = Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) =>
      ids.slice(index * 200, index * 200 + 200),
    )
    let changed = 0

    try {
      for (const piece of pieces) {
        if (action.type === 'tag-add' || action.type === 'tag-remove') {
          const { data, error } = await supabase.rpc('bulk_set_lead_tag', {
            p_lead_ids: piece,
            p_tag_id: action.tagId,
            p_add: action.type === 'tag-add',
          })
          if (error) {
            throw error
          }
          changed += data ?? 0
          continue
        }

        const query =
          action.type === 'delete'
            ? supabase.from('leads').delete().in('id', piece)
            : supabase
                .from('leads')
                .update(
                  action.type === 'stage'
                    ? { status: action.status }
                    : action.type === 'pic'
                      ? { pic_id: action.picId }
                      : { source_id: action.sourceId },
                )
                .in('id', piece)
        const { data, error } = await query.select('id')
        if (error) {
          throw error
        }
        changed += data?.length ?? 0
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'The change could not be finished.'))
      await refreshLeads()
      return false
    }

    await recordAdminActivity(
      action.type === 'delete' ? 'lead_bulk_deleted' : 'lead_bulk_updated',
      'lead',
      null,
      plural(changed),
      { bulk_action: action.type, value: activityValue, count: changed },
    )
    await Promise.all([refreshLeads(), refreshAdminActivities()])
    showToast(`${action.type === 'delete' ? 'Deleted' : 'Updated'} ${plural(changed)}.`)
    return true
  }

  function handleConvertLead(leadId: number) {
    const lead = leads.find((entry) => entry.id === leadId)
    if (!lead) {
      return
    }

    setConvertingLeadId(leadId)
    setCreateStudentSaveError(null)
    setIsCreateStudentOpen(true)
    setCreateStudentFormState({
      packageId: '',
      startDate: todayString,
      // The student is the child, not the parent: the lead's own name is the parent's (or a WhatsApp
      // username), so it is only a last resort.
      fullName: lead.children[0]?.name?.trim() || lead.fullName?.trim() || '',
      phone: lead.children[0]?.phone ?? lead.phone ?? '',
      classroomId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: lead.notes ?? '',
      studentType: 'regular',
      dateOfBirth: '',
    })
  }

  // Saves one more follow-up on a lead; throws when it could not be saved.
  async function saveLeadFollowUp(lead: Lead, note: string) {
    if (!supabase || lead.followUps.length >= MAX_LEAD_FOLLOW_UPS) {
      return
    }

    const nextFollowUps = [...lead.followUps, { date: todayString, note }]

    const { error } = await supabase
      .from('leads')
      .update({ follow_ups: nextFollowUps })
      .eq('id', lead.id)

    if (error) {
      throw error
    }

    await recordAdminActivity(
      'lead_follow_up_logged',
      'lead',
      lead.id,
      lead.fullName || lead.children[0]?.name || 'Unnamed Lead',
      { follow_up_number: nextFollowUps.length },
    )

    await Promise.all([refreshLeads(), refreshAdminActivities()])
  }

  async function handleAddFollowUp(note: string) {
    if (!supabase || !followUpLead) {
      return
    }

    if (followUpLead.followUps.length >= MAX_LEAD_FOLLOW_UPS) {
      return
    }

    try {
      setIsSavingFollowUp(true)
      setFollowUpSaveError(null)
      await saveLeadFollowUp(followUpLead, note)
    } catch (error) {
      setFollowUpSaveError(
        error instanceof Error ? error.message : 'Failed to log follow-up.',
      )
    } finally {
      setIsSavingFollowUp(false)
    }
  }

  // The few lead and student changes the WhatsApp side panel can make.
  async function createLeadFromChat(input: LeadFormValues) {
    if (!supabase) {
      return { leadId: null, error: 'Not connected to the database.' }
    }
    // The list this page holds may be behind: a form or another computer can make a lead for this
    // number a moment before the first WhatsApp message arrives. Look at the server before making a second.
    try {
      const fresh = await fetchLeadsFromSupabase()
      setLeads(fresh)
      const existing = findLeadsByPhone(input.phone, fresh)[0]
      if (existing) {
        return { leadId: null, error: sameNumberMessage(existing), existingLeadId: existing.id }
      }
    } catch {
      // Could not look; the save below is still the same as before.
    }
    const fullName = input.fullName.trim()
    const children = input.children.map((child) => ({ ...child, name: child.name.trim() }))

    const { data, error } = await supabase
      .from('leads')
      .insert({
        full_name: fullName || null,
        phone: input.phone.trim() || null,
        state: input.state || null,
        ...(input.nameZh?.trim() ? { name_zh: input.nameZh.trim() } : {}),
        ...(input.secondParentPhone?.trim() ? { second_parent_phone: input.secondParentPhone.trim() } : {}),
        source_id: input.sourceId,
        pic_id: input.picId,
        tag_ids: input.tagIds,
        status: input.status,
        children,
        notes: input.notes.trim() || null,
        added_date: todayString,
        source_rule_id: input.sourceRuleId ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      return { leadId: null, error: getErrorMessage(error, 'Failed to save lead record.') }
    }

    await recordAdminActivity(
      'lead_created',
      'lead',
      data.id,
      fullName || children[0]?.name || input.phone.trim() || 'Unnamed Lead',
      { source_id: input.sourceId },
    )
    await Promise.all([refreshLeads(), refreshAdminActivities()])
    return { leadId: data.id as number, error: null }
  }

  // Saves the changes made on a lead in the WhatsApp side panel.
  async function updateLeadFromChat(leadId: number, input: LeadFormValues) {
    const lead = leads.find((entry) => entry.id === leadId)
    if (!supabase || !lead) {
      return 'That lead is no longer in the list.'
    }
    const fullName = input.fullName.trim()
    const children = input.children.map((child) => ({ ...child, name: child.name.trim() }))

    const { error } = await supabase
      .from('leads')
      .update({
        full_name: fullName || null,
        phone: input.phone.trim() || null,
        state: input.state || null,
        ...(input.nameZh !== undefined && (input.nameZh.trim() || lead.nameZh) ? { name_zh: input.nameZh.trim() || null } : {}),
        ...(input.secondParentPhone !== undefined && (input.secondParentPhone.trim() || lead.secondParentPhone)
          ? { second_parent_phone: input.secondParentPhone.trim() || null }
          : {}),
        source_id: input.sourceId,
        pic_id: input.picId,
        tag_ids: input.tagIds,
        status: input.status,
        children,
        notes: input.notes.trim() || null,
      })
      .eq('id', leadId)

    if (error) {
      return getErrorMessage(error, 'Failed to save lead record.')
    }

    const label = fullName || children[0]?.name || input.phone.trim() || 'Unnamed Lead'
    await recordAdminActivity(
      input.status !== lead.status ? 'lead_stage_changed' : 'lead_updated',
      'lead',
      leadId,
      label,
      { status: input.status },
    )
    await Promise.all([refreshLeads(), refreshAdminActivities()])
    return null
  }

  // A student who had no number gets the parent's, so this chat (and the Students page's
  // WhatsApp button) find each other by phone from now on.
  async function setStudentPhoneFromChat(studentId: number, phone: string) {
    const student = students.find((entry) => entry.id === studentId)
    if (!supabase || !student) {
      return 'That student is no longer in the list.'
    }
    const { error } = await supabase.rpc('update_student_record', {
      p_student_id: student.id,
      p_full_name: student.name,
      p_phone: phone,
      p_teacher_id: student.classroomId ? (classroomMap.get(student.classroomId)?.teacherId ?? null) : null,
      p_classroom_id: student.classroomId,
      p_notes: student.notes,
      p_student_type: student.studentType,
    })
    if (error) {
      return getErrorMessage(error, "Couldn't save the phone number.")
    }
    await refreshStudentsAndLogs()
    return null
  }

  // The same booking the calendar makes, for a parent who is talking to us on WhatsApp.
  async function bookHoaFromChat(
    leadId: number,
    slot: HoaSlot,
    child: { name: string; age: number | null; phone: string },
  ) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }
    const { error } = await supabase.rpc('book_trial_slot', {
      p_schedule_id: slot.scheduleId,
      p_booking_date: slot.date,
      p_child_name: child.name.trim(),
      p_child_age: child.age,
      p_phone: child.phone.trim() || null,
      p_lead_id: leadId,
      p_notes: null,
    })
    if (error) {
      return getErrorMessage(error, 'Failed to book this class.')
    }
    await Promise.all([refreshTrialBookings(), refreshLeads(), refreshAdminActivities(), refreshStudentsAndLogs()])
    return null
  }

  // A child joins the Holiday Camp from the WhatsApp page: the student is made from the lead, put in the camp
  // class, and put on the camp package (12 classes, 3 months, no fees), as the Add Student window does.
  async function enrolCampFromChat(input: {
    leadId: number
    childName: string
    phone: string
    classroomId: number
    packageId: number
    startDate: string
  }) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }
    const pkg = findPackage(String(input.packageId))
    const classroom = classroomMap.get(input.classroomId)
    if (!pkg || pkg.kind !== 'camp') {
      return 'The Holiday Camp package is not available.'
    }
    if (!classroom || classroom.category !== 'camp') {
      return 'Pick a Holiday Camp class.'
    }
    const name = input.childName.trim()
    if (!name) {
      return "Add the child's name on the lead first."
    }
    const plan = planEnrollment(pkg, input.startDate)
    // The child already has an HOA student: that student joins, no second one is made.
    const hoaStudent = findHoaStudentForChild({
      leadId: input.leadId,
      childName: name,
      childCount: leads.find((lead) => lead.id === input.leadId)?.children.length ?? 1,
      students,
      trialBookings,
    })
    if (hoaStudent) {
      return convertHoa({
        studentId: hoaStudent.id,
        classroomId: input.classroomId,
        startDate: input.startDate,
        packageId: pkg.id,
        classCount: plan.classCount,
        lessonExpiryDate: plan.endDate,
        accountFeeExpiryDate: input.startDate,
        miraiClubExpiryDate: input.startDate,
        leadId: input.leadId,
      })
    }
    const { data: created, error } = await supabase.rpc('create_student_record', {
      p_full_name: name,
      p_phone: input.phone.trim() || null,
      p_teacher_id: null,
      p_classroom_id: input.classroomId,
      p_lead_id: input.leadId,
      p_initial_hours: 0,
      p_lesson_expiry_date: plan.endDate,
      p_account_fee_expiry_date: input.startDate,
      p_mirai_club_expiry_date: input.startDate,
      p_notes: null,
      p_student_type: 'regular',
    })
    if (error) {
      return getErrorMessage(error, 'Failed to make the student.')
    }
    const studentId = (created as { student_id: number }[] | null)?.[0]?.student_id
    let problem: string | null = null
    if (studentId) {
      const { error: enrollError } = await supabase.rpc('enroll_student_package', {
        p_student_id: studentId,
        p_package_id: pkg.id,
        p_start_date: input.startDate,
        p_class_count: plan.classCount,
        p_lesson_expiry_date: plan.endDate,
        p_account_fee_expiry_date: input.startDate,
        p_mirai_club_expiry_date: input.startDate,
      })
      if (enrollError) {
        problem = `The student was made, but the camp package was not added: ${getErrorMessage(enrollError, 'unknown error')}. Add it from the student's page.`
      }
    }
    await Promise.all([refreshStudentsAndLogs(), refreshClassrooms(), refreshLeads(), refreshAdminActivities()])
    return problem
  }

  // A child joins a class of a programme the school made: the student is made from the lead, put in the class,
  // and put on the package chosen with it. Fees follow the package, as the Add Student window does.
  async function enrolStudentFromChat(input: {
    leadId: number
    childName: string
    phone: string
    classroomId: number
    // Null for a school with no packages: the child just becomes a student of the class.
    packageId: number | null
    startDate: string
  }) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }
    const pkg = input.packageId === null ? null : findPackage(String(input.packageId))
    const classroom = classroomMap.get(input.classroomId)
    if (input.packageId !== null && (!pkg || !pkg.isActive)) {
      return 'That package is not available.'
    }
    if (!classroom || classroom.status !== 'active') {
      return 'Pick a class that is still running.'
    }
    const name = input.childName.trim()
    if (!name) {
      return "Add the child's name on the lead first."
    }
    if (!input.startDate) {
      return 'Pick the date the package starts.'
    }
    // No package: the dates stay far off, as for the students brought over from the recordings site.
    const plan = pkg ? planEnrollment(pkg, input.startDate) : { endDate: NO_PACKAGE_END, classCount: 0 }
    const fees = pkg ? planFeeChange(pkg, input.startDate, plan.endDate, null, []) : null
    const feeExpiry = pkg ? (fees?.to ?? input.startDate) : NO_PACKAGE_END
    // The child already has an HOA student: that student joins, no second one is made.
    const hoaStudent = findHoaStudentForChild({
      leadId: input.leadId,
      childName: name,
      childCount: leads.find((lead) => lead.id === input.leadId)?.children.length ?? 1,
      students,
      trialBookings,
    })
    if (hoaStudent) {
      return convertHoa({
        studentId: hoaStudent.id,
        classroomId: input.classroomId,
        startDate: input.startDate,
        packageId: pkg?.id ?? null,
        classCount: plan.classCount,
        lessonExpiryDate: pkg ? plan.endDate : null,
        accountFeeExpiryDate: pkg ? feeExpiry : null,
        miraiClubExpiryDate: pkg ? feeExpiry : null,
        leadId: input.leadId,
      })
    }
    const { data: created, error } = await supabase.rpc('create_student_record', {
      p_full_name: name,
      p_phone: input.phone.trim() || null,
      p_teacher_id: null,
      p_classroom_id: input.classroomId,
      p_lead_id: input.leadId,
      p_initial_hours: 0,
      p_lesson_expiry_date: plan.endDate,
      p_account_fee_expiry_date: feeExpiry,
      p_mirai_club_expiry_date: feeExpiry,
      p_notes: null,
      p_student_type: 'regular',
    })
    if (error) {
      return getErrorMessage(error, 'Failed to make the student.')
    }
    const studentId = (created as { student_id: number }[] | null)?.[0]?.student_id
    let problem: string | null = null
    if (studentId && pkg) {
      const { error: enrollError } = await supabase.rpc('enroll_student_package', {
        p_student_id: studentId,
        p_package_id: pkg.id,
        p_start_date: input.startDate,
        p_class_count: plan.classCount,
        p_lesson_expiry_date: plan.endDate,
        p_account_fee_expiry_date: feeExpiry,
        p_mirai_club_expiry_date: feeExpiry,
      })
      if (enrollError) {
        problem = `The student was made, but the package was not added: ${getErrorMessage(enrollError, 'unknown error')}. Add it from the student's page.`
      }
    }
    await Promise.all([refreshStudentsAndLogs(), refreshClassrooms(), refreshLeads(), refreshAdminActivities()])
    return problem
  }

  async function cancelHoaFromChat(booking: TrialBooking) {
    if (!supabase) {
      return 'Supabase is not configured.'
    }
    if (!(await confirm(`Remove ${booking.childName} from this HOA class?`))) {
      return null
    }
    const { error } = await supabase.rpc('cancel_trial_booking', { p_booking_id: booking.id })
    if (error) {
      return getErrorMessage(error, 'Failed to remove this booking.')
    }
    await Promise.all([refreshTrialBookings(), refreshAdminActivities(), refreshStudentsAndLogs()])
    return null
  }

  // Each class with the enrolment flow its sign-ups follow: its own, else its level's.
  const levelFlows = new Map(programLevels.map((level) => [level.name, level.flowId ?? null]))
  const flowClassrooms = classrooms.map((classroom) =>
    classroom.programmeId ? classroom : { ...classroom, programmeId: levelFlows.get(classroom.programLevel) ?? null },
  )
  const flowClassroomMap = new Map(flowClassrooms.map((classroom) => [classroom.id, classroom]))

  const whatsAppCrm: WhatsAppCrm = {
    leads,
    students,
    classrooms: flowClassrooms,
    subjects,
    packages,
    trialBookings,
    listHoaSlots: () => {
      const now = new Date()
      return upcomingHoaSlots({
        schedules: schedules,
        classroomMap,
        teachers,
        exceptions: scheduleExceptions,
        bookings: trialBookings,
        today: todayString,
        nowTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      })
    },
    programmes: programmes.programmes,
    listProgrammeSlots: (programmeId: number, classroomId?: number) => {
      const now = new Date()
      return upcomingHoaSlots({
        schedules: classroomId === undefined ? schedules : schedules.filter((schedule) => schedule.classroomId === classroomId),
        classroomMap: flowClassroomMap,
        teachers,
        exceptions: scheduleExceptions,
        bookings: trialBookings,
        today: todayString,
        nowTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        programmeId,
      })
    },
    bookingProgrammeId: (booking: TrialBooking) => {
      const schedule = schedules.find((entry) => entry.id === booking.scheduleId)
      return flowClassroomMap.get(schedule?.classroomId ?? -1)?.programmeId ?? null
    },
    classesOfStudent: (student: Student) =>
      classesOfStudent({ student, classrooms, schedules, teachers, trialBookings, today: todayString }),
    describeHoaBooking: (booking: TrialBooking) => {
      const schedule = schedules.find((entry) => entry.id === booking.scheduleId)
      return schedule
        ? describeHoaSlot({
            date: booking.bookingDate,
            startTime: schedule.startTime.slice(0, 5),
            endTime: schedule.endTime.slice(0, 5),
          })
        : booking.bookingDate
    },
    onBookHoa: bookHoaFromChat,
    onCancelHoa: cancelHoaFromChat,
    onEnrolCamp: enrolCampFromChat,
    onEnrolStudent: enrolStudentFromChat,
    followUps: {
      items: calendarItems.items,
      meId: currentSession?.teacherId ?? null,
      save: (draft) => calendarItems.save(null, draft),
      done: (id) => calendarItems.setDone(id, true),
      remove: (id) => calendarItems.remove(id),
    },
    leadOptions,
    canEditLeads: can('leads', 'edit'),
    canEditStudents: can('students', 'edit'),
    quotations: { enabled: quotationsOn, canUse: can('quotations', 'edit'), canApprove: can('quotations', 'delete') },
    canBookMakeup: canEditCalendar,
    onCreateLead: createLeadFromChat,
    onUpdateLead: updateLeadFromChat,
    trialDateFor: (leadId: number) => {
      const dates = trialBookings
        .filter((booking) => booking.leadId === leadId)
        .map((booking) => booking.bookingDate)
        .sort()
      const next = dates.find((date) => date >= todayString) ?? dates[dates.length - 1]
      return next ? formatDate(next) : null
    },
    onAddOption: handleAddLeadOption,
    onSetPersonTags: async (personId, tagIds) => {
      const problem = await setPersonTags(personId, tagIds)
      if (problem) {
        showToast(problem)
      } else {
        void studentTags.refresh()
      }
      return problem
    },
    onSetStudentPhone: setStudentPhoneFromChat,
    studentCodes: studentCodeEnabled ? studentCodes : undefined,
    leadCodeOf,
    onOpenLead: openEditLeadModal,
    zoomSlots: upcomingZoomSlots(calendarItems.items, new Date()),
    leadChannels: leadChannels.rows,
    // A chat that became a lead here: read the leads and the chats again.
    refreshLeadChannels: () => {
      void leadChannels.refresh()
      void refreshLeads().catch(() => undefined)
    },
    onMergeLeads: handleMergeLeads,
    leadIdsWithForms,
    onOpenFormAnswers: openLeadFormAnswers,
    loadFormAnswers: fetchLeadFormSubmissions,
    onOpenStudent: openStudentDetail,
    onOpenMakeup: (studentId) => {
      const student = students.find((entry) => entry.id === studentId)
      if (student) {
        void openStudentMakeup(student)
      }
    },
  }

  async function handleAddTask(title: string, dueDate: string) {
    if (!supabase || !followUpLead) {
      return
    }

    try {
      setIsSavingTask(true)
      setTaskSaveError(null)

      const nextTasks = [
        ...followUpLead.tasks,
        { id: crypto.randomUUID(), title, dueDate, completed: false },
      ]

      const { error } = await supabase
        .from('leads')
        .update({ tasks: nextTasks })
        .eq('id', followUpLead.id)

      if (error) {
        throw error
      }

      await refreshLeads()
    } catch (error) {
      setTaskSaveError(error instanceof Error ? error.message : 'Failed to add task.')
    } finally {
      setIsSavingTask(false)
    }
  }

  async function handleToggleTask(taskId: string) {
    if (!supabase || !followUpLead) {
      return
    }

    try {
      setTaskSaveError(null)

      const nextTasks = followUpLead.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      )

      const { error } = await supabase
        .from('leads')
        .update({ tasks: nextTasks })
        .eq('id', followUpLead.id)

      if (error) {
        throw error
      }

      await refreshLeads()
    } catch (error) {
      setTaskSaveError(error instanceof Error ? error.message : 'Failed to update task.')
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!supabase || !followUpLead) {
      return
    }

    try {
      setTaskSaveError(null)

      const nextTasks = followUpLead.tasks.filter((task) => task.id !== taskId)

      const { error } = await supabase
        .from('leads')
        .update({ tasks: nextTasks })
        .eq('id', followUpLead.id)

      if (error) {
        throw error
      }

      await refreshLeads()
    } catch (error) {
      setTaskSaveError(error instanceof Error ? error.message : 'Failed to delete task.')
    }
  }

  async function handleDeleteLead(leadId: number) {
    if (!supabase) {
      return
    }

    const lead = leads.find((entry) => entry.id === leadId)
    if (!lead) {
      return
    }

    const label = lead.fullName || lead.children[0]?.name || 'this lead'

    if (
      !(await confirm(
        `Delete ${label}? This permanently removes the lead, its follow-up log, and its tasks. This cannot be undone.`,
      ))
    ) {
      return
    }

    try {
      setDeletingLeadId(leadId)

      const { error } = await supabase.from('leads').delete().eq('id', leadId)

      if (error) {
        throw error
      }

      await recordAdminActivity('lead_deleted', 'lead', leadId, label)
      await Promise.all([refreshLeads(), refreshAdminActivities()])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete lead.')
    } finally {
      setDeletingLeadId(null)
    }
  }

  function handleDeleteTeacher(teacherId: number) {
    const teacher = teachers.find((entry) => entry.id === teacherId)
    if (!teacher) {
      return
    }

    if (protectedTeacherIds.has(teacherId) || teacher.username === 'admin_demo') {
      showToast('This teacher account is protected and cannot be deleted.')
      return
    }

    setDeleteTeacherTargetId(teacherId)
  }

  async function confirmDeleteTeacher(successorTeacherId: number | null) {
    if (!supabase || deleteTeacherTargetId === null) {
      return
    }

    const teacherId = deleteTeacherTargetId

    try {
      setDeletingTeacherId(teacherId)

      // Server-side and atomic: hands classrooms and upcoming classes to the
      // successor (if any), ends the rest of the teacher's schedules while
      // keeping their history, then deletes the teacher (or deactivates it
      // when history still references it) and writes the activity log.
      const { error } = await supabase.rpc('delete_teacher_account', {
        p_teacher_id: teacherId,
        p_successor_teacher_id: successorTeacherId,
      })

      if (error) {
        throw error
      }

      setDeleteTeacherTargetId(null)

      await Promise.all([
        refreshTeachers(),
        refreshClassrooms(),
        refreshSchedulesAndParticipants(),
        refreshStudentsAndLogs(),
        refreshTrialBookings(),
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

    const zoomLink = classroomFormState.zoomLink.trim()
    if (zoomLink && !/^https?:\/\/\S+$/i.test(zoomLink)) {
      setClassroomSaveError('The Zoom link must start with https://')
      return
    }

    const payload: Database['public']['Tables']['classrooms']['Update'] = {
      name,
      category: classroomFormState.category,
      age_group: classroomFormState.ageGroup,
      program_level: classroomFormState.programLevel,
      teacher_id: teacherId,
      notes: classroomFormState.notes.trim() || null,
      status: 'active',
    }
    // The school's category for the class; the classroom form only fills it once the database has them.
    if (classroomFormState.categoryName) {
      payload.category_name = classroomFormState.categoryName
    }
    // Only sent once the database has the column (or a link is being added, which then reports it).
    if (zoomLink || editingClassroom?.zoomLink !== undefined) {
      payload.zoom_link = zoomLink || null
    }
    // Likewise the programme: sent once the database has the column, or when one is being chosen.
    if (classroomFormState.programmeId || editingClassroom?.programmeId !== undefined) {
      payload.programme_id = classroomFormState.programmeId ? Number(classroomFormState.programmeId) : null
    }
    // And the subject.
    if (classroomFormState.subjectId || editingClassroom?.subjectId !== undefined) {
      payload.subject_id = classroomFormState.subjectId ? Number(classroomFormState.subjectId) : null
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
        // Teacher change first: the RPC is a no-op once the classroom already
        // has this teacher, so a retry after a later failure is safe.
        if (editingClassroom.teacherId !== teacherId) {
          if (!classroomFormState.teacherEffectiveDate) {
            throw new Error('Please pick the date the new teacher starts.')
          }

          // The new teacher takes over this class's weekly times from that
          // day: warn if they already teach something at any of them.
          const takeoverClashes = schedules
            .filter(
              (entry) =>
                entry.status === 'active' &&
                entry.eventType === 'regular' &&
                entry.classroomId === editingClassroom.id &&
                entry.dayOfWeek !== null &&
                entry.startRecur !== null &&
                (!entry.endRecur || entry.endRecur >= classroomFormState.teacherEffectiveDate),
            )
            .flatMap((entry) =>
              findTeacherClashes(
                {
                  kind: 'weekly',
                  teacherId,
                  dayOfWeek: entry.dayOfWeek!,
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                  startRecur:
                    entry.startRecur! > classroomFormState.teacherEffectiveDate
                      ? entry.startRecur!
                      : classroomFormState.teacherEffectiveDate,
                  endRecur: entry.endRecur,
                  excludeScheduleId: entry.id,
                },
                schedules,
                scheduleExceptions,
                classroomMap,
              ),
            )
          if (takeoverClashes.length > 0) {
            throw new Error(
              `${editingClassroom.name} cannot change teacher. ${clashMessage(teacherMap.get(teacherId)?.fullName ?? 'This teacher', takeoverClashes)}`,
            )
          }

          const { error: reassignError } = await supabase.rpc('reassign_classroom_teacher', {
            p_classroom_id: editingClassroom.id,
            p_new_teacher_id: teacherId,
            p_effective_date: classroomFormState.teacherEffectiveDate,
          })

          if (reassignError) {
            throw reassignError
          }
        }

        const { error } = await supabase
          .from('classrooms')
          .update(payload)
          .eq('id', editingClassroom.id)

        if (error) {
          throw error
        }

        await syncRegularScheduleTitles(editingClassroom.id, editingClassroom.name, name)
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
        refreshStudentsAndLogs(),
        refreshTrialBookings(),
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
    const renewalPackage = findPackage(studentFormState.packageId)
    let accountFeeExpiry =
      studentFormState.accountFeeExpiryDate || selectedStudent.accountFeeExpiryDate
    let miraiClubExpiry =
      studentFormState.miraiClubExpiryDate || selectedStudent.miraiClubExpiryDate

    // Offer the fee-year change, unless the admin already typed new fee dates.
    const feeChanges = getRenewalFeeChanges().filter(({ label }) =>
      label === 'Account Fee'
        ? accountFeeExpiry === selectedStudent.accountFeeExpiryDate
        : miraiClubExpiry === selectedStudent.miraiClubExpiryDate,
    )
    if (renewalPackage && feeChanges.length > 0) {
      const update = await confirm(
        `${renewalPackage.name} runs to ${formatDate(studentFormState.lessonExpiryDate)}.\n\n${describeFeeChanges(feeChanges)}\n\nUpdate the fees?`,
        { confirmLabel: 'Update fees', cancelLabel: 'Keep as they are' },
      )
      if (update) {
        for (const { label, change } of feeChanges) {
          if (label === 'Account Fee') {
            accountFeeExpiry = change.to
          } else {
            miraiClubExpiry = change.to
          }
        }
      }
    }

    try {
      setIsSavingStudent(true)
      setStudentSaveError(null)

      // Reactivate first: it is safe to repeat, whereas renewing adds
      // classes. If the renewal then fails, a retry won't add them twice.
      if (!selectedStudent.isActive) {
        const { error: reactivateError } = await supabase
          .from('students')
          .update({ is_active: true })
          .eq('id', selectedStudent.id)

        if (reactivateError) {
          throw reactivateError
        }
      }

      const lessonExpiry = studentFormState.lessonExpiryDate || selectedStudent.lessonExpiryDate
      const remark = studentFormState.remark.trim() || null
      // With a package the renewal is also recorded as an enrollment.
      const { error } = renewalPackage
        ? await supabase.rpc('enroll_student_package', {
            p_student_id: selectedStudent.id,
            p_package_id: renewalPackage.id,
            p_start_date: studentFormState.startDate,
            p_class_count: hoursToAdd,
            p_lesson_expiry_date: lessonExpiry,
            p_account_fee_expiry_date: accountFeeExpiry,
            p_mirai_club_expiry_date: miraiClubExpiry,
            p_remark: remark,
          })
        : await supabase.rpc('renew_student_record', {
            p_student_id: selectedStudent.id,
            p_add_hours: hoursToAdd,
            p_new_lesson_expiry_date: lessonExpiry,
            p_new_account_fee_expiry_date: accountFeeExpiry,
            p_new_mirai_club_expiry_date: miraiClubExpiry,
            p_remark: remark,
          })

      if (error) {
        throw error
      }

      await recordAdminActivity(
        'student_renewed',
        'student',
        selectedStudent.id,
        selectedStudent.name,
        {
          package: renewalPackage?.name ?? null,
          classes_added: hoursToAdd,
          lesson_expiry: lessonExpiry,
          account_fee_expiry: accountFeeExpiry,
          mirai_club_expiry: miraiClubExpiry,
        },
      )

      await Promise.all([refreshStudentsAndLogs(), refreshAdminActivities()])
      closeStudentRenewal()
    } catch (error) {
      setStudentSaveError(getErrorMessage(error, 'Failed to save renewal.'))
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

      // Another class teacher's lesson keeps its teacher and name.
      const owner = regularLessonOwner(linkedClassroom, isCreatingSchedule ? null : editingSchedule)
      teacherId = owner.teacherId ?? linkedClassroom.teacherId
      title = owner.title
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

    if (scheduleClashes.length > 0) {
      setScheduleSaveError(clashMessage(teacherMap.get(teacherId)?.fullName ?? 'This teacher', scheduleClashes))
      return
    }

    const fbGroupLink = normalizeLessonLink(scheduleFormState.fbGroupUrl)
    const zoomLessonLink = normalizeLessonLink(scheduleFormState.zoomLink)
    if (fbGroupLink.error || zoomLessonLink.error) {
      setScheduleSaveError(fbGroupLink.error ? `The FB group link ${fbGroupLink.error}.` : `The Zoom link ${zoomLessonLink.error}.`)
      return
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
      fb_group_url: fbGroupLink.link,
      zoom_link: zoomLessonLink.link,
      status: 'active',
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      if (isCreatingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .insert(payload as Database['public']['Tables']['schedules']['Insert'])
          .select(SCHEDULE_SELECT)
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
          await linkReplacementToCancelledDay(nextSchedule.id)
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
          .select(SCHEDULE_SELECT)
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

  async function handleCancelOccurrence(reason: string) {
    if (!editingSchedule || !editingOccurrenceDate || !supabase) {
      return
    }

    const occurrenceDate = editingOccurrenceDate

    if (
      !(await confirm(
        `Cancel only the class on ${occurrenceDate}? The rest of the weekly schedule stays as it is.`,
      ))
    ) {
      return
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      // The RPC records the admin-activity entry itself.
      const { error } = await supabase.rpc('cancel_schedule_occurrence', {
        p_schedule_id: editingSchedule.id,
        p_occurrence_date: occurrenceDate,
        p_reason: reason.trim() || null,
      })

      if (error) {
        throw error
      }

      await Promise.all([refreshSchedulesAndParticipants(), refreshAdminActivities()])
      closeScheduleModal()
      showToast(`Class on ${occurrenceDate} cancelled.`)
    } catch (error) {
      setScheduleSaveError(getErrorMessage(error, 'Failed to cancel this class day.'))
    } finally {
      setIsSavingSchedule(false)
    }
  }

  // Whether a dragged card may land on a day; null means yes. The same
  // rules the move RPCs enforce, so a bad drop never reaches the confirm step.
  function checkClassDrop(event: EventApi, dropStart: Date, droppedAllDay: boolean) {
    const scheduleId = Number(event.extendedProps.scheduleId)
    const classKind = event.extendedProps.classKind as 'regular' | 'trial' | 'camp' | 'replacement'
    const fromDate = event.start ? getDateKeyFromDate(event.start) : ''
    const toDate = getDateKeyFromDate(dropStart)

    return getDragBlockReason({
      classKind,
      fromDate,
      toDate,
      todayString,
      droppedAllDay,
      hasAttendance: latestLessonLogMap.has(`${scheduleId}:${fromDate}`),
      trialBookingCount:
        classKind === 'trial'
          ? (trialBookingMap.get(getTrialSlotKey(scheduleId, fromDate)) ?? []).length
          : 0,
    })
  }

  // A card was dropped on another day: show what will happen and wait for
  // Confirm. The calendar itself only changes once the server has saved it.
  function openMoveDraft(oldEvent: EventApi, newEvent: EventApi) {
    if (!oldEvent.start || !newEvent.start) {
      return
    }

    const scheduleId = Number(oldEvent.extendedProps.scheduleId)
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) {
      return
    }

    const classKind = oldEvent.extendedProps.classKind as 'regular' | 'trial' | 'camp' | 'replacement'
    const fromDate = getDateKeyFromDate(oldEvent.start)
    const toDate = getDateKeyFromDate(newEvent.start)
    const startTime = getTimeFromDate(newEvent.start)
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number)
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number)
    const durationMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)

    let names: string[] = []
    let trialSlotOptions: MoveClassDraft['trialSlotOptions'] = []

    if (classKind === 'trial') {
      names = (trialBookingMap.get(getTrialSlotKey(scheduleId, fromDate)) ?? []).map(
        (booking) => booking.childName,
      )
      // Slots of the same trial classroom already running that day: one tap
      // sets the time to join one. Any other time makes a one-off slot.
      trialSlotOptions = getTrialSlotsOnDate(schedules, classroomMap, scheduleExceptions, toDate)
        .filter(
          (slot) =>
            slot.classroomId === schedule.classroomId &&
            !(slot.id === scheduleId && toDate === fromDate),
        )
        .map((slot) => ({
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          teacherName: teacherMap.get(slot.teacherId)?.fullName ?? 'Unknown Teacher',
        }))
    } else if (classKind === 'replacement') {
      names = (scheduleParticipantMap.get(scheduleId) ?? [])
        .map((studentId) => studentMap.get(studentId)?.name)
        .filter((name): name is string => Boolean(name))
    } else {
      names = getClassroomRosterOn(students, schedule.classroomId ?? 0, fromDate)
        .filter((student) => student.isActive)
        .map((student) => student.name)
    }

    setMoveError(null)
    setMoveDraft({
      // A camp class moves exactly like a regular one.
      kind: classKind === 'camp' ? 'regular' : classKind,
      scheduleId,
      title: oldEvent.title,
      fromDate,
      fromStartTime: getTimeFromDate(oldEvent.start),
      toDate,
      startTime,
      endTime: addMinutesToTime(startTime, durationMinutes),
      names,
      trialSlotOptions,
    })
  }

  // The teacher's other classes at the new time of a move. A trial move
  // follows the target slot's teacher instead, so it isn't checked here.
  function getMoveClashes(startTime: string, endTime: string) {
    const schedule = moveDraft ? schedules.find((entry) => entry.id === moveDraft.scheduleId) : null
    if (!moveDraft || !schedule || moveDraft.kind === 'trial') {
      return []
    }

    return findTeacherClashes(
      {
        kind: 'single',
        teacherId: schedule.teacherId,
        date: moveDraft.toDate,
        startTime,
        endTime,
        excludeScheduleId: schedule.id,
      },
      schedules,
      scheduleExceptions,
      classroomMap,
    )
  }

  async function handleConfirmMove(input: MoveClassInput) {
    if (!moveDraft || !supabase) {
      return
    }

    const moveClashes = getMoveClashes(input.startTime, input.endTime)
    if (moveClashes.length > 0) {
      const moveTeacherId = schedules.find((entry) => entry.id === moveDraft.scheduleId)?.teacherId
      setMoveError(clashMessage(moveTeacherId ? (teacherMap.get(moveTeacherId)?.fullName ?? 'This teacher') : 'This teacher', moveClashes))
      return
    }

    try {
      setIsSavingMove(true)
      setMoveError(null)

      if (moveDraft.kind === 'trial') {
        const { error } = await supabase.rpc('reschedule_trial_bookings', {
          p_from_schedule_id: moveDraft.scheduleId,
          p_from_date: moveDraft.fromDate,
          p_to_date: moveDraft.toDate,
          p_start_time: input.startTime,
          p_end_time: input.endTime,
        })

        if (error) {
          throw error
        }

        // A one-off slot may have been created or removed, and the trial
        // students follow the new slot's teacher.
        await Promise.all([
          refreshSchedulesAndParticipants(),
          refreshTrialBookings(),
          refreshStudentsAndLogs(),
          refreshAdminActivities(),
        ])
      } else {
        const { error } = await supabase.rpc('move_class_occurrence', {
          p_schedule_id: moveDraft.scheduleId,
          p_from_date: moveDraft.fromDate,
          p_to_date: moveDraft.toDate,
          p_start_time: input.startTime,
          p_end_time: input.endTime,
          p_reason: input.reason,
        })

        if (error) {
          throw error
        }

        await Promise.all([refreshSchedulesAndParticipants(), refreshAdminActivities()])
      }

      showToast(`${moveDraft.title} moved to ${formatDate(moveDraft.toDate)}.`)
      setMoveDraft(null)
    } catch (error) {
      setMoveError(getErrorMessage(error, 'Failed to move this class.'))
    } finally {
      setIsSavingMove(false)
    }
  }

  async function handleRestoreOccurrence(scheduleId: number, occurrenceDate: string) {
    if (!supabase) {
      return
    }

    const movedTo = getMovedToSchedule(scheduleId, occurrenceDate)

    if (
      !(await confirm(
        movedTo?.scheduledDate
          ? `Undo the move? The class goes back to ${formatDate(occurrenceDate)} and the replacement on ${formatDate(movedTo.scheduledDate)} is removed.`
          : `Restore the class on ${occurrenceDate}? It will appear on the calendar again.`,
      ))
    ) {
      return
    }

    try {
      const { error } = await supabase.rpc('restore_schedule_occurrence', {
        p_schedule_id: scheduleId,
        p_occurrence_date: occurrenceDate,
      })

      if (error) {
        throw error
      }

      await Promise.all([refreshSchedulesAndParticipants(), refreshAdminActivities()])
      showToast(`Class on ${occurrenceDate} restored.`)
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to restore this class day.'))
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
        .select(SCHEDULE_SELECT)
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

  // A make-up slot on the 29th-31st, when the class doesn't normally meet:
  // the day exists only because a make-up session lands there. Returns that
  // day's make-up entries (empty when it's an ordinary class day).
  function getMakeupOnlyEntries(scheduleId: number, occurrenceDate: string) {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (
      !schedule ||
      schedule.eventType !== 'regular' ||
      schedule.classroomId === null ||
      classroomMap.get(schedule.classroomId)?.category === 'trial' ||
      parseLocalDate(occurrenceDate).getDate() < 29
    ) {
      return []
    }

    return makeupMap.get(makeupKey(schedule.classroomId, occurrenceDate)) ?? []
  }

  function getScheduleRosterStudentIds(scheduleId: number, occurrenceDate: string) {
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) {
      return []
    }

    if (schedule.eventType === 'regular') {
      const classroom = schedule.classroomId ? classroomMap.get(schedule.classroomId) : null

      // Mirrors submit_lesson_attendance: a whole-class make-up session
      // brings the whole class, otherwise only the students whose own
      // make-up plans land that day.
      const makeupEntries = getMakeupOnlyEntries(scheduleId, occurrenceDate)
      if (makeupEntries.length > 0 && !makeupEntries.some((entry) => entry.studentId === null)) {
        const planStudentIds = new Set(makeupEntries.map((entry) => entry.studentId))
        return getClassroomRosterOn(students, schedule.classroomId!, occurrenceDate)
          .filter((student) => planStudentIds.has(student.id))
          .map((student) => student.id)
      }

      // A trial classroom never has students assigned to it directly — the
      // roster for one occurrence is whoever is trial_booked for that exact
      // day, not the (always empty) classroom roster.
      if (classroom?.category === 'trial') {
        return (trialBookingMap.get(getTrialSlotKey(scheduleId, occurrenceDate)) ?? [])
          .map((booking) => booking.studentId)
          .filter((studentId): studentId is number => studentId !== null)
      }

      // Only the students in the class that day: a student who joined
      // later is not in its earlier lessons, one who left still is.
      return schedule.classroomId
        ? getClassroomRosterOn(students, schedule.classroomId, occurrenceDate).map(
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
    options: { autoFill?: boolean } = {},
  ) {
    // Mirrors submit_lesson_attendance: no attendance ahead of the class day,
    // but the class can still be opened to see who is in it.
    const isUpcoming = occurrenceDate > todayString
    // Mirrors can_take_attendance: admin, the class teacher, its assistants or the day's substitute.
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    const isViewOnly = !schedule || !canTakeAttendance(attendanceTakerContext, schedule, occurrenceDate)

    setAttendanceSaveError(null)
    setAttendanceModal({
      scheduleId,
      occurrenceDate,
      title,
      autoFill: options.autoFill,
    })
    setAttendanceRemark('')
    setAttendanceStatuses({})
    setAttendanceRosterIds([])
    setAttendanceReviews({})
    setAttendanceExistingLog(null)
    setAttendanceLocked(isUpcoming || isViewOnly)
    setAttendanceUpcoming(isUpcoming)
    setAttendanceViewOnly(isViewOnly)

    if (isUpcoming) {
      setAttendanceRosterIds(getScheduleRosterStudentIds(scheduleId, occurrenceDate))
      return
    }

    try {
      setIsLoadingAttendance(true)
      const { summary, students: latestAttendanceRows, reviews: latestReviewRows } =
        await fetchLatestLessonLogStudents(scheduleId, occurrenceDate)

      const rosterIds = summary
        ? latestAttendanceRows.map((row) => row.studentId)
        : getScheduleRosterStudentIds(scheduleId, occurrenceDate)
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

      if (summary && !isViewOnly) {
        const editableUntil =
          new Date(summary.submittedAt).getTime() + 24 * 60 * 60 * 1000
        setAttendanceLocked(!lateFeedbackEdit && Date.now() > editableUntil)
      }
    } catch (error) {
      setAttendanceSaveError(
        error instanceof Error ? error.message : 'Failed to load attendance log.',
      )
    } finally {
      setIsLoadingAttendance(false)
    }
  }

  // From a class report, the admin's way on: the trial slot's bookings, or
  // the timetable entry (cancel this day, change time, ...).
  function getAttendanceAdminAction(modal: { scheduleId: number; occurrenceDate: string }) {
    const schedule = schedules.find((entry) => entry.id === modal.scheduleId)
    const classroom = schedule?.classroomId ? classroomMap.get(schedule.classroomId) : null
    const isTrial = classroom?.category === 'trial'

    // On a make-up-only day there is no timetable entry to edit — the day
    // belongs to its make-up plan.
    const makeupPlanId = getMakeupOnlyEntries(modal.scheduleId, modal.occurrenceDate)[0]?.planId

    if (makeupPlanId !== undefined) {
      return {
        label: 'Edit Make-up Plan',
        onClick: () => {
          closeAttendanceModal()
          openMakeupPlan(makeupPlanId)
        },
      }
    }

    return {
      label: isTrial ? 'Manage Bookings' : 'Edit Schedule',
      onClick: () => {
        closeAttendanceModal()
        if (isTrial) {
          openTrialBooking(modal.scheduleId, modal.occurrenceDate)
        } else {
          openEditSchedule(modal.scheduleId, modal.occurrenceDate)
        }
      },
    }
  }

  // What the live class console shows about each child (lessons left, the last remark).
  const liveBackgrounds = useMemo(
    () =>
      liveLesson
        ? studentBackgrounds({
            students: Array.from(studentMap.values()).map((student) => ({
              id: student.id,
              remainingHours: student.remainingHours,
              lessonExpiryDate: student.lessonExpiryDate,
              hasPackage: student.packageId != null,
            })),
            logs: lessonLogs,
            reviews: lessonReviews,
            today: todayString,
          })
        : undefined,
    [lessonLogs, lessonReviews, liveLesson, studentMap, todayString],
  )

  // "New window" in the live class console opens /?live=<timetable entry>&date=<day>.
  const liveLinkOpened = useRef(false)
  useEffect(() => {
    if (liveLinkOpened.current || schedules.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const scheduleId = Number(params.get('live'))
    const date = params.get('date') ?? ''
    if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const schedule = schedules.find((entry) => entry.id === scheduleId)
    if (!schedule) return
    liveLinkOpened.current = true
    setLiveLesson({ scheduleId, date, title: schedule.title, classroomId: schedule.classroomId, studentCount: 0 })
  }, [schedules])

  function openLiveLesson(item: AgendaItem) {
    setLiveLesson({
      scheduleId: item.scheduleId,
      date: item.date,
      title: item.title,
      classroomId: item.classroomId,
      studentCount: item.studentCount,
    })
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
    setAttendanceUpcoming(false)
    setAttendanceViewOnly(false)
  }

  // Sets (or with null, clears) who covers one class day.
  async function handleSetLessonSubstitute(scheduleId: number, lessonDate: string, teacherId: number | null) {
    const classTeacherId = schedules.find((entry) => entry.id === scheduleId)?.teacherId
    setIsSavingSubstitute(true)
    const failure = await saveLessonSubstitute(scheduleId, lessonDate, teacherId)
    setIsSavingSubstitute(false)
    if (failure) {
      showToast(failure)
      return
    }
    setLessonSubstitutes((current) => [
      ...current.filter((entry) => substituteKey(entry.scheduleId, entry.lessonDate) !== substituteKey(scheduleId, lessonDate)),
      ...(teacherId === null || teacherId === classTeacherId ? [] : [{ scheduleId, lessonDate, teacherId }]),
    ])
    showToast(
      teacherId === null || teacherId === classTeacherId
        ? 'No substitute: the class teacher takes this class.'
        : `${teacherMap.get(teacherId)?.fullName ?? 'The substitute'} covers this class and can take its attendance.`,
    )
  }

  // A score above the criterion's remark threshold clears its remark.
  function updateAttendanceReviewScore(studentId: number, metric: ReviewMetric, score: number) {
    setAttendanceReviews((currentState) => {
      const form = currentState[studentId] ?? createEmptyAttendanceReviewForm()
      return {
        ...currentState,
        [studentId]: {
          ...form,
          scores: { ...form.scores, [metric.id]: score },
          remarks:
            score > metric.remarkRequiredAtOrBelow ? { ...form.remarks, [metric.id]: '' } : form.remarks,
        },
      }
    })
  }

  function updateAttendanceReviewRemark(studentId: number, criterionId: number, remark: string) {
    setAttendanceReviews((currentState) => {
      const form = currentState[studentId] ?? createEmptyAttendanceReviewForm()
      return {
        ...currentState,
        [studentId]: { ...form, remarks: { ...form.remarks, [criterionId]: remark } },
      }
    })
  }

  function updateAttendanceLessonRemark(studentId: number, remark: string) {
    setAttendanceReviews((currentState) => ({
      ...currentState,
      [studentId]: {
        ...(currentState[studentId] ?? createEmptyAttendanceReviewForm()),
        lessonRemark: remark,
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
      attendanceReviewMetrics,
      attendanceStatusOptions,
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
      // Supabase errors are plain objects: show the server's reason.
      setAttendanceSaveError(getErrorMessage(error, 'Failed to submit attendance.'))
    } finally {
      setIsSavingAttendance(false)
    }
  }

  function renderCalendarEventContent(eventInfo: EventContentArg) {
    const special = eventInfo.event.extendedProps.special as SpecialCard | undefined
    // The classic month draws every class as a block, not as a small special-day card.
    if (special && eventInfo.view.type === 'dayGridMonth' && !classicMonth) {
      const done =
        special.kind !== 'cancel' &&
        latestLessonLogMap.has(`${Number(eventInfo.event.extendedProps.scheduleId)}:${String(eventInfo.event.extendedProps.occurrenceDate ?? (eventInfo.event.start ? getDateKeyFromDate(eventInfo.event.start) : ''))}`)
      return <SpecialMonthCard card={special} done={done} />
    }

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

    // A task, Zoom meeting or event is not a class: it says what it is, not "Replacement".
    if (eventInfo.event.extendedProps.calendarItemId !== undefined) {
      const itemKind = eventInfo.event.extendedProps.calendarItemKind as CalendarItem['kind']
      return (
        <div className="rounded-lg px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80">
              {itemKind === 'meeting' ? 'Zoom meeting' : itemKind === 'task' ? 'Task' : 'Event'}
            </span>
            {eventInfo.timeText && <span className="text-[10px] font-medium">{eventInfo.timeText}</span>}
          </div>
          <div className="mt-1 text-[11px] font-semibold leading-snug">{eventInfo.event.title}</div>
        </div>
      )
    }

    if (eventInfo.event.extendedProps.isCancelledOccurrence) {
      const cancelReason = eventInfo.event.extendedProps.cancelReason as string

      return (
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-slate-500 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Cancelled
            </span>
            <span className="text-[10px] font-medium">{eventInfo.timeText}</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold leading-snug line-through">
            {eventInfo.event.title}
          </div>
          {cancelReason && (
            <div className="mt-0.5 text-[10px] leading-snug">{cancelReason}</div>
          )}
        </div>
      )
    }

    const eventOccurrenceDate = eventInfo.event.start
      ? getDateKeyFromDate(eventInfo.event.start)
      : ''
    const eventClassroomId = (eventInfo.event.extendedProps.classroomId as number | null) ?? null
    const allMakeupNotes = getClassroomMakeupNotes(eventClassroomId, eventOccurrenceDate)
    // A school with many classes (the day list) names no children on a card: how many make-ups, not whose.
    const makeupNotes =
      dayListOn && allMakeupNotes.length > 0
        ? [`${allMakeupNotes.length} make-up${allMakeupNotes.length === 1 ? '' : 's'}`]
        : allMakeupNotes

    // A make-up slot on the 29th-31st, when the class doesn't normally meet.
    if (eventInfo.event.extendedProps.isMakeupOnly) {
      const makeupCompleted = latestLessonLogMap.has(
        `${Number(eventInfo.event.extendedProps.scheduleId)}:${eventOccurrenceDate}`,
      )

      return (
        <div
          className={cn(
            'rounded-lg border px-2 py-1.5 shadow-sm',
            makeupCompleted
              ? 'border-violet-200 bg-violet-100 text-violet-700 opacity-75'
              : 'border-violet-200 bg-violet-500 text-white',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
                makeupCompleted ? 'bg-white/80 text-slate-600' : 'bg-violet-100 text-violet-800',
              )}
            >
              {makeupCompleted ? 'Completed' : 'Make-up'}
            </span>
            <span
              className={cn(
                'text-[10px] font-medium',
                makeupCompleted ? 'text-slate-500' : 'text-white/90',
              )}
            >
              {eventInfo.timeText}
            </span>
          </div>
          <div
            className={cn(
              'mt-1 text-[11px] font-semibold leading-snug',
              makeupCompleted && 'text-slate-700',
            )}
          >
            {eventInfo.event.title}
          </div>
          <div
            className={cn('mt-0.5 text-[10px]', makeupCompleted ? 'text-slate-500' : 'text-white/90')}
          >
            {eventInfo.event.extendedProps.teacherName as string}
          </div>
          <div
            className={cn(
              'mt-0.5 truncate text-[10px]',
              makeupCompleted ? 'text-slate-400' : 'text-white/80',
            )}
          >
            {makeupNotes.join(' · ')}
          </div>
        </div>
      )
    }

    const classKind = eventInfo.event.extendedProps.classKind as
      | 'regular'
      | 'trial'
      | 'camp'
      | 'replacement'

    if (classKind === 'trial') {
      const trialScheduleId = Number(eventInfo.event.extendedProps.scheduleId)
      const trialOccurrenceDate = eventInfo.event.start
        ? getDateKeyFromDate(eventInfo.event.start)
        : ''
      const slotBookings =
        trialBookingMap.get(getTrialSlotKey(trialScheduleId, trialOccurrenceDate)) ?? []
      const isBooked = slotBookings.length > 0
      const completed = latestLessonLogMap.has(`${trialScheduleId}:${trialOccurrenceDate}`)

      return (
        <div
          // The colour legend is gone; hovering a card says what kind it is.
          title={`Trial class · ${completed ? 'completed' : isBooked ? 'booked' : 'available'}`}
          className={cn(
            'rounded-lg border px-2 py-1.5 shadow-sm',
            isBooked && !completed && 'border-teal-200 bg-teal-500 text-white',
            isBooked && completed && 'border-teal-200 bg-teal-100 text-teal-700 opacity-75',
            !isBooked && 'border-dashed border-slate-300 bg-slate-50 text-slate-500',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
                isBooked && !completed && 'bg-teal-100 text-teal-800',
                isBooked && completed && 'bg-white/80 text-slate-600',
                !isBooked && 'bg-slate-200 text-slate-600',
              )}
            >
              {completed
                ? 'Completed'
                : isBooked
                  ? `${slotBookings.length} booked`
                  : 'Available'}
            </span>
            <span
              className={cn(
                'text-[10px] font-medium',
                isBooked && !completed ? 'text-white/90' : 'text-slate-500',
              )}
            >
              {eventInfo.timeText}
            </span>
          </div>
          <div
            className={cn(
              'mt-1 text-[11px] font-semibold leading-snug',
              isBooked && !completed ? 'text-white' : 'text-slate-600',
            )}
          >
            {eventInfo.event.title}
          </div>
          <div
            className={cn(
              'mt-0.5 text-[10px]',
              isBooked && !completed ? 'text-white/90' : 'text-slate-500',
            )}
          >
            {eventInfo.event.extendedProps.teacherName as string}
          </div>
          {/* A school with many classes (the day list) names no children on a card: "2 booked" says enough. */}
          {isBooked && !dayListOn && (
            <div
              className={cn(
                'mt-0.5 truncate text-[10px]',
                completed ? 'text-slate-500' : 'text-white/80',
              )}
            >
              {slotBookings
                .map((booking) =>
                  booking.childAge !== null
                    ? `${booking.childName} (${booking.childAge})`
                    : booking.childName,
                )
                .join(', ')}
            </div>
          )}
        </div>
      )
    }

    const teacherName = eventInfo.event.extendedProps.teacherName as string
    const scheduleId = Number(eventInfo.event.extendedProps.scheduleId)
    const occurrenceDate = eventInfo.event.start
      ? getDateKeyFromDate(eventInfo.event.start)
      : ''
    const cardClassroomId = eventInfo.event.extendedProps.classroomId as number | null
    // A class card lists who was in the class that day, not everyone in it now. A school with many classes
    // (the day list) shows how many instead: dozens of names made the calendar unreadable.
    const participantNames =
      dayListOn && eventInfo.event.extendedProps.eventType === 'regular' && cardClassroomId
        ? ((count: number) => `${count} student${count === 1 ? '' : 's'}`)((classroomStudentMap.get(cardClassroomId) ?? []).length)
        : eventInfo.event.extendedProps.eventType === 'regular' && cardClassroomId && occurrenceDate
        ? getClassroomRosterOn(students, cardClassroomId, occurrenceDate)
            .map((student) => student.name)
            .join(', ') || 'No students assigned'
        : (eventInfo.event.extendedProps.participantNames as string)
    const completed = latestLessonLogMap.has(`${scheduleId}:${occurrenceDate}`)

    return (
      <div
        title={`${classKind === 'camp' ? 'Camp class' : classKind === 'replacement' ? 'Replacement class' : 'Regular class'}${completed ? ' · completed' : ''}`}
        className={cn(
          'rounded-lg border px-2 py-1.5 shadow-sm',
          classKind === 'regular' && !completed && 'border-sky-200 bg-sky-500 text-white',
          classKind === 'camp' && !completed && 'border-emerald-200 bg-emerald-600 text-white',
          classKind === 'camp' &&
            completed &&
            'border-emerald-200 bg-emerald-100 text-emerald-700 opacity-75',
          classKind === 'replacement' &&
            !completed &&
            'border-orange-200 bg-orange-500 text-white',
          classKind === 'regular' &&
            completed &&
            'border-sky-200 bg-sky-100 text-sky-700 opacity-75',
          classKind === 'replacement' &&
            completed &&
            'border-orange-200 bg-orange-100 text-orange-700 opacity-75',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
              classKind === 'regular' && !completed && 'bg-sky-100 text-sky-700',
              classKind === 'camp' && !completed && 'bg-emerald-100 text-emerald-700',
              classKind === 'replacement' &&
                !completed &&
                'bg-orange-100 text-orange-700',
              completed && 'bg-white/80 text-slate-600',
            )}
          >
            {completed
              ? 'Completed'
              : classKind === 'regular'
                ? 'Regular'
                : classKind === 'camp'
                  ? 'Camp'
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
        {makeupNotes.length > 0 && (
          <div
            className="mt-1 truncate rounded bg-violet-600 px-1 py-0.5 text-[10px] font-semibold text-white"
            title={makeupNotes.join('\n')}
          >
            Make-up: {makeupNotes.join(' · ')}
          </div>
        )}
      </div>
    )
  }

  if (authInitializing) {
    return <main className="min-h-screen bg-[#f8fafc]" />
  }

  if (!authSession) {
    return <AuthScreen blockedMessage={authBlockedMessage} />
  }

  if (loadError && !isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-6">
        <div className="max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Unable to load your workspace</h1>
          <p role="alert" className="text-sm text-red-700">{loadError}</p>
          <p className="text-sm text-slate-600">You are still signed in. Retry loading your data.</p>
          <button className="rounded-xl bg-[#fc0c97] px-4 py-2 text-white" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>
          <button className="ml-4 text-sm" onClick={() => supabase?.auth.signOut()}>Sign out</button>
        </div>
      </main>
    )
  }

  if (isLoading || loadedUserId !== authSession.user.id || !currentTeacher || !currentTeacher.isActive) {
    // Either core data (including the teachers table) is still loading, or
    // the auth-blocked effect above is about to sign this session out.
    return <main className="min-h-screen bg-[#f8fafc]" />
  }

  return (
    <AgeGroupsContext.Provider value={schoolAgeGroupNames}>
    <ProgramLevelsContext.Provider value={schoolLevelNames}>
    <WhatsAppOpenProvider value={canOpenWhatsAppChat ? openWhatsAppChat : null}>
    <main className="compact-admin min-h-screen bg-white pb-20 text-slate-900 lg:pb-0">
      {confirmDialog}
      {toastHost}
      <FollowUpReminders
        due={followUpReminders.due}
        onOpen={openFollowUpChat}
        onDone={(id) => calendarItems.setDone(id, true)}
        onSnooze={followUpReminders.snooze}
      />
      {calendarItemEditor && (
        <CalendarItemModal
          item={calendarItemEditor.item}
          defaultDate={calendarItemEditor.date}
          teachers={activeTeachers.map((teacher) => ({ id: teacher.id, fullName: teacher.fullName }))}
          canEdit={canEditCalendar}
          onClose={() => setCalendarItemEditor(null)}
          onSave={(draft) => calendarItems.save(calendarItemEditor.item, draft)}
          onDelete={calendarItemEditor.item ? () => calendarItems.remove(calendarItemEditor.item!.id) : undefined}
          onToggleDone={
            calendarItemEditor.item
              ? async (isDone) => {
                  const problem = await calendarItems.setDone(calendarItemEditor.item!.id, isDone)
                  if (!problem) {
                    setCalendarItemEditor((current) =>
                      current && current.item ? { ...current, item: { ...current.item, isDone } } : current,
                    )
                  }
                  return problem
                }
              : undefined
          }
        />
      )}
      <div className="flex min-h-screen">
        <aside
          className={cn(
            // The menu stays put on the left while the page scrolls, and scrolls by itself when it is taller than the window.
            'hidden shrink-0 bg-[#0a0a0a] text-white transition-[width] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:overflow-y-auto lg:overscroll-contain',
            isSidebarCollapsed ? 'w-[64px]' : 'w-[220px]',
          )}
        >
          <div className={cn('flex border-b border-white/10 px-2 pt-2', isSidebarCollapsed ? 'justify-center pb-2' : 'justify-end')}>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Show the menu names' : 'Shrink the menu to icons'}
              title={isSidebarCollapsed ? 'Show the menu names' : 'Shrink the menu to icons'}
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              {isSidebarCollapsed ? (
                <CaretDoubleRight size={18} aria-hidden="true" />
              ) : (
                <CaretDoubleLeft size={18} aria-hidden="true" />
              )}
            </button>
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col items-center gap-1 border-b border-white/10 px-4 pb-4">
              <BrandLogo className="h-24 w-auto" textClassName="text-center text-xl font-bold text-white" />
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Teaching System
              </div>
            </div>
          )}

          {!isSidebarCollapsed && (
          <div className="px-3 py-3">
            <div className="rounded-xl bg-[#fc0c97] px-3 py-2.5">
              <div className="text-sm font-semibold">
                {currentSession?.role === 'teacher'
                  ? 'Teacher Workspace'
                  : currentSession?.role === 'staff'
                    ? 'Staff Workspace'
                    : 'Admin Workspace'}
              </div>
              <div className="mt-1 text-xs text-white/85">
                {currentSession?.role === 'teacher'
                  ? 'Calendar, attendance, and classroom overview'
                  : currentSession?.role === 'staff'
                    ? 'The modules your admin has ticked for you'
                    : 'Calendar, attendance, and student control center'}
              </div>
            </div>
          </div>
          )}

          <SideNav entries={navEntries} activeSection={activeSection} collapsed={isSidebarCollapsed} onSelect={selectNav} />
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#be185d]">
                  {activeSection === 'home'
                    ? isTeacherAccount
                      ? 'Teacher Home'
                      : 'Admin Home'
                    : activeSection === 'calendar'
                    ? 'Calendar Board'
                    : activeSection === 'classrooms'
                      ? 'Classroom Board'
                      : activeSection === 'questions' || activeSection === 'videos'
                      ? 'Classroom Board'
                      : activeSection === 'programmes'
                        ? 'Settings'
                      : activeSection === 'teacher-quality'
                        ? 'Team Board'
                      : activeSection === 'teachers' || activeSection === 'team-replies'
                        ? 'Team Board'
                        : activeSection === 'leads'
                          ? 'Sales Pipeline'
                          : activeSection === 'whatsapp' ||
                          activeSection === 'automations' ||
                          activeSection === 'ai-knowledge' ||
                          activeSection === 'content-studio' ||
                          activeSection === 'content-library'
                            ? 'Marketing'
                            : activeSection === 'forms'
                            ? 'Marketing'
                            : activeSection === 'activity'
                              ? 'Admin Audit'
                              : 'Student Board'}
                </div>
                <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                  {activeSection === 'home'
                    ? 'Today'
                    : activeSection === 'calendar'
                    ? 'Classes, Attendance & Timetable'
                    : activeSection === 'classrooms'
                      ? 'My Classroom'
                      : activeSection === 'questions'
                      ? 'Question Bank'
                      : activeSection === 'videos'
                      ? 'Class Videos'
                      : activeSection === 'programmes'
                        ? 'Programmes'
                      : activeSection === 'app-logins'
                        ? 'App Logins'
                      : activeSection === 'teacher-quality'
                        ? 'Teacher Quality'
                      : activeSection === 'student-chat'
                        ? 'Student Chat'
                      : activeSection === 'fee-calculator'
                        ? 'Fee Calculator'
                      : activeSection === 'student-inbox'
                        ? 'Student Inbox'
                      : activeSection === 'teachers'
                        ? 'My Team'
                        : activeSection === 'team-replies'
                        ? 'Team Replies'
                        : activeSection === 'leads'
                          ? 'Leads'
                          : activeSection === 'whatsapp'
                            ? 'Inbox'
                            : activeSection === 'automations'
                              ? 'Automations'
                              : activeSection === 'ai-knowledge'
                              ? 'AI Knowledge'
                              : activeSection === 'content-studio'
                              ? 'Content Studio'
                              : activeSection === 'content-library'
                              ? 'Content Library'
                              : activeSection === 'forms'
                            ? 'Forms'
                            : activeSection === 'activity'
                              ? 'Activity Log'
                              : 'Students'}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
                {/* On a phone the Inbox needs the room: the date and the past-feedback switch are not about chats. */}
                <div
                  className={cn(
                    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600',
                    (activeSection === 'whatsapp' || activeSection === 'student-inbox') && 'max-sm:hidden',
                  )}
                >
                  Local Date: {formatDate(todayString)}
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={lateFeedbackEdit}
                    disabled={isSavingLateFeedbackEdit}
                    onClick={() => void handleToggleLateFeedbackEdit()}
                    title="When on, teachers can edit attendance and feedback of past classes, not only within 24 hours."
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60',
                      (activeSection === 'whatsapp' || activeSection === 'student-inbox') && 'max-sm:hidden',
                      lateFeedbackEdit
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative h-4 w-7 rounded-full transition',
                        lateFeedbackEdit ? 'bg-amber-500' : 'bg-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-3 w-3 rounded-full bg-white transition',
                          lateFeedbackEdit ? 'left-3.5' : 'left-0.5',
                        )}
                      />
                    </span>
                    Edit past feedback: {lateFeedbackEdit ? 'On' : 'Off'}
                  </button>
                ) : (
                  lateFeedbackEdit && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                      Past feedback can be edited now
                    </div>
                  )
                )}
                {import.meta.env.DEV && currentTeacher.role === 'admin' && (
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                    <span className="font-medium">View As (dev only)</span>
                    <select
                      value={viewAsTeacherId ?? ''}
                      onChange={(event) =>
                        setViewAsTeacherId(
                          event.target.value ? Number(event.target.value) : null,
                        )
                      }
                      className="!min-h-0 bg-transparent !p-0 text-xs font-semibold text-amber-900 outline-none"
                    >
                      <option value="">{currentTeacher.fullName} (Me)</option>
                      {teachers
                        .filter(
                          (teacher) => teacher.isActive && teacher.id !== currentTeacher.id,
                        )
                        .map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.fullName} (
                            {teacher.role === 'admin'
                              ? 'Admin'
                              : teacher.role === 'staff'
                                ? 'Staff'
                                : 'Teacher'}
                            )
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {staffNotes.available && (
                  <StaffNotificationBell
                    items={staffNotes.items}
                    unread={staffNotes.unread}
                    onMarkRead={(ids) => void staffNotes.markRead(ids)}
                    onOpenChat={can('leads') ? openFollowUpChat : null}
                    onOpenLead={can('leads') ? openEditLeadModal : null}
                    onOpenStudent={(studentId) =>
                      students.some((student) => student.id === studentId)
                        ? openStudentDetail(studentId)
                        : showToast('This student is not in your list.', 'info')
                    }
                  />
                )}
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                  <span className="font-medium">{currentTeacher.fullName}</span>
                  <button
                    type="button"
                    onClick={() => supabase?.auth.signOut()}
                    className="font-semibold text-[#be185d] transition hover:text-[#9d174d]"
                  >
                    Log out
                  </button>
                </div>
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
            {(showAdminHome || visibleSection === 'whatsapp' || visibleSection === 'student-inbox') && (
              <ChannelAlertBar
                alerts={channelAlerts.alerts}
                isAdmin={isAdmin}
                apiUrl={whatsAppApiUrl ?? undefined}
                onOpenChannelAccess={() => {
                  // My Team opens on Teams and scrolls to Inbox channels (MyTeamTabs, ChannelAccessSection).
                  setTeacherDetailsId(null)
                  setActiveSection('teachers')
                  window.location.hash = CHANNEL_ACCESS_HASH
                }}
              />
            )}
            {loadError && (
              <section className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                <BrandMascot name="eggy" className="h-16 w-auto shrink-0" />
                <div>
                  <div className="font-heading text-sm font-bold text-amber-900">
                    {brand.mascot === 'mirai' ? 'Eggy hit a snag' : 'Something went wrong'}
                  </div>
                  <div className="mt-0.5">{loadError}</div>
                </div>
              </section>
            )}

            {visibleSection === null && !isLoading && (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
                Your account has no modules yet. Ask your admin to tick what you can use.
              </section>
            )}

            {visibleSection === 'home' && teacherAgenda && (
              <TeacherHomeSection
                teacherName={effectiveTeacher?.fullName ?? 'teacher'}
                todayString={todayString}
                agenda={teacherAgenda}
                classes={teacherHomeClasses}
                lateEditOpen={lateFeedbackEdit}
                onTakeAttendance={(item) =>
                  void openAttendanceForEvent(item.scheduleId, item.date, item.title)
                }
                onRunLive={supabase ? openLiveLesson : undefined}
                onOpenCalendar={() => setActiveSection('calendar')}
                onOpenClass={(classroomId) => {
                  const classroom = classroomMap.get(classroomId)
                  if (classroom) {
                    setSelectedAgeGroup(classroom.ageGroup)
                    setSelectedClassroomId(classroomId)
                    setActiveSection('classrooms')
                  }
                }}
              />
            )}

            {showAdminHome && (
              <AdminHomeSection
                adminName={effectiveTeacher?.fullName ?? 'there'}
                todayString={todayString}
                isLoading={isLoading}
                teacherNames={teacherNames}
                agenda={adminAgenda}
                studentRows={adminStudentRows}
                leads={can('leads') ? leads : null}
                unreadForms={can('forms') ? unreadFormSubmissions : null}
                whatsApp={
                  can('inbox') && chatwootUrl && whatsAppApiUrl
                    ? { unread: unreadWhatsApp, waiting: waitingWhatsApp }
                    : null
                }
                automations={
                  can('automations') ? { summary: automationSummary, unavailable: automationUnavailable } : null
                }
                canRenew={can('students', 'edit')}
                onTakeAttendance={(item) =>
                  void openAttendanceForEvent(item.scheduleId, item.date, item.title)
                }
                onRunLive={supabase ? openLiveLesson : undefined}
                onOpenCalendar={() => setActiveSection('calendar')}
                onOpenStudent={openStudentDetail}
                onRenewStudent={openStudentRenewal}
                onOpenFollowUpStudents={() => {
                  setStudentFilter('all')
                  setStudentFollowUpOnly(true)
                  setActiveSection('students')
                }}
                onOpenLeads={() => setActiveSection('leads')}
                onOpenLeadTasks={openFollowUpModal}
                followUps={todaysFollowUps(calendarItems.items, currentSession?.teacherId ?? null, new Date())}
                onOpenFollowUp={openFollowUpChat}
                onOpenForms={() => setActiveSection('forms')}
                onOpenWhatsApp={() => setActiveSection('whatsapp')}
                onOpenAutomations={() => setActiveSection('automations')}
              />
            )}

            {visibleSection === 'calendar' && (
              <>
                {/* Not overflow-hidden: FullCalendar's "+more" box has to be able to
                    reach past the edge of this card instead of being cut off. */}
                <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  {/* The filters (their kind buttons carry the cards' colours) and the add buttons, on one row. */}
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 lg:flex-row lg:items-start">
                    <div className="min-w-0 lg:flex-1">
                      <CalendarFilterBar
                        filter={calendarFilter}
                        onChange={setCalendarFilter}
                        people={calendarFilterPeople}
                        teams={calendarTeams}
                        canPickPeople={seesAllClasses}
                      />
                    </div>
                    {canEditCalendar && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCalendarItemEditor({ item: null, date: todayString })}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Add Task / Meeting / Event
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreateSchedule()}
                          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                        >
                          Add Class
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-3 sm:p-4">
                    {showDayList ? (
                      <CalendarDayList
                        today={todayString}
                        now={dayListNow}
                        date={shownDayListDate}
                        onSelectDate={(date) => {
                          setDayListDate(date)
                          setDayListMonth(date.slice(0, 7))
                        }}
                        monthKey={shownDayListMonth}
                        onMonthChange={setDayListMonth}
                        lessons={dayListLessons}
                        grades={schoolAgeGroupNames}
                        items={dayListItems}
                        filteredOutside={isFiltered(calendarFilter)}
                        onOpenItem={(entry) => {
                          const picked = calendarItems.items.find((item) => item.id === entry.id)
                          if (picked) setCalendarItemEditor({ item: picked, date: picked.date })
                        }}
                        onOpenLesson={setOpenDayLesson}
                        onTakeAttendance={(lesson) => void openAttendanceForEvent(lesson.scheduleId, lesson.date, lesson.title)}
                        onRunLive={supabase ? openLiveLesson : undefined}
                        onShowCalendar={setCalendarMode}
                      />
                    ) : (
                    <>
                    {dayListOn && (
                      <button
                        type="button"
                        onClick={() => setCalendarMode('day_list')}
                        className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
                      >
                        ← Back to the day list
                      </button>
                    )}
                    <FullCalendar
                      key={`calendar-${isMobile ? 'mobile' : 'desktop'}-${currentSession?.key ?? 'anon'}-${calendarMode ?? 'first'}`}
                      plugins={[
                        dayGridPlugin,
                        timeGridPlugin,
                        listPlugin,
                        interactionPlugin,
                        rrulePlugin,
                      ]}
                      initialView={calendarMode && calendarMode !== 'day_list' ? calendarMode : isMobile ? 'listWeek' : 'dayGridMonth'}
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
                      events={shownCalendarEvents}
                      // The month shows at most 4 cards a day, the special days before the weekly classes; the
                      // classic month 2 big blocks, as it always had. "+N more" opens the rest.
                      dayMaxEvents={classicMonth ? 2 : 4}
                      eventOrder="monthRank,start,-duration,allDay,title"
                      datesSet={(arg) => setCalendarViewType(arg.view.type)}
                      // Each day of the month carries the "nothing on" note (not in the classic month); index.css
                      // shows it only on a day without a card.
                      dayCellContent={(arg) =>
                        arg.view.type === 'dayGridMonth' && !arg.isOther && !classicMonth ? (
                          <>
                            <span>{arg.dayNumberText}</span>
                            <span className="fc-day-empty-note">No class event scheduled.</span>
                          </>
                        ) : (
                          arg.dayNumberText
                        )
                      }
                      nowIndicator
                      eventDisplay="block"
                      displayEventTime
                      eventTimeFormat={{
                        hour: 'numeric',
                        minute: '2-digit',
                        meridiem: 'short',
                      }}
                      editable={canEditCalendar && !isMobile}
                      eventDurationEditable={false}
                      // Snap a refused drop back quickly so its reason shows sooner.
                      dragRevertDuration={200}
                      eventAllow={(span, movingEvent) => {
                        if (!movingEvent) {
                          return false
                        }
                        const reason = checkClassDrop(movingEvent, span.start, span.allDay)
                        dragBlockReasonRef.current = reason
                        return reason === null
                      }}
                      eventDragStart={() => {
                        dragBlockReasonRef.current = null
                      }}
                      eventDragStop={() => {
                        const reason = dragBlockReasonRef.current
                        dragBlockReasonRef.current = null
                        if (reason) {
                          showToast(reason)
                        }
                      }}
                      eventDrop={(info: EventDropArg) => {
                        // Nothing moves until the admin confirms and it saves.
                        info.revert()
                        openMoveDraft(info.oldEvent, info.event)
                      }}
                      dateClick={(arg: DateClickArg) => {
                        if (canEditCalendar) {
                          openCreateSchedule(arg.dateStr)
                        }
                      }}
                      eventClick={(arg: EventClickArg) => {
                        closeCalendarMorePopover()

                        if (arg.event.extendedProps.isHoliday) {
                          return
                        }

                        // A task, Zoom meeting or event: open it, not a class.
                        if (arg.event.extendedProps.calendarItemId !== undefined) {
                          const picked = calendarItems.items.find(
                            (entry) => entry.id === Number(arg.event.extendedProps.calendarItemId),
                          )
                          if (picked) {
                            setCalendarItemEditor({ item: picked, date: picked.date })
                          }
                          return
                        }

                        const scheduleId = Number(arg.event.extendedProps.scheduleId)
                        const occurrenceDate = arg.event.start
                          ? getDateKeyFromDate(arg.event.start)
                          : todayString

                        if (arg.event.extendedProps.isMakeupOnly) {
                          // Once the day has come (or has a report), it opens
                          // like any class: attendance and feedback. Before
                          // that there's nothing to record yet.
                          if (
                            occurrenceDate <= todayString ||
                            latestLessonLogMap.has(`${scheduleId}:${occurrenceDate}`)
                          ) {
                            void openAttendanceForEvent(
                              scheduleId,
                              occurrenceDate,
                              arg.event.title,
                            )
                            return
                          }

                          const entries =
                            makeupMap.get(
                              makeupKey(
                                Number(arg.event.extendedProps.classroomId),
                                occurrenceDate,
                              ),
                            ) ?? []
                          if (canEditCalendar && entries[0]) {
                            openMakeupPlan(entries[0].planId)
                          } else {
                            showToast(describeMakeupEntries(entries).join(' · ') || 'Make-up slot')
                          }
                          return
                        }

                        if (arg.event.extendedProps.isCancelledOccurrence) {
                          if (canEditCalendar) {
                            openCancelledOccurrenceOptions(scheduleId, occurrenceDate)
                          } else {
                            const cancelledCard = arg.event.extendedProps.special as SpecialCard | undefined
                            showToast(cancelledCard?.madeUp ?? 'This class day is cancelled.')
                          }
                          return
                        }

                        // On the month calendar a replacement or extra class opens its window: the class, who
                        // teaches it, attendance and (for an admin) change teacher, move or cancel.
                        const monthCard = arg.event.extendedProps.special as SpecialCard | undefined
                        if (monthCard && (monthCard.kind === 'replacement' || monthCard.kind === 'extra')) {
                          const lesson = dayLessonFor(scheduleId, occurrenceDate)
                          if (lesson) {
                            setOpenDayLesson(lesson)
                            return
                          }
                        }

                        // A class with attendance already in opens as its
                        // report (attendance, reviews, remark) for everyone;
                        // the admin reaches the schedule from there.
                        if (latestLessonLogMap.has(`${scheduleId}:${occurrenceDate}`)) {
                          void openAttendanceForEvent(
                            scheduleId,
                            occurrenceDate,
                            arg.event.title,
                          )
                          return
                        }

                        if (arg.event.extendedProps.classKind === 'trial') {
                          // Admins manage who's booked; teachers go straight
                          // to attendance, same as every other class type.
                          if (canEditCalendar) {
                            openTrialBooking(scheduleId, occurrenceDate)
                          } else {
                            void openAttendanceForEvent(
                              scheduleId,
                              occurrenceDate,
                              arg.event.title,
                            )
                          }
                          return
                        }

                        if (canEditCalendar) {
                          openEditSchedule(scheduleId, occurrenceDate)
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
                    </>
                    )}
                  </div>
                </section>
              </>
            )}

            {visibleSection === 'classrooms' && (
              <ClassListingSection
                classrooms={visibleClassrooms}
                classroomStudentMap={classroomStudentMap}
                deletingClassroomId={deletingClassroomId}
                restoringClassroomId={restoringClassroomId}
                canEdit={can('classrooms', 'edit')}
                simple={isTeacherAccount && !seesAllClasses}
                onDeleteClassroom={can('classrooms', 'delete') ? handleDeleteClassroom : undefined}
                onEditClassroom={openEditClassroom}
                onEditSchedule={openEditSchedule}
                onOpenCreateClassroom={can('classrooms', 'edit') ? openCreateClassroom : undefined}
                onOpenClassSettings={can('class_settings') ? openClassSettings : undefined}
                onOpenCreateRegularSchedule={
                  can('classrooms', 'edit')
                    ? (classroomId) => openCreateSchedule(undefined, classroomId)
                    : undefined
                }
                onOpenStudentDetail={openStudentDetail}
                onRestoreClassroom={can('classrooms', 'delete') ? handleRestoreClassroom : undefined}
                onSelectAgeGroup={setSelectedAgeGroup}
                schedules={activeClassroomSchedules}
                selectedAgeGroup={selectedAgeGroup}
                selectedClassroomId={selectedClassroomId}
                setSelectedClassroomId={setSelectedClassroomId}
                teacherMap={teacherMap}
                todayString={todayString}
                subjects={subjects}
                assignableTeachers={can('classrooms', 'edit') ? assignableTeachers : undefined}
                onTeachersChanged={refreshClassrooms}
              />
            )}

            {visibleSection === 'students' && (
              <StudentDashboardSection
                studentCodes={studentCodeEnabled ? studentCodes : undefined}
                studentFields={
                  anyStudentField(studentFields.setting)
                    ? {
                        setting: studentFields.setting,
                        extras: studentFields.extras,
                        kinds: studentFields.kinds,
                        consultants: studentConsultants,
                        rosterCounts: studentFields.rosterCounts,
                      }
                    : undefined
                }
                studentTags={supabase && tagOptions.length > 0 ? { options: tagOptions, map: studentTags.tags } : undefined}
                studentCodeSetting={
                  isAdmin
                    ? { enabled: studentCodeEnabled, isSaving: isSavingStudentCodeSetting, onToggle: () => void handleToggleStudentCode() }
                    : undefined
                }
                activeFilter={studentFilter}
                canEdit={can('students', 'edit')}
                canDelete={can('students', 'delete')}
                packages={packages}
                followUpOnly={studentFollowUpOnly}
                onToggleFollowUp={() => setStudentFollowUpOnly((current) => !current)}
                classrooms={classrooms}
                schedules={schedules}
                teacherMap={teacherMap}
                trialBookings={trialBookings}
                parents={studentParents}
                attendedStudentIds={attendedStudentIds}
                programmes={programmes.programmes}
                subjects={subjects}
                onOpenAssignPackages={
                  can('students', 'edit')
                    ? () => {
                        setAssignPackagesError(null)
                        setIsAssignPackagesOpen(true)
                      }
                    : undefined
                }
                onOpenPackages={can('packages') ? () => setIsPackagesOpen(true) : undefined}
                deactivatingStudentId={deactivatingStudentId}
                isLoading={isLoading}
                students={listedStudents}
                todayString={todayString}
                onDeactivateStudent={handleDeactivateStudent}
                onOpenCreateStudent={openCreateStudentModal}
                onOpenBulkImportPreviewStudents={openBulkImportPreviewStudentsModal}
                onOpenStudentDetail={openStudentDetail}
                onOpenRenewal={openStudentRenewal}
                onSelectFilter={setStudentFilter}
              />
            )}

            {visibleSection === 'teachers' && teacherDetailsId !== null && teacherDetailsAgenda && (
              (() => {
                const detailsTeacher = teachers.find((teacher) => teacher.id === teacherDetailsId)
                return detailsTeacher ? (
                  <TeacherDetailsSection
                    teacher={detailsTeacher}
                    classes={teacherDetailsClasses}
                    weekItems={teacherDetailsAgenda.items}
                    weekStart={teacherDetailsAgenda.weekStart}
                    weekHours={teacherDetailsAgenda.summary.week.hours}
                    missingAttendance={teacherDetailsAgenda.summary.todo.length}
                    todayString={todayString}
                    canEditClassroom={can('classrooms', 'edit')}
                    onBack={() => setTeacherDetailsId(null)}
                    onEditTeacher={() => openEditTeacherModal(detailsTeacher.id)}
                    onOpenStudent={openStudentDetail}
                    onEditClassroom={openEditClassroom}
                    onOpenAttendance={(item) =>
                      void openAttendanceForEvent(item.scheduleId, item.date, item.title)
                    }
                  />
                ) : null
              })()
            )}

            {visibleSection === 'teachers' && (teacherDetailsId === null || !teacherDetailsAgenda) && (
              <MyTeamTabs
                accounts={
                  isAdmin ? (
                    <TeacherManagementSection
                      onOpenTeacher={setTeacherDetailsId}
                      deletingTeacherId={deletingTeacherId}
                      isLoading={isLoading}
                      teachers={activeTeachers}
                      onDeleteTeacher={handleDeleteTeacher}
                      onEditTeacher={openEditTeacherModal}
                      onOpenCreateTeacher={openCreateTeacherModal}
                      protectedTeacherIds={protectedTeacherIds}
                      teamsOf={(teacherId) => teamsOf(teacherId, staffTeams.teams, staffTeams.members)}
                    />
                  ) : null
                }
                teams={
                  isAdmin ? (
                    <TeamsPanel
                      teams={staffTeams.teams}
                      members={staffTeams.members}
                      missing={staffTeams.missing}
                      loadError={staffTeams.error}
                      people={teamPeople}
                      onChanged={async () => {
                        // A team's ticks change its members' totals.
                        await Promise.all([staffTeams.refresh(), refreshTeachers()])
                      }}
                      listInboxes={listTeamInboxes}
                    />
                  ) : null
                }
                hours={
                  <WorkingHoursPanel
                    people={teamPeople}
                    canEdit={isAdmin}
                    canEditSettings={can('class_settings', 'edit')}
                    todayString={todayString}
                  />
                }
              />
            )}

            {visibleSection === 'leads' && (
              <LeadsSection
                isLoading={isLoading}
                leads={isMockMode ? [...MOCK_SOCIAL_LEADS, ...leads] : leads}
                studentNameOf={(studentId) => students.find((student) => student.id === studentId)?.name ?? null}
                codeOf={leadCodeOf}
                canEdit={can('leads', 'edit')}
                canDelete={can('leads', 'delete')}
                canConvert={can('leads', 'edit') && can('students', 'edit')}
                onChangeStatus={handleChangeLeadStatus}
                onConvertLead={handleConvertLead}
                onEditLead={openEditLeadModal}
                onOpenCreateLead={openCreateLeadModal}
                onOpenBulkImportLeads={openBulkImportLeadsModal}
                onOpenFollowUp={openFollowUpModal}
                onDeleteLead={handleDeleteLead}
                deletingLeadId={deletingLeadId}
                leadOptions={leadOptions}
                onOpenLeadOptions={() => setIsLeadOptionsOpen(true)}
                onOpenStages={isAdmin ? () => setIsLeadStagesOpen(true) : undefined}
                leadIdsWithForms={leadIdsWithForms}
                onOpenFormAnswers={openLeadFormAnswers}
                onToggleCheck={handleToggleLeadCheck}
                teacherNames={teacherNames}
                onBulkAction={handleBulkLeadAction}
                leadChannels={isMockMode ? [...MOCK_SOCIAL_CHANNELS, ...leadChannels.rows] : leadChannels.rows}
              />
            )}

            {/* Once opened, the WhatsApp page stays mounted behind other pages, so coming back to it
                finds the same chat, search, filters and scroll position. */}
            {(visibleSection === 'whatsapp' || hasOpenedWhatsApp) && chatwootUrl && (
              <div className={visibleSection === 'whatsapp' ? undefined : 'hidden'}>
                <WhatsAppSection
                  chatwootUrl={chatwootUrl}
                  apiUrl={whatsAppApiUrl}
                  currentUser={whatsAppUser}
                  staff={whatsAppStaff}
                  crm={whatsAppCrm}
                  active={visibleSection === 'whatsapp'}
                  openRequest={whatsAppRequest}
                  everyOpenChat={everyOpenChat}
                  inboxCopy={inboxCopy}
                  numbersView={whatsAppNumbersView}
                />
              </div>
            )}
            {/* The Student Inbox: the same page over the students numbers only; also kept mounted once opened. */}
            {(visibleSection === 'student-inbox' || hasOpenedStudentInbox) && chatwootUrl && (
              <div className={visibleSection === 'student-inbox' ? undefined : 'hidden'}>
                <WhatsAppSection
                  chatwootUrl={chatwootUrl}
                  apiUrl={whatsAppApiUrl}
                  currentUser={whatsAppUser}
                  staff={whatsAppStaff}
                  crm={whatsAppCrm}
                  active={visibleSection === 'student-inbox'}
                  everyOpenChat={everyOpenStudentChat}
                  inboxCopy={inboxCopy}
                  numbersView={whatsAppNumbersView}
                  zone="students"
                />
              </div>
            )}

            {visibleSection === 'automations' && (
              <AutomationsSection classrooms={classrooms} canEdit={can('automations', 'edit')} leadOptions={leadOptions} />
            )}

            {visibleSection === 'content-studio' && (
              <ContentStudioSection canEdit={can('content_studio', 'edit')} isAdmin={isAdmin} teacherNames={teacherNames} />
            )}
            {visibleSection === 'content-library' && <ContentLibrarySection />}
            {visibleSection === 'fee-calculator' && <FeeCalculatorSection canEdit={can('fee_calculator', 'edit')} isAdmin={isAdmin} />}

            {visibleSection === 'ai-knowledge' && (
              <AiKnowledgeSection
                canEdit={can('ai_knowledge', 'edit')}
                loadThread={
                  whatsAppClient
                    ? (chatId, lastMessageId) => fetchThread(whatsAppClient, chatId, lastMessageId)
                    : undefined
                }
              />
            )}
            {visibleSection === 'questions' && (
              <QuestionBankSection
                currentTeacherId={currentSession?.teacherId ?? null}
                isAdmin={can('questions', 'edit')}
                teacherNames={new Map(Array.from(teacherMap.entries()).map(([id, teacher]) => [id, teacher.fullName]))}
                subjects={subjects}
                classrooms={visibleClassrooms}
              />
            )}

            {visibleSection === 'videos' && (
              <ClassVideosSection
                classrooms={visibleClassrooms}
                students={students}
                subjects={subjects}
                teacherNames={new Map(Array.from(teacherMap.entries()).map(([id, teacher]) => [id, teacher.fullName]))}
                currentTeacherId={currentSession?.teacherId ?? null}
              />
            )}

            {visibleSection === 'programmes' && <ProgrammesSection canEdit={isAdmin} state={programmes} />}

            {visibleSection === 'student-chat' && (
              <div className="h-[calc(100dvh-234px)] min-h-[520px]">
                <AppChatPanel chat={appChat} isAdmin={isAdmin} />
              </div>
            )}

            {visibleSection === 'app-logins' && (
              <AppLoginsSection students={students} canManage={can('students', 'edit')} onOpenStudent={openStudentDetail} />
            )}

            {visibleSection === 'forms' && (
              <FormsSection
                teacherMap={teacherMap}
                onSubmissionsSeen={markFormSubmissionsSeen}
                canEdit={can('forms', 'edit')}
                canDelete={can('forms', 'delete')}
              />
            )}

            {visibleSection === 'team-replies' && (
              <TeamRepliesSection staff={teamReplyStaff} client={whatsAppClient} canCopy={isAdmin} hoursInUse={teamHoursInUse} />
            )}

            {visibleSection === 'teacher-quality' && (
              <TeacherQualitySection teachers={teamReplyStaff.map((person) => ({ id: person.id, fullName: person.name }))} canEdit={can('quality', 'edit')} />
            )}

            {visibleSection === 'activity' && (
              <AdminActivitySection
                activities={adminActivities}
                teacherMap={teacherMap}
                classroomMap={classroomMap}
                todayString={todayString}
                day={activityDay}
                onChangeDay={setActivityDay}
                isLoading={isLoadingActivity}
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
          showStudentCode={studentCodeEnabled}
          extraFields={
            anyStudentField(studentFields.setting) ? (
              <StudentExtraInputs
                setting={studentFields.setting}
                form={studentExtrasForm}
                kinds={studentFields.kinds}
                consultants={studentConsultants}
                salesPeople={studentSalesPeople}
                options={studentFields.options}
                onChange={(field, value) => setStudentExtrasForm((current) => ({ ...current, [field]: value }))}
              />
            ) : undefined
          }
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
          packages={offeredPackages}
          onPackageChange={applyCreatePackage}
          packageNotice={getCreatePackageNotice()}
          onFieldChange={updateCreateStudentForm}
          showStudentCode={studentCodeEnabled}
          extraFields={
            anyStudentField(studentFields.setting) ? (
              <StudentExtraInputs
                setting={studentFields.setting}
                form={studentExtrasForm}
                kinds={studentFields.kinds}
                consultants={studentConsultants}
                salesPeople={studentSalesPeople}
                options={studentFields.options}
                onChange={(field, value) => setStudentExtrasForm((current) => ({ ...current, [field]: value }))}
              />
            ) : undefined
          }
        />
      )}

      {isBulkImportPreviewStudentsOpen && (
        <PreviewStudentBulkImportModal
          isImporting={isImportingPreviewStudents}
          importError={bulkImportPreviewStudentError}
          onClose={closeBulkImportPreviewStudentsModal}
          onImport={handleBulkImportPreviewStudents}
        />
      )}

      {(isCreatingClassroom || editingClassroom) && (
        <ClassroomModal
          isCreating={isCreatingClassroom}
          editingClassroom={editingClassroom}
          assignableTeachers={assignableTeachers}
          formState={classroomFormState}
          programmes={programmes.programmes}
          levelFlowIds={new Map(programLevels.map((level) => [level.name, level.flowId ?? null]))}
          subjects={subjects}
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
          onPermissionsChange={(permissions) => updateCreateTeacherForm('permissions', permissions)}
          loginPassword={teacherLoginPassword}
          onLoginPasswordChange={setTeacherLoginPassword}
          onProvisionLogin={handleProvisionTeacherLogin}
          isProvisioningLogin={isProvisioningLogin}
          provisionLoginError={provisionLoginError}
        />
      )}

      {deleteTeacherTarget && (
        <DeleteTeacherModal
          teacher={deleteTeacherTarget}
          classroomNames={classrooms
            .filter(
              (classroom) =>
                classroom.status === 'active' &&
                classroom.teacherId === deleteTeacherTarget.id,
            )
            .map((classroom) => classroom.name)}
          successorOptions={assignableTeachers.filter(
            (teacher) => teacher.id !== deleteTeacherTarget.id,
          )}
          isDeleting={deletingTeacherId === deleteTeacherTarget.id}
          onClose={() => setDeleteTeacherTargetId(null)}
          onConfirm={(successorTeacherId) => void confirmDeleteTeacher(successorTeacherId)}
        />
      )}

      {isCreateLeadOpen && (
        <LeadModal
          editingLead={editingLead}
          formState={leadFormState}
          saveError={leadSaveError}
          isSaving={isSavingLead}
          onClose={closeLeadModal}
          onSubmit={handleLeadSubmit}
          onFieldChange={updateLeadForm}
          leadOptions={leadOptions}
          onAddLeadOption={handleAddLeadOption}
          chats={editingLead ? leadChannels.rows.filter((row) => row.leadId === editingLead.id) : undefined}
          parentName={
            editingLead
              ? leadParentName(
                  editingLead,
                  editingLead.convertedStudentId !== null
                    ? (students.find((student) => student.id === editingLead.convertedStudentId)?.name ?? null)
                    : null,
                )
              : null
          }
          formSubmissions={editingLeadFormSubmissions}
          isLoadingFormSubmissions={isLoadingEditingLeadForms}
          focusFormAnswers={focusFormAnswers}
          studentCodes={editingLead ? (leadCodeOf?.(editingLead) ?? []) : undefined}
          readOnly={Boolean(editingLead) && !can('leads', 'edit')}
        />
      )}

      {isAssignPackagesOpen && (
        <AssignPackagesModal
          students={students.filter((student) => student.studentType === 'regular')}
          packages={packages}
          isSaving={isSavingAssignments}
          error={assignPackagesError}
          onClose={() => setIsAssignPackagesOpen(false)}
          onSave={(changes) => void handleAssignPackages(changes)}
        />
      )}

      {isChangePackageOpen && selectedStudentDetail && detailEnrollments[0] && (
        <ChangePackageModal
          student={selectedStudentDetail}
          enrollment={[...detailEnrollments].sort((a, b) => b.id - a.id)[0]}
          packages={packages}
          isSaving={isSavingPackageChange}
          error={changePackageError}
          onClose={() => setIsChangePackageOpen(false)}
          onSave={(change) => void handleChangePackage(change)}
        />
      )}

      {isClassSettingsOpen && (
        <ClassSettingsModal
          criteria={reviewCriteria}
          zoomOptions={zoomOptions}
          onClose={() => setIsClassSettingsOpen(false)}
          onAddCriterion={(draft) => saveReviewCriterion(null, draft)}
          onSaveCriterion={(criterion, draft) => saveReviewCriterion(criterion, draft)}
          onSetCriterionActive={(criterion, isActive) => saveReviewCriterion(criterion, { isActive })}
          onMoveCriterion={moveReviewCriterion}
          statuses={attendanceStatusOptions}
          onAddStatus={(draft) => saveAttendanceStatus(null, draft)}
          onSaveStatus={(status, changes) => saveAttendanceStatus(status, changes)}
          onSaveStatusPoints={saveAttendanceStatusPoints}
          onAttendanceTakersSaved={setAttendanceTakerRules}
          onCalendarLayoutSaved={(layout, weekly) => {
            setCalendarLayout(layout)
            setMonthWeekly(weekly)
          }}
          rewardPresets={rewardPresets}
          rewardLevels={rewardLevels}
          onRewardsChanged={() => void reloadRewards()}
          subjects={subjects}
          onSaveSubject={async (subject, changes) => {
            const failure = await saveSubject(subject, changes)
            if (!failure) {
              const next = await loadSubjects()
              if (next) setSubjects(next)
            }
            return failure
          }}
          ageGroups={ageGroups}
          onSaveAgeGroup={async (group, changes) => {
            const failure = await saveAgeGroup(group, changes)
            if (!failure) {
              const next = await loadAgeGroups()
              if (next) setAgeGroups(next)
              // A rename changes the classes too.
              if (group && changes.name && changes.name !== group.name) void syncCoreQuietly()
            }
            return failure
          }}
          programLevels={programLevels}
          onSaveProgramLevel={async (level, changes) => {
            const failure = await saveProgramLevel(level, changes)
            if (!failure) {
              const next = await loadProgramLevels()
              if (next) setProgramLevels(next)
              if (level && changes.name && changes.name !== level.name) void syncCoreQuietly()
            }
            return failure
          }}
          onSaveZoomOptions={saveZoomOptions}
          studentFields={
            <StudentFieldsSettings
              setting={studentFields.setting}
              onSettingChange={studentFields.changeSetting}
              onKindsChange={studentFields.setKinds}
              options={studentFields.options}
              onOptionsChange={studentFields.setOptions}
              counts={studentFields.rosterCounts}
              onCountsChange={studentFields.setRosterCounts}
            />
          }
          enrolFlows={
            <>
              <EnrolFlowsSettings
                levels={programLevels}
                programmes={programmes.programmes}
                onChanged={async () => {
                  const next = await loadProgramLevels()
                  if (next) setProgramLevels(next)
                }}
              />
              <ProgrammesSection canEdit={isAdmin} state={programmes} />
            </>
          }
        />
      )}

      {isPackagesOpen && (
        <PackagesModal
          packages={packages}
          onClose={() => setIsPackagesOpen(false)}
          onAdd={handleAddPackage}
          onSave={handleSavePackage}
          onSetActive={(pkg, isActive) => void handleSetPackageActive(pkg, isActive)}
        />
      )}

      {isLeadStagesOpen && <LeadStagesModal state={leadStages} onClose={() => setIsLeadStagesOpen(false)} />}

      {isLeadOptionsOpen && (
        <LeadOptionsModal
          options={leadOptions}
          error={null}
          onClose={() => setIsLeadOptionsOpen(false)}
          onAdd={handleAddLeadOption}
          onRename={handleRenameLeadOption}
          onSetActive={(option, isActive) => void handleSetLeadOptionActive(option, isActive)}
          onSetColor={(option, color) => void handleSetLeadOptionColor(option, color)}
        />
      )}

      {isBulkImportLeadsOpen && (
        <LeadBulkImportModal
          todayString={todayString}
          sourceOptions={leadOptions}
          isImporting={isImportingLeads}
          importError={bulkImportLeadError}
          onClose={closeBulkImportLeadsModal}
          onImport={handleBulkImportLeads}
        />
      )}

      {followUpLead && (
        <LeadFollowUpModal
          lead={followUpLead}
          isSaving={isSavingFollowUp}
          saveError={followUpSaveError}
          onClose={closeFollowUpModal}
          onAddFollowUp={handleAddFollowUp}
          isSavingTask={isSavingTask}
          taskSaveError={taskSaveError}
          onAddTask={handleAddTask}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onOpenChat={
            canOpenWhatsAppChat && chatTargetForLead(followUpLead, leadChannels.rows)
              ? () => {
                  closeFollowUpModal()
                  openFollowUpChat(followUpLead.id)
                }
              : undefined
          }
        />
      )}

      {selectedStudentDetail && (
        <StudentDetailModal
          layer={
            attendanceModal || trialBookingSlot || isCreatingSchedule || editingScheduleId
              ? 'overlay'
              : 'base'
          }
          classrooms={classrooms}
          student={selectedStudentDetail}
          studentCode={studentCodeEnabled ? (studentCodes.get(selectedStudentDetail.id) ?? null) : null}
          tagsSlot={
            supabase && (tagOptions.length > 0 || can('students', 'edit')) ? (
              <PersonTags
                tags={tagOptions}
                selectedIds={studentTags.tags.get(selectedStudentDetail.id) ?? []}
                canEdit={can('students', 'edit')}
                onChange={(ids) =>
                  void studentTags.save(selectedStudentDetail.id, ids).then((problem) => {
                    if (problem) {
                      showToast(problem)
                    }
                  })
                }
                onCreate={(label, color) => handleAddLeadOption('tag', label, color)}
              />
            ) : undefined
          }
          extraSummary={
            <StudentExtraSummary
              setting={studentFields.setting}
              extras={studentFields.extras.get(selectedStudentDetail.id)}
              consultantName={teacherMap.get(studentFields.extras.get(selectedStudentDetail.id)?.consultantId ?? 0)?.fullName ?? null}
              salesPersonName={teacherMap.get(studentFields.extras.get(selectedStudentDetail.id)?.salesPersonId ?? 0)?.fullName ?? null}
            />
          }
          lessonLogs={lessonLogs}
          lessonReviews={lessonReviews}
          reviewCriteria={reviewCriteria}
          statusOptions={attendanceStatusOptions}
          rewardLevels={rewardLevels.length > 0 ? rewardLevels : undefined}
          canManagePoints={can('students', 'edit')}
          showAiReport={Boolean(supabase)}
          showAppLogins={Boolean(supabase)}
          showProgressCard={Boolean(supabase) && can('progress_cards')}
          onClose={closeStudentDetail}
          schedules={schedules}
          teacherMap={teacherMap}
          trialStudentIds={selectedStudentTrialIds}
          attendance={
            prefetchedAttendance?.studentId === selectedStudentDetail.id
              ? prefetchedAttendance.rows
              : undefined
          }
          parentName={studentParents.get(selectedStudentDetail.id)?.name ?? null}
          onRenew={
            can('students', 'edit')
              ? () => {
                  closeStudentDetail()
                  openStudentRenewal(selectedStudentDetail.id)
                }
              : undefined
          }
          makeupPlans={makeupPlans.filter(
            (plan) =>
              plan.studentId === selectedStudentDetail.id ||
              (plan.studentId === null && getStudentClassIds(selectedStudentDetail).includes(plan.classroomId)),
          )}
          makeupClasses={getStudentClassIds(selectedStudentDetail)
            .map((id) => classroomMap.get(id))
            .filter((classroom): classroom is Classroom => classroom?.category === 'regular')
            .map((classroom) => ({ id: classroom.id, name: classroom.name }))}
          onArrangeMakeup={
            canEditCalendar && selectedStudentDetail.studentType === 'regular'
              ? (classroomId) => void openStudentMakeup(selectedStudentDetail, classroomId)
              : undefined
          }
          onEditMakeup={canEditCalendar ? openMakeupPlan : undefined}
          enrollments={detailEnrollments}
          onChangePackage={
            can('students', 'edit')
              ? () => {
                  setChangePackageError(null)
                  setIsChangePackageOpen(true)
                }
              : undefined
          }
          packages={packages}
          onSetClassStart={can('students', 'edit') ? handleSetClassStart : undefined}
          showVideos={hasClassVideos}
          canEditVideoAccess={can('students', 'edit')}
          onAddClass={can('students', 'edit') ? (id) => handleStudentClass('add', id) : undefined}
          onRemoveClass={can('students', 'edit') ? (id) => handleStudentClass('remove', id) : undefined}
          onEdit={
            can('students', 'edit')
              ? () => {
                  closeStudentDetail()
                  openEditStudent(selectedStudentDetail.id)
                }
              : undefined
          }
        />
      )}

      {convertingStudentId !== null && studentMap.get(convertingStudentId) && (
        <ConvertHoaModal
          student={studentMap.get(convertingStudentId)!}
          classrooms={activeVisibleClassrooms.filter((classroom) => classroom.category !== 'trial')}
          packages={offeredPackages}
          todayString={todayString}
          onClose={() => setConvertingStudentId(null)}
          onConvert={async (input) => {
            const studentId = convertingStudentId
            const failure = await convertHoa({ ...input, studentId, leadId: getOpenHoaLeadId(studentId) })
            if (!failure) {
              setConvertingStudentId(null)
              showToast(`${studentMap.get(studentId)?.name ?? 'The student'} is now a regular student.`)
            }
            return failure
          }}
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
          packages={offeredPackages}
          onPackageChange={applyRenewalPackage}
          packageNotice={getRenewalPackageNotice()}
        />
      )}

      {cancelledOccurrenceModal && (() => {
        const cancelledSchedule = schedules.find(
          (schedule) => schedule.id === cancelledOccurrenceModal.scheduleId,
        )

        if (!cancelledSchedule) {
          return null
        }

        const cancelledClassroom = cancelledSchedule.classroomId
          ? classroomMap.get(cancelledSchedule.classroomId)
          : undefined
        const exception = scheduleExceptions.find(
          (entry) =>
            entry.scheduleId === cancelledSchedule.id &&
            entry.exceptionDate === cancelledOccurrenceModal.occurrenceDate,
        )
        const classMakeupPlan = makeupPlans.find(
          (plan) =>
            plan.classroomId === cancelledSchedule.classroomId &&
            plan.missedDate === cancelledOccurrenceModal.occurrenceDate &&
            plan.studentId === null,
        )
        const movedToSchedule = getMovedToSchedule(
          cancelledSchedule.id,
          cancelledOccurrenceModal.occurrenceDate,
        )

        return (
          <CancelledOccurrenceModal
            classroomName={cancelledClassroom?.name ?? cancelledSchedule.title}
            teacherName={teacherMap.get(cancelledSchedule.teacherId)?.fullName ?? 'Unknown Teacher'}
            occurrenceDate={cancelledOccurrenceModal.occurrenceDate}
            cancelReason={exception?.reason ?? null}
            movedToDate={movedToSchedule?.scheduledDate ?? null}
            onClose={closeCancelledOccurrenceOptions}
            onRestore={() => {
              const { scheduleId, occurrenceDate } = cancelledOccurrenceModal
              closeCancelledOccurrenceOptions()
              void handleRestoreOccurrence(scheduleId, occurrenceDate)
            }}
            onAddReplacement={() => {
              const { scheduleId, occurrenceDate } = cancelledOccurrenceModal
              closeCancelledOccurrenceOptions()
              openReplacementForCancelledDay(scheduleId, occurrenceDate)
            }}
            makeupSummary={
              classMakeupPlan
                ? `${classMakeupPlan.sessions
                    .map(
                      (session) =>
                        `${formatDate(session.sessionDate)} +${session.extraMinutes} min`,
                    )
                    .join(', ')} (${sumMakeupMinutes(classMakeupPlan.sessions)} / ${classMakeupPlan.missedMinutes} min)`
                : null
            }
            onArrangeMakeup={
              cancelledClassroom?.category === 'regular'
                ? () => {
                    const { occurrenceDate } = cancelledOccurrenceModal
                    closeCancelledOccurrenceOptions()
                    if (classMakeupPlan) {
                      openMakeupPlan(classMakeupPlan.id)
                    } else {
                      openMakeupEditor({
                        classroomId: cancelledClassroom.id,
                        planId: null,
                        missedDate: occurrenceDate,
                        studentId: null,
                      })
                    }
                  }
                : undefined
            }
          />
        )
      })()}

      {trialBookingSlot && (() => {
        const slotSchedule = schedules.find((schedule) => schedule.id === trialBookingSlot.scheduleId)

        if (!slotSchedule) {
          return null
        }

        const slotClassroom = slotSchedule.classroomId
          ? classroomMap.get(slotSchedule.classroomId)
          : undefined

        return (
          <TrialBookingModal
            slotTitle={slotClassroom?.name ?? slotSchedule.title}
            teacherName={teacherMap.get(slotSchedule.teacherId)?.fullName ?? 'Unknown Teacher'}
            dateKey={trialBookingSlot.dateKey}
            startTime={slotSchedule.startTime}
            endTime={slotSchedule.endTime}
            bookings={
              trialBookingMap.get(getTrialSlotKey(slotSchedule.id, trialBookingSlot.dateKey)) ?? []
            }
            leads={leads}
            canManage={canEditCalendar}
            isSaving={isSavingTrialBooking}
            error={trialBookingError}
            onClose={closeTrialBooking}
            onBook={handleBookTrial}
            onCancelBooking={canDeleteCalendar ? handleCancelTrialBooking : undefined}
            onOpenStudent={openStudentDetail}
            onEditSlot={() => {
              const { scheduleId, dateKey } = trialBookingSlot
              closeTrialBooking()
              openEditSchedule(scheduleId, dateKey)
            }}
            onTakeAttendance={
              trialBookingSlot.dateKey > todayString
                ? undefined
                : () => {
                    const { scheduleId, dateKey } = trialBookingSlot
                    closeTrialBooking()
                    void openAttendanceForEvent(
                      scheduleId,
                      dateKey,
                      slotClassroom?.name ?? slotSchedule.title,
                    )
                  }
            }
          />
        )
      })()}

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
          onCancelSchedule={canDeleteCalendar ? handleCancelSchedule : undefined}
          occurrenceDate={editingOccurrenceDate}
          isOccurrenceLogged={
            editingSchedule !== null &&
            editingOccurrenceDate !== null &&
            latestLessonLogMap.has(`${editingSchedule.id}:${editingOccurrenceDate}`)
          }
          onCancelOccurrence={handleCancelOccurrence}
          substitute={(() => {
            if (!editingSchedule || editingOccurrenceDate === null) return undefined
            const substitute = getLessonSubstitute(editingSchedule.id, editingOccurrenceDate)
            return substitute.options ? { ...substitute, options: substitute.options } : undefined
          })()}
          clashes={scheduleClashes}
          onOpenStudent={openStudentDetail}
          clashTeacherName={
            scheduleClashTeacherId !== null
              ? (teacherMap.get(scheduleClashTeacherId)?.fullName ?? 'This teacher')
              : 'This teacher'
          }
        />
      )}

      {openDayLesson && (
        <LessonWindow
          lesson={openDayLesson}
          today={todayString}
          now={dayListNow}
          alongside={dayListLessons.filter(
            (other) =>
              other.key !== openDayLesson.key &&
              other.date === openDayLesson.date &&
              other.startTime === openDayLesson.startTime &&
              other.classroomId !== null &&
              other.classroomId === openDayLesson.classroomId,
          )}
          rosterNames={() =>
            getScheduleRosterStudentIds(openDayLesson.scheduleId, openDayLesson.date)
              .map((id) => studentMap.get(id)?.name ?? '')
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
          }
          onTakeAttendance={() => {
            setOpenDayLesson(null)
            void openAttendanceForEvent(openDayLesson.scheduleId, openDayLesson.date, openDayLesson.title)
          }}
          onRunLive={
            supabase
              ? () => {
                  setOpenDayLesson(null)
                  openLiveLesson(openDayLesson)
                }
              : undefined
          }
          onEdit={
            canEditCalendar
              ? () => {
                  setOpenDayLesson(null)
                  openEditSchedule(openDayLesson.scheduleId, openDayLesson.date)
                }
              : undefined
          }
          onClose={() => setOpenDayLesson(null)}
        />
      )}

      {liveLesson && (
        <LiveClassConsole
          scheduleId={liveLesson.scheduleId}
          lessonDate={liveLesson.date}
          title={liveLesson.title}
          classroom={(liveLesson.classroomId && classroomMap.get(liveLesson.classroomId)) || null}
          studentNames={new Map(Array.from(studentMap, ([id, student]) => [id, student.name]))}
          backgrounds={liveBackgrounds}
          parentPhones={new Map(Array.from(studentMap, ([id, student]) => [id, student.phone]))}
          sendWhatsApp={
            whatsAppClient && whatsAppUser
              ? async (phone, name, text) => {
                  const started = await startChat(whatsAppClient, { phone, name })
                  if (started.error !== null) return started.error
                  try {
                    await whatsAppClient.sendMessage(started.conversationId, { content: text, isPrivate: false, files: [], sender: whatsAppUser })
                    return null
                  } catch (sendError) {
                    return sendError instanceof Error ? sendError.message : 'Could not send.'
                  }
                }
              : undefined
          }
          onClose={() => setLiveLesson(null)}
          onEndClass={() => {
            const lesson = liveLesson
            setLiveLesson(null)
            void openAttendanceForEvent(lesson.scheduleId, lesson.date, lesson.title, { autoFill: true })
          }}
        />
      )}

      {attendanceModal && (
        <AttendanceModal
          attendanceModal={attendanceModal}
          attendanceExistingLog={attendanceExistingLog}
          attendanceLocked={attendanceLocked}
          lateEditOpen={lateFeedbackEdit}
          isUpcoming={attendanceUpcoming}
          isViewOnly={attendanceViewOnly}
          substitute={getLessonSubstitute(attendanceModal.scheduleId, attendanceModal.occurrenceDate)}
          teacherName={
            attendanceExistingLog
              ? teacherMap.get(attendanceExistingLog.teacherId)?.fullName ?? null
              : null
          }
          adminAction={
            canEditCalendar ? getAttendanceAdminAction(attendanceModal) : undefined
          }
          isLoadingAttendance={isLoadingAttendance}
          attendanceRoster={attendanceRoster}
          attendanceStatuses={attendanceStatuses}
          attendanceReviews={attendanceReviews}
          reviewMetrics={attendanceReviewMetrics}
          statusOptions={attendanceStatusOptions}
          rewardPresets={rewardPresets.length > 0 ? rewardPresets : undefined}
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
          onUpdateLessonRemark={updateAttendanceLessonRemark}
          onOpenStudent={openStudentDetail}
          makeupNotes={getClassroomMakeupNotes(
            schedules.find((schedule) => schedule.id === attendanceModal.scheduleId)
              ?.classroomId ?? null,
            attendanceModal.occurrenceDate,
          )}
        />
      )}

      {moveDraft && (
        <MoveClassModal
          key={`${moveDraft.scheduleId}-${moveDraft.fromDate}-${moveDraft.toDate}`}
          draft={moveDraft}
          isSaving={isSavingMove}
          error={moveError}
          onClose={() => {
            setMoveDraft(null)
            setMoveError(null)
          }}
          onConfirm={(input) => void handleConfirmMove(input)}
          getClashes={getMoveClashes}
          clashTeacherName={
            teacherMap.get(
              schedules.find((entry) => entry.id === moveDraft.scheduleId)?.teacherId ?? -1,
            )?.fullName ?? 'This teacher'
          }
        />
      )}

      {makeupEditor && (() => {
        const makeupClassroom = classroomMap.get(makeupEditor.classroomId)
        const editingPlan =
          makeupEditor.planId !== null
            ? makeupPlans.find((plan) => plan.id === makeupEditor.planId) ?? null
            : null

        return (
          <MakeupPlanModal
            key={`${makeupEditor.classroomId}-${makeupEditor.planId ?? 'new'}-${makeupEditor.studentId ?? 'class'}`}
            classroomName={makeupClassroom?.name ?? 'Classroom'}
            roster={(classroomStudentMap.get(makeupEditor.classroomId) ?? []).filter(
              (student) =>
                (student.isActive && student.studentType === 'regular') ||
                student.id === makeupEditor.studentId,
            )}
            plan={editingPlan}
            initialMissedDate={makeupEditor.missedDate}
            initialStudentId={makeupEditor.studentId}
            missedDateOptions={makeupEditor.missedOptions ?? []}
            suggestDates={(afterDate, count) =>
              suggestMakeupDates(makeupEditor.classroomId, afterDate, count)
            }
            isSaving={isSavingMakeup}
            error={makeupError}
            onClose={closeMakeupEditor}
            onSave={(input) => void handleSaveMakeup(input)}
            onDelete={
              editingPlan && canDeleteCalendar
                ? () => void handleDeleteMakeup(editingPlan.id)
                : undefined
            }
          />
        )
      })()}

      <MobileNav entries={navEntries} activeSection={activeSection} onSelect={selectNav} />
    </main>
    </WhatsAppOpenProvider>
    </ProgramLevelsContext.Provider>
    </AgeGroupsContext.Provider>
  )
}

export default App
