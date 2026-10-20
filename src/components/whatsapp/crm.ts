import type { CalendarItem, CalendarItemDraft } from '../../lib/calendarItems'
import type { HoaSlot } from '../../lib/hoaSlots'
import type { Programme } from '../../lib/programmes'
import type { StudentClassLine } from '../../lib/studentClasses'
import type { LeadChannel } from '../../lib/leadChannels'
import type { ZoomSlot } from '../../lib/zoomSlots'
import type {
  Classroom,
  Lead,
  LeadFormSubmission,
  LeadOption,
  LeadOptionKind,
  LeadStatus,
  Package,
  Student,
  TrialBooking,
} from '../../types/domain'

// What the WhatsApp page needs from the rest of the CRM: the records to match a
// chat against, and the few things the team can do to them from the side panel.

// Everything the side panel can set on a lead, to create one or to save changes.
export type LeadFormValues = {
  fullName: string
  phone: string
  // One of the Malaysian states, '' when not set.
  state: string
  // Optional; left out where the form does not have them.
  nameZh?: string
  secondParentPhone?: string
  sourceId: number | null
  picId: number | null
  tagIds: number[]
  status: LeadStatus
  children: { name: string; age: number; phone: string | null }[]
  notes: string
  // The source keyword rule the first message matched (a new lead only), so automations can ask about it.
  sourceRuleId?: number | null
}

// Each action resolves to an error message, or null when it worked.
export type WhatsAppCrm = {
  leads: Lead[]
  students: Student[]
  classrooms: Classroom[]
  packages: Package[]
  // HOA bookings tie a lead to the student who came to the class.
  trialBookings: TrialBooking[]
  leadOptions: LeadOption[]
  canEditLeads: boolean
  canEditStudents: boolean
  // The HOA classes still open for booking, as the calendar shows them.
  listHoaSlots: () => HoaSlot[]
  // The same for one programme the school made: the open classes that belong to it (only this class
  // when classroomId is given).
  listProgrammeSlots?: (programmeId: number, classroomId?: number) => HoaSlot[]
  // Which programme a booked class belongs to, or null.
  bookingProgrammeId?: (booking: TrialBooking) => number | null
  // The school's programmes. Left out, the Inbox offers Mirai's two (HOA class, Holiday Camp).
  programmes?: Programme[]
  // What classes study, to find a class by grade then subject when signing a parent up.
  subjects?: { id: number; name: string; sortOrder: number }[]
  // Books the child into an HOA class on the calendar, tied to the lead.
  onBookHoa: (
    leadId: number,
    slot: HoaSlot,
    child: { name: string; age: number | null; phone: string },
  ) => Promise<string | null>
  // The classes a student is signed up for: the weekly times of their class, or the HOA class they booked.
  classesOfStudent: (student: Student) => StudentClassLine[]
  // How a booked class reads to a parent ("Sat 18 Oct, 10:00 to 12:00").
  describeHoaBooking: (booking: TrialBooking) => string
  // Takes the child out of the class again.
  onCancelHoa: (booking: TrialBooking) => Promise<string | null>
  // Signs a child up for the Holiday Camp: makes the student (from this lead), puts them in the camp
  // class, and gives them the Holiday Camp package from the start date.
  onEnrolCamp: (input: {
    leadId: number
    childName: string
    phone: string
    classroomId: number
    packageId: number
    startDate: string
  }) => Promise<string | null>
  // Signs a child up for a class of a programme the school made: makes the student (from this lead), puts them
  // in the class, and gives them the chosen package from the start date. Left out, the panel cannot enrol.
  onEnrolStudent?: (input: {
    leadId: number
    childName: string
    phone: string
    classroomId: number
    // Null for a school with no packages: the child just becomes a student of the class.
    packageId: number | null
    startDate: string
  }) => Promise<string | null>
  // Follow-ups: tasks on the calendar tied to a lead (the Follow up button beside the message box). Left out, the
  // button is not shown.
  followUps?: {
    // The calendar items this person can see (the page picks a lead's own out of them).
    items: CalendarItem[]
    // Who the signed-in person is, so they are reminded unless another is picked.
    meId: number | null
    save: (draft: CalendarItemDraft) => Promise<string | null>
    done: (id: number) => Promise<string | null>
    remove: (id: number) => Promise<string | null>
  }
  // Make-up classes are arranged with the calendar's permission.
  canBookMakeup: boolean
  // existingLeadId is set when no lead was made because the number already has one.
  onCreateLead: (input: LeadFormValues) => Promise<{ leadId: number | null; error: string | null; existingLeadId?: number }>
  onUpdateLead: (leadId: number, input: LeadFormValues) => Promise<string | null>
  // The lead's next trial day (or last one), written the way a parent reads it.
  trialDateFor: (leadId: number) => string | null
  onAddOption: (kind: LeadOptionKind, label: string, color?: string) => Promise<LeadOption | null>
  // Puts these tags on a parent or student of the Family card (the same tags the leads use); resolves to the reason when refused.
  onSetPersonTags?: (personId: number, tagIds: number[]) => Promise<string | null>
  // Writes the parent's number on a student who has none, so the chat finds them by phone too.
  onSetStudentPhone: (studentId: number, phone: string) => Promise<string | null>
  onOpenLead: (leadId: number) => void
  // The Zoom meetings on the calendar a parent can be put into (time and link already set), soonest first.
  zoomSlots?: ZoomSlot[]
  // The chats every lead has (WhatsApp numbers, Messenger Pages, Instagram), and a way to read them again.
  leadChannels: LeadChannel[]
  refreshLeadChannels: () => void
  // Joins two leads that are one family; the one with a phone number stays. Resolves to the lead that stays,
  // or an error message.
  onMergeLeads: (keepId: number, removeId: number) => Promise<{ leadId: number | null; error: string | null }>
  // Leads that filled in one of the school's forms, and a way to read what they wrote.
  leadIdsWithForms: Set<number>
  onOpenFormAnswers: (leadId: number) => void
  // Every form the lead filled in, newest first, to read in the panel.
  loadFormAnswers: (leadId: number) => Promise<LeadFormSubmission[]>
  onOpenStudent: (studentId: number) => void
  // Only offered for a student in a regular class.
  onOpenMakeup: (studentId: number) => void
}
