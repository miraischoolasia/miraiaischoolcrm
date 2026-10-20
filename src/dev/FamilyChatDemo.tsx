import { DetailsPanel } from '../components/whatsapp/DetailsPanel'
import type { WhatsAppCrm } from '../components/whatsapp/crm'
import type { Person } from '../lib/peopleApi'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import type { Lead } from '../types/domain'

// Only the dev server shows this (/?demo=familychat): the Inbox's side panel for a child who writes from their own
// number, beside the same family's parent chat, on made-up data held in the page. No login, nothing is sent or saved.

const lead = {
  id: 11,
  fullName: null,
  phone: '012-700 0001',
  sourceId: 1,
  picId: null,
  state: null,
  tagIds: [],
  checks: {},
  status: 'contacted',
  children: [{ name: 'Ethan Tan', age: 15, phone: '60190000002' }],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: '2026-10-01',
  createdAt: '',
  updatedAt: '',
} as unknown as Lead

const person = (id: number, patch: Partial<Person>): Person => ({
  id,
  kind: 'contact',
  name: null,
  phone: null,
  email: null,
  contactId: null,
  parentId: null,
  leadId: null,
  studentId: null,
  ...patch,
})

const people = [
  person(1, { kind: 'parent', name: 'Mei Ling', phone: '60127000001', contactId: 31, leadId: 11 }),
  person(2, { kind: 'student', name: 'Ethan Tan', phone: '60190000002', contactId: 32, parentId: 1 }),
]

const chat = (id: number, contactId: number, name: string, phone: string): ChatwootConversation => ({
  id,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: 0,
  last_activity_at: 0,
  custom_attributes: { crm_lead_id: 11 },
  meta: { sender: { id: contactId, name, phone_number: phone, identifier: null } },
})

const nothing = async () => null

const crm = {
  leads: [lead],
  students: [],
  classrooms: [],
  packages: [],
  trialBookings: [],
  listHoaSlots: () => [],
  classesOfStudent: () => [],
  describeHoaBooking: () => '',
  onBookHoa: nothing,
  onCancelHoa: nothing,
  onEnrolCamp: nothing,
  leadOptions: [{ id: 1, kind: 'source', label: 'Facebook', isActive: true, legacyKey: null, color: null }],
  // &edit=1: the forms can be typed in (nothing is saved), to try what a child's chat lets the team change.
  canEditLeads: new URLSearchParams(window.location.search).get('edit') === '1',
  canEditStudents: false,
  canBookMakeup: false,
  onCreateLead: async () => ({ leadId: 0, error: 'Demo only' }),
  onUpdateLead: nothing,
  trialDateFor: () => null,
  onAddOption: nothing,
  onSetStudentPhone: nothing,
  onOpenLead: () => undefined,
  leadChannels: [],
  refreshLeadChannels: () => undefined,
  onMergeLeads: async () => ({ leadId: 0, error: 'Demo only' }),
  leadIdsWithForms: new Set<number>(),
  onOpenFormAnswers: () => undefined,
  loadFormAnswers: async () => [],
  onOpenStudent: () => undefined,
  onOpenMakeup: () => undefined,
} as unknown as WhatsAppCrm

function Panel({ title, conversation }: { title: string; conversation: ChatwootConversation }) {
  return (
    <div className="min-w-0 flex-1">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">{title}</h2>
      <DetailsPanel
        className="flex rounded-xl border border-slate-200 bg-white"
        conversation={conversation}
        messages={[]}
        hasOlder={false}
        crm={crm}
        sourceRules={[]}
        onLoadOlder={() => undefined}
        onLinkLead={async () => true}
        onLinkStudents={async () => true}
        onOpenChat={() => undefined}
        people={people}
        chatOfContact={() => null}
      />
    </div>
  )
}

export function FamilyChatDemo() {
  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row">
        <Panel title="The child's own chat" conversation={chat(648, 32, '60190000002', '+60190000002')} />
        <Panel title="The parent's chat" conversation={chat(413, 31, 'Mei Ling +60127000001', '+60127000001')} />
      </div>
    </main>
  )
}
