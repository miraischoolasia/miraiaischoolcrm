import type { WhatsAppTarget } from '../WhatsAppLink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InstagramLogo, MessengerLogo, WhatsappLogo } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { familyChildNames, familyOf, personOfContact } from '../../lib/family'
import { chatNameLabel } from '../../lib/parentLabel'
import { CHANNEL_LABEL, channelsByLead, contactSiblings, leadOfContacts, placeOf, type LeadChannel } from '../../lib/leadChannels'
import { chatSwitchOptions, type ChatSwitchOption } from '../../lib/chatSwitch'
import { createChatwootClient, type Sender } from '../../lib/chatwootClient'
import { useMessageSearch } from '../../hooks/useMessageSearch'
import { useWhatsAppInbox } from '../../hooks/useWhatsAppInbox'
import type { InboxCopyLive } from '../../hooks/useInboxCopyLive'
import { StickerSourceContext } from '../../lib/inboxStickers'
import { useChatSchedules } from '../../hooks/useChatSchedules'
import { cancelSchedule, scheduleError, type ChatSchedule, type ScheduleTarget } from '../../lib/chatSchedules'
import { ScheduleDialog } from './ScheduleDialog'
import { StartFlowDialog } from './StartFlowDialog'
import { GalleryPicker } from '../galleries/GalleryPicker'
import { fileFromGallery } from '../../lib/galleries'
import { ScheduledList } from './ScheduledList'
import { useFillToBottom } from '../../hooks/useFillToBottom'
import { useInboxColumns } from '../../hooks/useInboxColumns'
import { ColumnHandle } from './ColumnHandle'
import {
  type ChatwootConversation,
  type ChatwootMessage,
  countByTab,
  filterConversations,
  chatIdentityMatch,
  matchesChatIdentity,
  getChatIdentity,
  getInitials,
  getLinkedLeadId,
  getChatRole,
  getLinkedStudentIds,
  getOwner,
  getRealPhone,
  getTab,
  isGroupChat,
  formatPhone,
  socialKindOf,
  isRecentlyOverdue,
  categoryOf,
  firstCategory,
  numbersContacted,
  countUnreadAcross,
  type InboxCategory,
  type InboxTab,
} from '../../lib/whatsappInbox'
import { hoaSlotLinesForAi } from '../../lib/hoaSlots'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { ChannelPicturesDialog, type ChannelPictureRow } from './ChannelPicturesDialog'
import type { ChannelInfo } from './ChannelBadge'
import { useChannelAvatars } from '../../hooks/useChannelAvatars'
import { useChannelLabels } from '../../hooks/useChannelLabels'
import { fullLabelOf, shortLabelOf } from '../../lib/channelLabels'
import { channelKeyOf, facebookPictureUrl, mainPageOf } from '../../lib/channelAvatars'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useAutomationQueue } from '../../hooks/useAutomationQueue'
import { useCopyOpenChats } from '../../hooks/useCopyOpenChats'
import { needsApproval, type QueueItem } from '../../lib/automationQueue'
import { useSourceRules } from '../../hooks/useSourceRules'
import { useAutoLeads } from '../../hooks/useAutoLeads'
import { useSocialLeads } from '../../hooks/useSocialLeads'
import { makeLeadResolver, quickReplyValues, resolveChatLead } from '../../lib/chatLink'
import { findChatForNumber, findOwnChatForNumber } from '../../lib/chatForNumber'
import { useAutoChatRole } from '../../hooks/useAutoChatRole'
import { usePeople } from '../../hooks/usePeople'
import { useHandlerSources } from '../../hooks/useHandlerSources'
import { familyHandler } from '../../lib/familyHandler'
import { codesLabel, withCodes } from '../../lib/studentCodeLabel'
import { linkContactToLead, linkContactToStudents, setContactRole, unlinkContactFromLead } from '../../lib/peopleApi'
import { draftPreview, draftsFirst, type Draft } from '../../lib/draft'
import { createWaActionsByInstance, waIdOf } from '../../lib/waActions'
import { instanceOfInbox } from '../../lib/waInstance'
import { useReactionPreviews } from '../../hooks/useReactionPreviews'
import { findChatByPhone, startChat } from '../../lib/startChat'
import { fileProblem, splitSequence } from '../../lib/outbox'
import { summarizeMessage } from '../../lib/specialMessages'
import { ForwardDialog } from './ForwardDialog'
import { forwardToEach, SOCIAL_WINDOW_REASON, SOCIAL_WINDOW_SECONDS } from '../../lib/forwardSend'
import { fetchRecentInboundChats } from '../../lib/inboxCopyReader'
import { useMessageEvents } from '../../hooks/useMessageEvents'
import { useTyping } from '../../hooks/useTyping'
import { makeStudentResolver } from '../../lib/studentLink'
import { studentGroupOptions, studentGroups, studentLabels, useStudentLabelContext } from '../../lib/studentLabel'
import { picOfStaff, staffOfPic as staffOfPicName } from '../../lib/picStaff'
import { getLeadStages, STAGE_COLORS, stageLabel } from '../../lib/leadStages'
import { otherChildStages } from '../../lib/childStages'
import { nextFollowUpOf } from '../../lib/followUps'
import { draftOfItem } from '../../lib/calendarItems'
import { FollowUpChatBar } from './FollowUpChatBar'
import type { QuickReply } from '../../lib/quickReplies'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'
import { AutomationQueueDialog } from './AutomationQueueDialog'
import { NewChatDialog } from './NewChatDialog'
import { FollowUpButton, FollowUpChip } from './FollowUpButton'
import { NumbersDialog, type AssignableStaff } from './NumbersDialog'
import { WaLabelSyncDialog } from './WaLabelSyncDialog'
import { problemLabel, type ChannelAlert } from '../../lib/channelAlerts'
import type { InboxZone, WhatsAppNumber, WhatsAppNumberDraft } from '../../lib/whatsappNumbers'
import { listedInboxIds, zoneFilter } from '../../lib/inboxZones'
import { QuickReplyManager, type QuickReplyStart } from './QuickReplyManager'
import { quickReplyStartFrom } from '../../lib/quickReplyFromMessages'
import { ownMediaUrl } from '../../lib/chatwoot'
import { contactPictureUrl } from '../../lib/contactPicture'
import { SourceRuleManager } from './SourceRuleManager'

type WhatsAppInboxProps = {
  apiUrl: string
  currentUser: Sender
  staff: Sender[]
  crm: WhatsAppCrm
  // False while another page is showing; this page stays mounted so it is as it was left.
  active?: boolean
  // A number somewhere else in the app asked for its chat. Each request has its own id.
  openRequest?: (WhatsAppTarget & { id: number }) | null
  // The school's WhatsApp numbers and who may see which. Without it the page is one inbox for everybody.
  numbersView?: WhatsAppNumbersView
  // Every open chat, read now and then by the menu badge: the unread numbers on the WhatsApp / Messenger /
  // Instagram buttons count all of them, as the badge does, not only the chats loaded in the list.
  everyOpenChat?: ChatwootConversation[]
  // The CRM's copy of the inbox: chats and messages read from it, new ones heard of by themselves, search across
  // every message. Without it (or while it is not live) the page asks Chatwoot as before.
  inboxCopy?: InboxCopyLive | null
  // Which inbox this is: the Marketing Inbox (default) or the Student Inbox under Students, which shows only the
  // students numbers, makes no leads by itself and runs no automations (docs/student-inbox-spec.md).
  zone?: InboxZone
}

// What the inbox needs to know about the school's WhatsApp numbers.
export type WhatsAppNumbersView = {
  numbers: WhatsAppNumber[]
  assignments: Map<number, number[]>
  // undefined while loading; null when nothing is restricted; otherwise the Chatwoot inboxes this person sees.
  allowedInboxIds: number[] | null | undefined
  // The Chatwoot inboxes of the Student Inbox; the Marketing Inbox leaves them out.
  studentInboxIds?: number[]
  isAdmin: boolean
  staff: AssignableStaff[]
  onSave: (existing: WhatsAppNumber | null, draft: WhatsAppNumberDraft, teacherIds: number[]) => Promise<string | null>
  onRemove: (number: WhatsAppNumber) => Promise<string | null>
  // Reads the numbers again (after the WhatsApp server added one).
  onReload?: () => Promise<void>
  // Numbers that stopped working (inbox id -> the alert): their buttons get a red mark.
  problems?: Map<number, ChannelAlert>
}

const CATEGORY_BUTTONS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: WhatsappLogo, color: '#25D366' },
  { key: 'messenger', label: 'Messenger', icon: MessengerLogo, color: '#0084FF' },
  { key: 'instagram', label: 'Instagram', icon: InstagramLogo, color: '#E1306C' },
] as const

export function WhatsAppInbox({
  apiUrl,
  currentUser,
  staff,
  crm,
  active = true,
  openRequest = null,
  numbersView,
  everyOpenChat,
  inboxCopy = null,
  zone = 'marketing',
}: WhatsAppInboxProps) {
  const isStudentInbox = zone === 'students'
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  // Reactions, edits, deletes and read ticks go to the phone of the number the chat is on (its Evolution name in the
  // numbers table); a school with no names set up has one number, as before.
  const waActionsFor = useMemo(() => createWaActionsByInstance(apiUrl), [apiUrl])
  const schoolNumbers = numbersView?.numbers
  const instanceOf = useCallback(
    (inboxId: number | undefined) => instanceOfInbox(schoolNumbers ?? [], inboxId),
    [schoolNumbers],
  )
  // While the numbers load nothing is listed, so a restricted person never sees a chat flash by.
  // Each inbox shows the numbers of its own zone only (the Student Inbox: nothing without the numbers list).
  const numbersAllowed = numbersView?.allowedInboxIds
  const studentInboxIds = numbersView?.studentInboxIds
  const zoned = useMemo(
    () => (numbersView ? zoneFilter(zone, numbersAllowed, studentInboxIds ?? []) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numbersView itself is a new object on every render
    [Boolean(numbersView), zone, numbersAllowed, studentInboxIds],
  )
  const hasNumbersView = Boolean(numbersView)
  const allowedInboxIds = useMemo(
    () => (hasNumbersView ? listedInboxIds(zoned) : isStudentInbox ? [] : null),
    [hasNumbersView, zoned, isStudentInbox],
  )
  const excludedInboxIds = useMemo(() => zoned?.excluded ?? [], [zoned])
  // One person who writes from a phone number and from a hidden ID is one chat once they are one lead.
  const siblings = useMemo(() => contactSiblings(crm.leadChannels), [crm.leadChannels])
  const leadOfContact = useMemo(() => leadOfContacts(crm.leadChannels), [crm.leadChannels])
  // Every open chat, whole, read once this page is opened (the menu badge only reads a light list now).
  const copyOpenChats = useCopyOpenChats(inboxCopy, active)
  const copyLink = useMemo(
    () => (inboxCopy ? { link: inboxCopy, everyOpen: copyOpenChats.length > 0 ? copyOpenChats : undefined } : null),
    [inboxCopy, copyOpenChats],
  )
  const inbox = useWhatsAppInbox(
    client,
    currentUser,
    active,
    allowedInboxIds,
    siblings,
    leadOfContact,
    copyLink,
    instanceOf,
    excludedInboxIds,
  )
  const waActions = waActionsFor(instanceOf(inbox.selected?.inbox_id))
  // The family table: who is whose parent. The database keeps it in step with leads and students; the
  // page adds each WhatsApp contact and what the team ties together by hand.
  const { people, refresh: refreshPeople } = usePeople({
    enabled: active,
    canEdit: crm.canEditLeads || crm.canEditStudents,
    conversations: inbox.conversations,
  })
  // For a chat with no lead: the person in charge of the family (the students' consultant, else a tag that names a PIC).
  const handlerSources = useHandlerSources(active)
  const [tab, setTab] = useState<InboxTab>('chats')
  const [tagId, setTagId] = useState<number | null>(null)
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<number | 'none' | null>(null)
  const [inboxFilter, setInboxFilter] = useState<number | null>(null)
  // WhatsApp, Messenger and Instagram chats are kept apart; WhatsApp is the one that opens first.
  const [category, setCategory] = useState<InboxCategory>('whatsapp')
  // The part that opens first is decided once, when the chats arrive: a school with no WhatsApp chat (Messenger only)
  // opens on Messenger. After that, or after anybody picked a part, it is left alone.
  const categoryDecided = useRef(false)
  const [socialInboxNames, setSocialInboxNames] = useState<Map<number, string>>(new Map())
  // The Facebook Page id of an inbox that has one, to fetch the Page's picture.
  const [inboxPageIds, setInboxPageIds] = useState<Map<number, string>>(new Map())
  const askedInboxNames = useRef(false)
  // The pictures an admin uploaded for the Pages; the Pages window sets them.
  const channelAvatars = useChannelAvatars(active)
  // Each number's / Page's short name and colour, so two of them are told apart (EduHero, 2026-10-20).
  const channelLabels = useChannelLabels(active)
  const [managingChannels, setManagingChannels] = useState(false)
  const [managingNumbers, setManagingNumbers] = useState(false)
  const [managingLabelSync, setManagingLabelSync] = useState(false)
  const [inboxList, setInboxList] = useState<{ id: number; name: string; phone?: string | null }[]>([])
  const [search, setSearch] = useState('')
  // Text the enrol steps write for the message box; each new id is added once.
  const [draftRequest, setDraftRequest] = useState<{ id: number; text: string } | null>(null)
  // Files the side panel puts in the message box (a quotation's PDF).
  const [fileRequest, setFileRequest] = useState<{ id: number; files: File[] } | null>(null)
  // On a small screen the side panel takes the place of the chat.
  const [detailsOpen, setDetailsOpen] = useState(false)

  const categoryChats = useMemo(
    () => inbox.conversations.filter((conversation) => categoryOf(conversation) === category),
    [inbox.conversations, category],
  )
  const categoryUnread = useMemo(
    () =>
      countUnreadAcross(
        copyOpenChats.length > 0 ? copyOpenChats : (everyOpenChat ?? []),
        inbox.conversations,
        allowedInboxIds,
        siblings,
        excludedInboxIds,
      ).byCategory,
    [copyOpenChats, everyOpenChat, inbox.conversations, allowedInboxIds, siblings, excludedInboxIds],
  )
  useEffect(() => {
    if (categoryDecided.current || inbox.conversations.length === 0) {
      return
    }
    categoryDecided.current = true
    setCategory(firstCategory(inbox.conversations))
  }, [inbox.conversations])
  const counts = useMemo(() => countByTab(categoryChats), [categoryChats])
  // Words typed in the search are also looked for inside the messages of every chat.
  // With the copy: every message ever copied, and the chat opens on the message found.
  const messageSearch = useMessageSearch(client, search, inboxCopy?.available ?? false)
  const messageHits = messageSearch.snippets
  const matchedIds = useMemo(() => new Set(messageHits.keys()), [messageHits])
  const { loadMissingConversations, addConversations } = inbox
  useEffect(() => {
    addConversations(messageSearch.chats)
    const fromCopy = new Set(messageSearch.chats.map((chat) => chat.id))
    const missing = [...messageHits.keys()].filter((id) => !fromCopy.has(id))
    if (missing.length > 0) {
      void loadMissingConversations(missing)
    }
  }, [messageSearch, messageHits, loadMissingConversations, addConversations])

  // Which lead each chat belongs to, for the tag and source filters.
  const resolveLead = useMemo(() => makeLeadResolver(crm.leads), [crm.leads])
  // The parent's name on a chat's lead, to title chats WhatsApp gave no name.
  const leadNameOf = useCallback(
    (conversation: ChatwootConversation) =>
      resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))?.fullName ?? null,
    [resolveLead],
  )
  const leadIdOf = useCallback(
    (conversation: ChatwootConversation) =>
      resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))?.id ?? null,
    [resolveLead],
  )
  // The students of the parent in each chat, found through the lead, the HOA bookings and the phone.
  const resolveStudents = useMemo(
    () => makeStudentResolver({ students: crm.students, trialBookings: crm.trialBookings, packages: crm.packages }),
    [crm.students, crm.trialBookings, crm.packages],
  )
  const studentsOf = useCallback(
    (conversation: ChatwootConversation) => {
      const phone = getRealPhone(conversation.meta.sender.phone_number)
      return resolveStudents(resolveLead(getLinkedLeadId(conversation), phone), phone, getLinkedStudentIds(conversation))
    },
    [resolveLead, resolveStudents],
  )
  // What a chat is called in the list and above the messages: the parent's name from the lead,
  // or, once the team said who is on it, "Albee's parent" / "Albee (student)".
  const chatLabelOf = useCallback(
    (conversation: ChatwootConversation) => {
      const person = personOfContact(conversation.meta.sender.id, people)
      // A lead that is not a student yet is named by the children written on it.
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      return chatNameLabel({
        leadName: leadNameOf(conversation),
        role: getChatRole(conversation),
        personKind: person?.kind ?? null,
        personName: person?.name ?? null,
        studentNames: studentsOf(conversation).map((student) => student.name),
        familyNames: person?.kind === 'parent' ? familyChildNames(conversation.meta.sender.id, people) : [],
        leadChildNames: (lead?.children ?? []).map((child) => child.name?.trim()),
      })
    },
    [leadNameOf, studentsOf, resolveLead, people],
  )
  // The student codes of a chat: a student's own chat shows their code, a parent's chat the codes of their children.
  const codesOfChat = useCallback(
    (conversation: ChatwootConversation) => {
      const codes = crm.studentCodes
      if (!codes) {
        return []
      }
      const contactId = conversation.meta.sender.id
      const person = personOfContact(contactId, people)
      const ids = new Set<number>()
      if (person?.kind === 'student' && person.studentId !== null) {
        ids.add(person.studentId)
      } else {
        for (const child of familyOf(contactId, people)?.children ?? []) {
          if (child.studentId !== null) {
            ids.add(child.studentId)
          }
        }
        for (const student of studentsOf(conversation)) {
          ids.add(student.id)
        }
      }
      return [...ids].flatMap((id) => codes.get(id) ?? [])
    },
    [crm.studentCodes, people, studentsOf],
  )
  // What a chat is called on screen: the name (or number) with the student codes in front.
  const chatTitleLabelOf = useCallback(
    (conversation: ChatwootConversation) => {
      const codes = codesOfChat(conversation)
      const label = chatLabelOf(conversation)
      if (codes.length === 0) {
        return label
      }
      return withCodes(label ?? getChatIdentity(conversation.meta.sender, null, conversation.meta.channel).title, codes)
    },
    [codesOfChat, chatLabelOf],
  )
  // Every name a chat can be found by in the search box.
  const searchNamesOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      return [
        chatLabelOf(conversation) ?? '',
        codesLabel(codesOfChat(conversation)),
        lead?.fullName ?? '',
        ...(lead?.children ?? []).map((child) => child.name ?? ''),
        ...studentsOf(conversation).map((student) => student.name ?? ''),
        ...familyChildNames(conversation.meta.sender.id, people),
      ].filter((name) => name.trim() !== '')
    },
    [chatLabelOf, codesOfChat, resolveLead, studentsOf, people],
  )
  // The students' class categories (or identity labels), shown on each chat and used by the type filter.
  const labelContext = useStudentLabelContext(crm.classrooms, crm.packages)
  const studentLabelsOf = useCallback(
    (conversation: ChatwootConversation) => [
      ...new Set(studentsOf(conversation).flatMap((student) => studentLabels(student, labelContext))),
    ],
    [studentsOf, labelContext],
  )
  const studentKindsOf = useCallback(
    (conversation: ChatwootConversation) =>
      studentsOf(conversation).flatMap((student) => studentGroups(student, labelContext)),
    [studentsOf, labelContext],
  )
  const studentGroupChoices = useMemo(
    () =>
      studentGroupOptions(
        labelContext.categories,
        crm.students.flatMap((student) => studentGroups(student, labelContext)),
        labelContext.identityLabels,
      ),
    [crm.students, labelContext],
  )
  // The lead's tags and person in charge, shown on each chat in the list.
  const optionsById = useMemo(() => new Map(crm.leadOptions.map((option) => [option.id, option])), [crm.leadOptions])
  const tagsOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      // In the school's tag order (Sources, PIC & Tags), not the order they were put on.
      const ids = new Set(lead?.tagIds ?? [])
      return crm.leadOptions.filter((option) => option.kind === 'tag' && ids.has(option.id))
    },
    [resolveLead, crm.leadOptions],
  )
  // "Handled by" and the lead's person in charge are one thing for the team: each PIC name stands for a staff
  // account (made from the staff list, 20261101300000), so they are matched by the account, never by the name.
  const staffOfPic = useCallback((pic: { teacherId?: number | null } | undefined) => staffOfPicName(pic, staff), [staff])
  // The person in charge of the family of a chat that has no lead of its own (read from what the database holds).
  const familyStaffOf = useCallback(
    (conversation: ChatwootConversation) => {
      const found = familyHandler(conversation.meta.sender.id, people, handlerSources)
      if (!found) {
        return null
      }
      if ('teacherId' in found) {
        return staff.find((person) => person.id === found.teacherId) ?? null
      }
      return staffOfPic(optionsById.get(found.picOptionId))
    },
    [people, handlerSources, staff, optionsById, staffOfPic],
  )
  // Once a lead has become a student, the family is looked after by the student's consultant (the Learning Consultant);
  // the lead's PIC (the Education Consultant who closed the sale) stays on the student as the sales person.
  const learningConsultantOf = useCallback(
    (conversation: ChatwootConversation, lead: { convertedStudentId: number | null } | null | undefined) => {
      if (lead?.convertedStudentId == null) {
        return null
      }
      const found = familyHandler(conversation.meta.sender.id, people, handlerSources)
      return found && 'teacherId' in found ? (staff.find((person) => person.id === found.teacherId) ?? null) : null
    },
    [people, handlerSources, staff],
  )
  const picOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      const leadPicOption = lead?.picId != null ? optionsById.get(lead.picId) : undefined
      const leadPic = staffOfPic(leadPicOption)?.name ?? leadPicOption?.label
      const owner = getOwner(conversation)
      const name =
        (owner ? (staff.find((person) => person.id === owner.id)?.name ?? owner.name) : undefined) ??
        learningConsultantOf(conversation, lead)?.name ??
        leadPic ??
        familyStaffOf(conversation)?.name
      return name ? { name, initials: getInitials(name) } : null
    },
    [resolveLead, optionsById, staff, familyStaffOf, learningConsultantOf, staffOfPic],
  )
  const picOptions = useMemo(() => crm.leadOptions.filter((option) => option.kind === 'pic'), [crm.leadOptions])
  const handlerOf = useCallback(
    (conversation: ChatwootConversation) => {
      const owner = getOwner(conversation)
      if (owner) {
        return { id: owner.id, name: staff.find((person) => person.id === owner.id)?.name ?? owner.name }
      }
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      const learning = learningConsultantOf(conversation, lead)
      if (learning) {
        return learning
      }
      const pic = lead?.picId != null ? picOptions.find((option) => option.id === lead.picId) : undefined
      return staffOfPic(pic) ?? familyStaffOf(conversation)
    },
    [picOptions, resolveLead, staff, familyStaffOf, learningConsultantOf, staffOfPic],
  )
  // Choosing who handles a chat also sets the lead's person in charge, when that person is one.
  const setHandler = useCallback(
    (conversation: ChatwootConversation, person: Sender | null) => {
      void inbox.setOwner(conversation.id, person)
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      if (!lead || !crm.canEditLeads) {
        return
      }
      // After the sale the lead's PIC is the Education Consultant: handing the chat to the Learning Consultant leaves it.
      if (learningConsultantOf(conversation, lead)) {
        return
      }
      // The person's own PIC name (every staff account has one); a teacher without one leaves the PIC as it is.
      const pic = person ? picOfStaff(person.id, picOptions) : undefined
      const picId = person ? (pic?.id ?? lead.picId) : null
      if (picId === lead.picId) {
        return
      }
      void crm.onUpdateLead(lead.id, {
        fullName: lead.fullName ?? '',
        phone: lead.phone ?? '',
        state: lead.state ?? '',
        sourceId: lead.sourceId,
        picId,
        tagIds: lead.tagIds,
        status: lead.status,
        children: lead.children.map((child) => ({ name: child.name, age: child.age, phone: child.phone })),
        notes: lead.notes ?? '',
      })
    },
    [crm, inbox, picOptions, resolveLead, learningConsultantOf],
  )
  // A parent can have two chats: an old one imported under a hidden WhatsApp ID, and the one
  // WhatsApp now uses with their number. Both are tied to the same lead.
  const chatsByLead = useMemo(() => {
    const groups = new Map<number, ChatwootConversation[]>()
    for (const conversation of inbox.conversations) {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      if (lead) {
        groups.set(lead.id, [...(groups.get(lead.id) ?? []), conversation])
      }
    }
    return groups
  }, [inbox.conversations, resolveLead])
  const otherChatsOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      // The same parent's chat on another number is not a duplicate of this one.
      return lead
        ? (chatsByLead.get(lead.id) ?? []).filter(
            (other) => other.id !== conversation.id && other.inbox_id === conversation.inbox_id,
          )
        : []
    },
    [chatsByLead, resolveLead],
  )
  // Everyone the school talks to about the same family: chats that share a lead or a student.
  // Shown in the side panel only; unlike an old duplicate, none of these is hidden from the list.
  const familyChatsOf = useCallback(
    (conversation: ChatwootConversation) => {
      const leadId = leadIdOf(conversation)
      const studentIds = new Set(studentsOf(conversation).map((student) => student.id))
      return inbox.conversations.filter((other) => {
        if (other.id === conversation.id) {
          return false
        }
        if (leadId !== null && leadIdOf(other) === leadId) {
          return true
        }
        return studentIds.size > 0 && studentsOf(other).some((student) => studentIds.has(student.id))
      })
    },
    [inbox.conversations, leadIdOf, studentsOf],
  )
  // An empty chat (made by a click, nobody wrote in it) is never the "newer" chat of a parent.
  const isOlderDuplicate = useCallback(
    (conversation: ChatwootConversation) =>
      otherChatsOf(conversation).some(
        (other) => other.last_activity_at > conversation.last_activity_at && Boolean(other.last_non_activity_message),
      ),
    [otherChatsOf],
  )
  // A chat with no message in it, while another chat of the same parent has some.
  const isEmptyDuplicate = useCallback(
    (conversation: ChatwootConversation) =>
      !conversation.last_non_activity_message &&
      otherChatsOf(conversation).some((other) => Boolean(other.last_non_activity_message)),
    [otherChatsOf],
  )
  // How many open chats belong to a lead with each tag or source, so the menus can show it.
  const optionCounts = useMemo(() => {
    const tags = new Map<number, number>()
    const sources = new Map<number, number>()
    for (const conversation of inbox.conversations) {
      if (conversation.status === 'resolved') {
        continue
      }
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      if (!lead) {
        continue
      }
      if (lead.sourceId !== null) {
        sources.set(lead.sourceId, (sources.get(lead.sourceId) ?? 0) + 1)
      }
      for (const id of lead.tagIds) {
        tags.set(id, (tags.get(id) ?? 0) + 1)
      }
    }
    return { tags, sources }
  }, [inbox.conversations, resolveLead])
  // Every option that is on offer, plus hidden ones that leads still use (a hidden
  // option can still be on many leads, so it must stay filterable).
  const choicesFor = (kind: 'tag' | 'source', counts: Map<number, number>) =>
    crm.leadOptions
      .filter((option) => option.kind === kind && (option.isActive || (counts.get(option.id) ?? 0) > 0))
      .map((option) => ({ id: option.id, label: `${option.label} (${counts.get(option.id) ?? 0})` }))
  const tagOptions = choicesFor('tag', optionCounts.tags)
  const sourceOptions = choicesFor('source', optionCounts.sources)
  // The staff who have taken a chat, with how many, for the staff filter.
  const ownerOptions = useMemo(() => {
    const owners = new Map<number, { label: string; count: number }>()
    for (const conversation of inbox.conversations) {
      const owner = getOwner(conversation)
      if (owner && conversation.status !== 'resolved') {
        owners.set(owner.id, { label: owner.name, count: (owners.get(owner.id)?.count ?? 0) + 1 })
      }
    }
    return [...owners.entries()]
      .map(([id, { label, count }]) => ({ id, label: `${label} (${count})` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [inbox.conversations])
  // What is left unsent in each chat's message box. It lives here, not in the box, so it survives
  // going to another chat or another page.
  const [drafts, setDrafts] = useState<Map<number, Draft>>(new Map())
  const setDraft = useCallback((id: number, draft: Draft | null) => {
    setDrafts((current) => {
      if (!draft && !current.has(id)) {
        return current
      }
      const next = new Map(current)
      if (draft) {
        next.set(id, draft)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])
  // The chat on screen is being written in right now; it counts as a draft once you leave it.
  const draftOf = useCallback(
    (conversation: ChatwootConversation) => {
      const draft = conversation.id === inbox.selectedId ? undefined : drafts.get(conversation.id)
      return draft ? draftPreview(draft) : null
    },
    [drafts, inbox.selectedId],
  )

  const pinnedIds = useMemo(
    () => new Set(inbox.conversations.filter((conversation) => conversation.custom_attributes?.crm_pinned).map((conversation) => conversation.id)),
    [inbox.conversations],
  )
  const leadOfChat = useCallback(
    (conversation: ChatwootConversation) =>
      resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number)),
    [resolveLead],
  )
  // The lead stage on each chat of a lead, from the leads already loaded (no extra read): the school's own stage
  // names and colours. A family whose child has joined (a regular student) shows the student label instead; an HOA
  // family keeps its stage beside the HOA label. A chat with no lead shows nothing.
  const schoolStages = getLeadStages()
  const stageKeyOfChat = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = leadOfChat(conversation)
      if (!lead || lead.status === 'converted' || studentsOf(conversation).some((student) => student.studentType === 'regular')) {
        return null
      }
      return lead.status
    },
    [leadOfChat, studentsOf],
  )
  const stageOfChat = useCallback(
    (conversation: ChatwootConversation) => {
      const key = stageKeyOfChat(conversation)
      if (!key) {
        return null
      }
      const found = schoolStages.find((entry) => entry.key === key)
      // Children whose own stage is not the family's (③'s per-child stages): shown as "+N" beside it.
      const others = otherChildStages(leadOfChat(conversation)?.children ?? [], key)
      return {
        label: found?.label ?? stageLabel(key),
        badge: STAGE_COLORS[found?.color ?? 'slate'].badge,
        more: others.map((entry) => `${entry.name}: ${entry.label}`),
      }
    },
    [stageKeyOfChat, schoolStages, leadOfChat],
  )
  // Follow-ups (automatic or set by hand): the list's small "Overdue" / "Follow up today" tag, and the bar above
  // the open chat with its lead's next one.
  const followUpItems = crm.followUps?.items
  const followUpOf = useCallback(
    (conversation: ChatwootConversation) => {
      if (!followUpItems) return null
      const lead = leadOfChat(conversation)
      const next = lead ? nextFollowUpOf(followUpItems, lead.id, new Date()) : null
      return next && next.state !== 'later' ? next.state : null
    },
    [followUpItems, leadOfChat],
  )
  const selectedLead = inbox.selected ? leadOfChat(inbox.selected) : null
  const selectedFollowUp = followUpItems && selectedLead ? nextFollowUpOf(followUpItems, selectedLead.id, new Date()) : null
  // The stages to filter by: the ones on, and one that is off but some chat's lead still has; never Converted.
  const stageChoices = useMemo(() => {
    const used = new Set(crm.leads.map((lead) => lead.status))
    return schoolStages
      .filter((entry) => entry.key !== 'converted' && (entry.isActive || used.has(entry.key)))
      .map((entry) => ({ key: entry.key, label: entry.label }))
  }, [schoolStages, crm.leads])
  const searching = search.trim() !== ''
  const visible = useMemo(() => {
    const found = filterConversations(
      inbox.conversations,
      { tab, search, tagId, sourceId, matchedIds, kind, stage: stageFilter, ownerId, inboxId: inboxFilter, category },
      leadOfChat,
      studentKindsOf,
      searchNamesOf,
      stageKeyOfChat,
    )
    // While searching, the order is the search's own: people first, then the words said in chats.
    if (searching) {
      return found
    }
    // Pinned chats first, then the ones with a draft, then the rest in their order.
    return draftsFirst(
      draftsFirst(found, (id) => id !== inbox.selectedId && drafts.has(id)),
      (id) => pinnedIds.has(id),
    )
  }, [inbox.conversations, inbox.selectedId, pinnedIds, drafts, tab, search, searching, tagId, sourceId, matchedIds, kind, stageFilter, ownerId, inboxFilter, category, leadOfChat, studentKindsOf, searchNamesOf, stageKeyOfChat])
  // The chats found by name or number while searching; the others were found by the words in their messages.
  const peopleIds = useMemo(
    () =>
      searching
        ? new Set(visible.filter((conversation) => matchesChatIdentity(conversation, search, leadOfChat, searchNamesOf)).map((conversation) => conversation.id))
        : null,
    [searching, visible, search, leadOfChat, searchNamesOf],
  )
  const hasChat = inbox.selected !== null
  // Reactions, edits and deletes of the open chat, and the team's own.
  const messageEvents = useMessageEvents(waActions, client, currentUser, inbox.selectedId, inbox.messages, active)
  const reactionPreviews = useReactionPreviews(active ? (conversation) => waActionsFor(instanceOf(conversation.inbox_id)) : null, visible)
  const showTyping = useTyping(waActions, inbox.selected ? getRealPhone(inbox.selected.meta.sender.phone_number) : null)

  // Ticks every 30 seconds so a chat turns red the moment it passes 30 minutes.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const overdueCount = useMemo(
    () => categoryChats.filter((conversation) => isRecentlyOverdue(conversation, nowSeconds)).length,
    [categoryChats, nowSeconds],
  )

  const quickReplies = useQuickReplies(true)
  // A follow-up template picked on the bar above the chat, for the message box.
  const [quickReplyRequest, setQuickReplyRequest] = useState<{ id: number; reply: QuickReply } | null>(null)
  const sourceRules = useSourceRules(true)
  // Messages the automations want to send; each goes out only when a person approves it.
  // The Student Inbox runs no automations.
  const automation = useAutomationQueue({ enabled: active && !isStudentInbox })
  const [automationOpen, setAutomationOpen] = useState(false)
  const automationWaiting = useMemo(
    () => automation.items.filter((entry) => needsApproval(entry, automation.autoRuleKeys, Date.now())).length,
    [automation.items, automation.autoRuleKeys],
  )
  const contactOf = useCallback(
    (conversationId: number) =>
      inbox.conversations.find((conversation) => conversation.id === conversationId)?.meta.sender.id ?? null,
    [inbox.conversations],
  )
  // WhatsApp pictures (Chatwoot keeps them, see contactPicture.ts): the chat list, the chat's header, the Family card.
  const pictureOf = useCallback(
    (conversation: ChatwootConversation) => contactPictureUrl(conversation.meta.sender.thumbnail, apiUrl),
    [apiUrl],
  )
  const pictureOfContact = useCallback(
    (contactId: number) => {
      const chat = inbox.conversations.find((conversation) => conversation.meta.sender.id === contactId)
      return chat ? pictureOf(chat) : null
    },
    [inbox.conversations, pictureOf],
  )
  const chatOfContact = useCallback(
    (contactId: number) =>
      inbox.conversations.find((conversation) => conversation.meta.sender.id === contactId)?.id ?? null,
    [inbox.conversations],
  )
  // Tells the family table what the team just tied together, then reads it again.
  const tellFamily = useCallback(
    (work: Promise<unknown>) => {
      void work.then(() => refreshPeople()).catch(() => undefined)
    },
    [refreshPeople],
  )
  const setLeadLinkAndFamily = useCallback(
    async (conversationId: number, leadId: number | null) => {
      const conversation = inbox.conversations.find((entry) => entry.id === conversationId)
      // The lead the chat is on now (written on the chat, or found through the lists), for taking it off.
      const wasOn = leadId === null && conversation ? leadIdOf(conversation) : null
      const ok = await inbox.setLeadLink(conversationId, leadId)
      const contact = contactOf(conversationId)
      if (ok && leadId !== null && contact !== null) {
        tellFamily(linkContactToLead(contact, leadId))
      }
      if (ok && wasOn !== null && contact !== null && conversation) {
        // The chat is also tied to the lead in the lead's chats list and the family table; without clearing those the
        // page finds the lead again at once and Unlink does nothing.
        tellFamily(
          unlinkContactFromLead(
            contact,
            wasOn,
            conversation.meta.sender.name ?? null,
            getRealPhone(conversation.meta.sender.phone_number),
          ).then(() => crm.refreshLeadChannels()),
        )
      }
      return ok
    },
    [inbox, contactOf, tellFamily, leadIdOf, crm],
  )
  // A new chat that matches a source rule becomes a lead without anyone pressing "Save lead".
  // Never in the Student Inbox: its chats belong to students' families, not new leads.
  useAutoLeads({
    enabled: active && !isStudentInbox,
    client,
    conversations: inbox.conversations,
    crm,
    rules: sourceRules.rules,
    // The family table is read too: a chat without a number is tied to its lead there, not only on the chat.
    ready:
      !sourceRules.isLoading && !inbox.isLoading && crm.leads.length > 0 && crm.students.length > 0 && people.length > 0,
    hasLead: (conversation) =>
      leadIdOf(conversation) !== null ||
      people.some((person) => person.contactId === conversation.meta.sender.id && person.leadId !== null),
    hasStudents: (conversation) => studentsOf(conversation).length > 0,
    linkLead: setLeadLinkAndFamily,
  })
  // A Messenger / Instagram chat is a lead of its own (no phone), every chat is listed on its lead, and the
  // chats that were here before this existed are caught up once, by whoever has the inbox open.
  useSocialLeads({
    enabled: active && !inbox.isLoading && !isStudentInbox,
    canEdit: crm.canEditLeads,
    conversations: inbox.conversations,
    channels: crm.leadChannels,
    inboxNameOf: (inboxId) =>
      numbersView?.numbers.find((entry) => entry.inboxId === inboxId)?.label ??
      socialInboxNames.get(inboxId) ??
      inboxList.find((entry) => entry.id === inboxId)?.name ??
      null,
    linkLead: (conversationId, leadId) => inbox.setLeadLink(conversationId, leadId),
    leadExists: (leadId) => crm.leads.length === 0 || crm.leads.some((entry) => entry.id === leadId),
    onChanged: crm.refreshLeadChannels,
  })
  // Set while the source rules window is open; phrase starts a new rule from a message.
  const [managingRules, setManagingRules] = useState<{ phrase: string } | null>(null)
  const [managingReplies, setManagingReplies] = useState(false)
  // Rows the quick reply window opens with, when it was started from messages picked in a chat.
  const [quickReplyStart, setQuickReplyStart] = useState<QuickReplyStart | null>(null)
  const [startingChat, setStartingChat] = useState(false)
  // The number and lead a "New chat" window starts with, when it was opened from one.
  const [chatPrefill, setChatPrefill] = useState<{ phone: string; name: string; leadId: number | null } | null>(null)
  // The message being forwarded, while the person picks the chats.
  const [forwarding, setForwarding] = useState<ChatwootMessage[] | null>(null)
  // Chats a person wrote in within Facebook's 24 hours, read from the inbox copy when the forward window opens
  // (null: not known; then only the chat list's own last message decides).
  const [recentInbound, setRecentInbound] = useState<Set<number> | null>(null)
  useEffect(() => {
    if (!forwarding) {
      return
    }
    let cancelled = false
    setRecentInbound(null)
    fetchRecentInboundChats(SOCIAL_WINDOW_SECONDS)
      .then((ids) => {
        if (!cancelled) {
          setRecentInbound(ids)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [forwarding])

  // Another page asked for the chat of a number: open the one this page has, else look
  // for it on the server, and only when there is none offer to start one.
  const handledRequest = useRef<number | null>(null)
  // Words the other page wants in the chat's message box (e.g. a new app login), written once
  // that chat is open: the chat it found, else the next chat opened in the next half minute.
  const [pendingMessage, setPendingMessage] = useState<
    { text: string; chatId: number | null; after: number | null; at: number } | null
  >(null)
  const openChatId = inbox.selected?.id ?? null
  const openChatRef = useRef(openChatId)
  useEffect(() => {
    openChatRef.current = openChatId
  })
  useEffect(() => {
    if (!pendingMessage || openChatId === null) return
    const fits =
      pendingMessage.chatId !== null
        ? openChatId === pendingMessage.chatId
        : openChatId !== pendingMessage.after && Date.now() - pendingMessage.at < 30_000
    if (!fits) return
    setPendingMessage(null)
    setDraftRequest((current) => ({ id: (current?.id ?? 0) + 1, text: pendingMessage.text }))
  }, [openChatId, pendingMessage])
  // The Unread tab shows every unread chat: the older pages are fetched by themselves, so there is no
  // "Load older chats" to press before everything unread is on screen.
  const { loadMore: loadMoreChats } = inbox
  const hasMoreOpenChats = inbox.canLoadMore.open
  const fillingUnread = useRef(false)
  const [unreadRound, setUnreadRound] = useState(0)
  useEffect(() => {
    if (tab !== 'unread' || !hasMoreOpenChats || inbox.isLoading || fillingUnread.current || unreadRound >= 60) {
      return
    }
    fillingUnread.current = true
    void loadMoreChats('open')
      .catch(() => undefined)
      .finally(() => {
        fillingUnread.current = false
        setUnreadRound((round) => round + 1)
      })
  }, [tab, hasMoreOpenChats, inbox.isLoading, unreadRound, loadMoreChats])
  useEffect(() => {
    if (tab !== 'unread') {
      setUnreadRound(0)
    }
  }, [tab])
  const {
    conversations: loadedChats,
    isLoading: isLoadingChats,
    setSelectedId,
    startNewChat,
  } = inbox
  const askedForChat = useRef(new Set<number>())
  useEffect(() => {
    if (!openRequest || !active || isLoadingChats || handledRequest.current === openRequest.id) {
      return
    }
    const message = openRequest.message?.trim() ? openRequest.message : null
    const queueMessage = (chatId: number | null) => {
      if (message) setPendingMessage({ text: message, chatId, after: openChatRef.current, at: Date.now() })
    }
    // A Messenger / Instagram chat is asked for by its chat or contact: there is no number to look for.
    const wanted = openRequest.chat
    if (wanted) {
      const chat =
        loadedChats.find((entry) => wanted.conversationId !== null && entry.id === wanted.conversationId) ??
        loadedChats.find((entry) => wanted.contactId !== null && entry.meta.sender.id === wanted.contactId) ??
        null
      if (!chat) {
        // Not on the list yet (an older chat): fetch it once; this runs again when it arrives.
        if (wanted.conversationId !== null && !askedForChat.current.has(openRequest.id)) {
          askedForChat.current.add(openRequest.id)
          void loadMissingConversations([wanted.conversationId])
          return
        }
        // Only the contact is known: ask which chats it has and fetch the newest once.
        if (wanted.conversationId === null && wanted.contactId !== null && !askedForChat.current.has(openRequest.id)) {
          askedForChat.current.add(openRequest.id)
          const contactId = wanted.contactId
          void client
            .listContactConversations(contactId)
            .then((found) => {
              const newest = [...found].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id)[0]
              if (newest) return loadMissingConversations([newest.id])
            })
            .catch(() => undefined)
          return
        }
        handledRequest.current = openRequest.id
        return
      }
      handledRequest.current = openRequest.id
      queueMessage(chat.id)
      categoryDecided.current = true
      setCategory(categoryOf(chat))
      setInboxFilter(null)
      setSearch('')
      setTagId(null)
      setSourceId(null)
      setKind(null)
      setStageFilter(null)
      setOwnerId(null)
      setDetailsOpen(false)
      setTab(getTab(chat))
      setSelectedId(chat.id)
      return
    }
    handledRequest.current = openRequest.id
    const show = (conversation: ChatwootConversation | null) => {
      categoryDecided.current = true
      // A number can also find a Messenger / Instagram chat tied to that person: show its own list.
      setCategory(conversation ? categoryOf(conversation) : 'whatsapp')
      setSearch('')
      setTagId(null)
      setSourceId(null)
      setKind(null)
      setStageFilter(null)
      setOwnerId(null)
      setDetailsOpen(false)
      if (conversation) {
        setTab(getTab(conversation))
        setSelectedId(conversation.id)
      }
    }
    // Also a chat whose number WhatsApp hides, when it is tied to a lead or student with this number.
    const here = openRequest.ownNumberOnly
      ? findOwnChatForNumber({ conversations: loadedChats, phone: openRequest.phone, students: crm.students })
      : findChatForNumber({
          conversations: loadedChats,
          phone: openRequest.phone,
          leadId: openRequest.leadId,
          leads: crm.leads,
          students: crm.students,
        })
    if (here) {
      queueMessage(here.id)
      show(here)
      return
    }
    queueMessage(null)
    void (async () => {
      const found = await findChatByPhone(client, openRequest.phone).catch(() => null)
      if (found !== null) {
        const result = await startNewChat({ phone: openRequest.phone, name: openRequest.name ?? '' })
        if (result.error === null) {
          show(null)
          setTab('chats')
          return
        }
      }
      show(null)
      setChatPrefill({ phone: openRequest.phone, name: openRequest.name ?? '', leadId: openRequest.leadId })
      setStartingChat(true)
    })()
  }, [
    openRequest,
    active,
    isLoadingChats,
    loadedChats,
    client,
    setSelectedId,
    startNewChat,
    loadMissingConversations,
    crm.leads,
    crm.students,
  ])

  // Someone who writes "我是学生" is the student themself: set it when the chat is open, once.
  useAutoChatRole({
    active,
    selected: inbox.selected,
    messages: inbox.messages,
    messagesChat: inbox.messagesChat,
    setChatRole: inbox.setChatRole,
  })

  // The WhatsApp numbers this person can pick from: the active ones they are given (an admin: all).
  const numberChoices = useMemo(() => {
    if (!numbersView) {
      return []
    }
    const allowed = numbersView.allowedInboxIds
    return numbersView.numbers
      .filter((entry) => entry.isActive && (allowed === null || allowed === undefined || allowed.includes(entry.inboxId)))
      // Each inbox writes from its own numbers only.
      .filter((entry) => entry.zone === zone)
      .map((entry) => {
        const look = channelLabels.labels.get(String(entry.inboxId))
        return {
          inboxId: entry.inboxId,
          label: entry.label,
          // The button says the short name, else the number's last 4 digits; the full name and number on a long look.
          short: shortLabelOf(look, entry.phone, entry.label),
          title: fullLabelOf(entry.label, entry.phone),
          color: look?.color ?? null,
          problem: (() => {
            const alert = numbersView.problems?.get(entry.inboxId)
            return alert ? problemLabel(alert.problem) : null
          })(),
        }
      })
  }, [numbersView, channelLabels.labels, zone])
  // The number a chat is on (its short name and colour); shown only when there is more than one to tell apart.
  const numberLabelOf = useCallback(
    (conversation: ChatwootConversation) => {
      if (numberChoices.length <= 1) {
        return null
      }
      const choice = numberChoices.find((entry) => entry.inboxId === conversation.inbox_id)
      return choice ? { label: choice.short, color: choice.color, title: choice.title } : null
    },
    [numberChoices],
  )
  // Messenger and Instagram have no list of numbers; the inboxes their chats are in are the choices.
  useEffect(() => {
    if (askedInboxNames.current) {
      return
    }
    askedInboxNames.current = true
    client
      .listInboxes()
      .then((list) => {
        setSocialInboxNames(new Map(list.map((entry) => [entry.id, entry.name])))
        setInboxList(list.map((entry) => ({ id: entry.id, name: entry.name, phone: entry.phone })))
        setInboxPageIds(
          new Map(list.flatMap((entry) => (entry.pageId ? [[entry.id, entry.pageId] as [number, string]] : []))),
        )
      })
      .catch(() => undefined)
  }, [category, client])
  // The channel a chat came through: WhatsApp, or a Messenger Page / Instagram account with its picture (the one an
  // admin uploaded, else the Page's own from Facebook). The bridge notes the Facebook Page's id on each contact, so a
  // chat knows its own Page even when an inbox holds the chats of more than one. A chat without a Page id is taken
  // to be on the Page most of its inbox's chats are on.
  const pages = useMemo(() => {
    const counts = new Map<number, Map<string, number>>()
    const names = new Map<string, string>()
    for (const conversation of inbox.conversations) {
      const attributes = conversation.meta.sender.additional_attributes
      const pageId = attributes?.ghl_page_id
      if (conversation.inbox_id === undefined || typeof pageId !== 'string' || !pageId) {
        continue
      }
      const inboxCounts = counts.get(conversation.inbox_id) ?? new Map<string, number>()
      inboxCounts.set(pageId, (inboxCounts.get(pageId) ?? 0) + 1)
      counts.set(conversation.inbox_id, inboxCounts)
      const name = attributes?.ghl_page_name
      if (typeof name === 'string' && name && !names.has(pageId)) {
        names.set(pageId, name)
      }
    }
    // The Page an inbox stands for: the one that has the inbox's own name, else the one most of its chats are on.
    const main = new Map<number, string>()
    for (const [inboxId, inboxCounts] of counts) {
      const pageId = mainPageOf(inboxCounts, names, socialInboxNames.get(inboxId))
      if (pageId) {
        main.set(inboxId, pageId)
      }
    }
    return { main, names }
  }, [inbox.conversations, socialInboxNames])
  const pageIdOf = useCallback(
    (conversation: ChatwootConversation) => {
      const noted = conversation.meta.sender.additional_attributes?.ghl_page_id
      if (typeof noted === 'string' && noted) {
        return noted
      }
      const inboxId = conversation.inbox_id
      return inboxId === undefined ? null : (pages.main.get(inboxId) ?? inboxPageIds.get(inboxId) ?? null)
    },
    [pages, inboxPageIds],
  )
  const channelKeyFor = useCallback(
    (conversation: ChatwootConversation) => {
      const pageId = pageIdOf(conversation)
      return pageId ? `page:${pageId}` : channelKeyOf(conversation.inbox_id)
    },
    [pageIdOf],
  )
  // What a Page looks like in the list: its name, and its picture (uploaded, else fetched from Facebook).
  const pageInfo = useCallback(
    (kind: 'messenger' | 'instagram', pageId: string | null, inboxId: number | undefined): ChannelInfo => {
      const inboxName = inboxId === undefined ? null : (socialInboxNames.get(inboxId) ?? null)
      return {
        kind,
        name: (pageId ? pages.names.get(pageId) : null) ?? inboxName,
        avatar:
          (pageId ? channelAvatars.avatars.get(`page:${pageId}`) : undefined) ??
          channelAvatars.avatars.get(channelKeyOf(inboxId)) ??
          (pageId ? facebookPictureUrl(pageId) : null),
        color:
          ((pageId ? channelLabels.labels.get(`page:${pageId}`) : undefined) ?? channelLabels.labels.get(channelKeyOf(inboxId)))?.color ??
          null,
      }
    },
    [channelAvatars.avatars, channelLabels.labels, pages, socialInboxNames],
  )
  // Where a reply in a chat goes out from: the WhatsApp number (its name and phone), or the Messenger / Instagram Page.
  const sendingFromOf = useCallback(
    (conversation: ChatwootConversation): string | null => {
      const social = socialKindOf(conversation.meta.channel, conversation.meta.sender)
      if (social) {
        const name = pageInfo(social, pageIdOf(conversation), conversation.inbox_id).name
        return `${social === 'instagram' ? 'Instagram' : 'Messenger'}${name ? `: ${name}` : ''}`
      }
      const number = numbersView?.numbers.find((entry) => entry.inboxId === conversation.inbox_id)
      const known = inboxList.find((entry) => entry.id === conversation.inbox_id)
      const label = number?.label ?? known?.name ?? null
      const phone = (number?.phone ?? known?.phone ?? '').replace(/\D/g, '')
      return [label, phone ? formatPhone(phone) : null].filter(Boolean).join(' · ') || 'WhatsApp'
    },
    [numbersView, inboxList, pageInfo, pageIdOf],
  )
  // "Sending from" with the number's / Page's short name and colour when it has them (the full name on a long look).
  const sendingLookOf = useCallback(
    (conversation: ChatwootConversation) => {
      const full = sendingFromOf(conversation) ?? 'WhatsApp'
      const social = socialKindOf(conversation.meta.channel, conversation.meta.sender)
      const pageId = social ? pageIdOf(conversation) : null
      const look =
        (pageId ? channelLabels.labels.get(`page:${pageId}`) : undefined) ?? channelLabels.labels.get(channelKeyOf(conversation.inbox_id))
      const short = look?.shortName?.trim()
      const label = short ? (social ? `${social === 'instagram' ? 'Instagram' : 'Messenger'}: ${short}` : short) : full
      return { label, color: look?.color ?? null, title: full }
    },
    [sendingFromOf, pageIdOf, channelLabels.labels],
  )
  const channelOf = useCallback(
    (conversation: ChatwootConversation): ChannelInfo | null => {
      const social = socialKindOf(conversation.meta.channel, conversation.meta.sender)
      if (!social) {
        const number = numberChoices.find((entry) => entry.inboxId === conversation.inbox_id)
        return { kind: 'whatsapp', name: number?.label ?? null, avatar: null, color: number?.color ?? null }
      }
      return pageInfo(social, pageIdOf(conversation), conversation.inbox_id)
    },
    [pageInfo, pageIdOf, numberChoices],
  )
  const channelRows = useMemo<ChannelPictureRow[]>(() => {
    const rows = new Map<string, ChannelPictureRow>()
    for (const conversation of inbox.conversations) {
      const social = socialKindOf(conversation.meta.channel, conversation.meta.sender)
      if (!social) {
        continue
      }
      const key = channelKeyFor(conversation)
      if (rows.has(key)) {
        continue
      }
      const info = channelOf(conversation)
      const uploaded = channelAvatars.avatars.get(key) ?? null
      rows.set(key, {
        key,
        kind: social,
        name: info?.name ?? `${social === 'instagram' ? 'Instagram' : 'Messenger'} ${rows.size + 1}`,
        auto: uploaded ? null : (info?.avatar ?? null),
        uploaded,
      })
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [inbox.conversations, channelAvatars.avatars, channelKeyFor, channelOf])
  const channelChoices = useMemo(() => {
    // The icon of a channel is the one its chats show (the Page's picture, or the channel's logo).
    const infoOf = (inboxId: number, label: string, color: string | null = null): ChannelInfo => {
      if (category === 'whatsapp') {
        return { kind: 'whatsapp', name: label, avatar: null, color }
      }
      // An inbox stands for the Page most of its chats are on.
      const info = pageInfo(category, pages.main.get(inboxId) ?? inboxPageIds.get(inboxId) ?? null, inboxId)
      return { kind: category, name: label, avatar: info.avatar, color: info.color }
    }
    if (category === 'whatsapp') {
      return numberChoices.map((choice) => ({ ...choice, info: infoOf(choice.inboxId, choice.label, choice.color) }))
    }
    const ids = [...new Set(categoryChats.map((conversation) => conversation.inbox_id))]
      .filter((id): id is number => id !== undefined)
      .sort((a, b) => a - b)
    const word = category === 'instagram' ? 'Instagram' : 'Messenger'
    return ids.map((id, index) => {
      const label = socialInboxNames.get(id) ?? `${word} ${index + 1}`
      const pageId = pages.main.get(id) ?? inboxPageIds.get(id) ?? null
      const look = (pageId ? channelLabels.labels.get(`page:${pageId}`) : undefined) ?? channelLabels.labels.get(channelKeyOf(id))
      return { inboxId: id, label, short: shortLabelOf(look, null, label), title: label, info: infoOf(id, label) }
    })
  }, [category, numberChoices, categoryChats, socialInboxNames, pageInfo, pages, inboxPageIds, channelLabels.labels])
  const changeCategory = useCallback(
    (next: InboxCategory) => {
      categoryDecided.current = true
      setCategory(next)
      setInboxFilter(null)
      // A chat of the other part is not left open beside a list that does not show it.
      if (inbox.selected && categoryOf(inbox.selected) !== next) {
        inbox.setSelectedId(null)
      }
    },
    [inbox],
  )
  // "Sending from" above the reply box lists the family's other chats (another number, Messenger, Instagram, a
  // child's own number); picking one opens it, so the reply goes out from there.
  const leadChannelsByLead = useMemo(() => channelsByLead(crm.leadChannels), [crm.leadChannels])
  const chatChoices = useMemo<ChatSwitchOption[]>(() => {
    const current = inbox.selected
    if (!current || isGroupChat(current.meta.sender)) {
      return []
    }
    const leadId = leadIdOf(current) ?? leadOfContact.get(current.meta.sender.id) ?? null
    if (leadId === null) {
      return []
    }
    const rows = leadChannelsByLead.get(leadId) ?? []
    const contacts = new Set(rows.map((row) => row.contactId))
    const family = inbox.conversations.filter(
      (conversation) =>
        conversation.id !== current.id &&
        !isGroupChat(conversation.meta.sender) &&
        (contacts.has(conversation.meta.sender.id) || leadIdOf(conversation) === leadId),
    )
    const studentName = new Map(crm.students.map((student) => [student.id, student.name]))
    const accountOfRow = (row: LeadChannel) => {
      if (row.channel !== 'whatsapp') {
        const place = placeOf(row)
        return `${CHANNEL_LABEL[row.channel]}${place ? `: ${place}` : ''}`
      }
      const number = numbersView?.numbers.find((entry) => entry.inboxId === row.inboxId)
      const phone = (number?.phone ?? '').replace(/\D/g, '')
      return [number?.label ?? placeOf(row), phone ? formatPhone(phone) : null].filter(Boolean).join(' · ') || 'WhatsApp'
    }
    const colorOf = (inboxId: number | undefined) => channelLabels.labels.get(channelKeyOf(inboxId))?.color ?? null
    return chatSwitchOptions({
      rows,
      conversations: family,
      current,
      kindOf: categoryOf,
      accountOfChat: (conversation) => sendingFromOf(conversation) ?? 'WhatsApp',
      accountOfRow,
      childNamesOf: (conversation) =>
        getLinkedStudentIds(conversation)
          .map((id) => studentName.get(id))
          .filter((name): name is string => Boolean(name)),
      allowedInboxIds,
    })
      // A chat of the other inbox (Marketing / Student Inbox) is not switched to from here.
      .filter((option) => option.inboxId === undefined || !excludedInboxIds.includes(option.inboxId))
      .map((option) => ({ ...option, color: colorOf(option.inboxId) }))
  }, [inbox.selected, inbox.conversations, leadIdOf, leadOfContact, leadChannelsByLead, crm.students, numbersView, sendingFromOf, allowedInboxIds, excludedInboxIds, channelLabels.labels])

  // The chat picked there: opened at once when it is on the list, otherwise fetched first (an older chat).
  const [switchRequest, setSwitchRequest] = useState<{ option: ChatSwitchOption; fetched: boolean } | null>(null)
  useEffect(() => {
    if (!switchRequest) {
      return
    }
    const { option } = switchRequest
    const chat =
      option.conversationId !== null
        ? loadedChats.find((entry) => entry.id === option.conversationId)
        : loadedChats
            .filter((entry) => entry.meta.sender.id === option.contactId)
            .sort((a, b) => b.last_activity_at - a.last_activity_at)[0]
    if (chat) {
      setSwitchRequest(null)
      categoryDecided.current = true
      setCategory(categoryOf(chat))
      setInboxFilter(null)
      setTab(getTab(chat))
      setSelectedId(chat.id)
      return
    }
    if (switchRequest.fetched) {
      return
    }
    setSwitchRequest({ option, fetched: true })
    const fetched =
      option.conversationId !== null
        ? loadMissingConversations([option.conversationId])
        : client.listContactConversations(option.contactId).then((found) => {
            const newest = [...found].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id)[0]
            if (newest) return loadMissingConversations([newest.id])
          })
    // A chat that cannot be fetched is let go, so it does not open by surprise later.
    void Promise.resolve(fetched)
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => setSwitchRequest((now) => (now?.option === option ? null : now)), 8000))
  }, [switchRequest, loadedChats, setSelectedId, loadMissingConversations, client])

  const openNumbers = useCallback(() => {
    setManagingNumbers(true)
    client
      .listInboxes()
      .then((list) => setInboxList(list.map((entry) => ({ id: entry.id, name: entry.name }))))
      .catch(() => setInboxList([]))
  }, [client])

  const forwardTargets = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    return inbox.conversations.map((conversation) => {
      const identity = getChatIdentity(conversation.meta.sender, chatLabelOf(conversation), conversation.meta.channel)
      const social = socialKindOf(conversation.meta.channel, conversation.meta.sender)
      // Facebook / Instagram: only within 24 hours of the person's last message. Their last message in the list
      // tells when it is the newest one; otherwise the copy's list of chats written in lately.
      const last = conversation.last_non_activity_message
      const wroteLately =
        (last?.message_type === 0 && nowSeconds - last.created_at < SOCIAL_WINDOW_SECONDS) ||
        recentInbound === null ||
        recentInbound.has(conversation.id)
      return {
        id: conversation.id,
        title: identity.title,
        subtitle: identity.subtitle,
        lastActivity: conversation.last_activity_at,
        channel: social === 'instagram' ? 'Instagram' : social === 'messenger' ? 'Messenger' : undefined,
        blocked: social && !wroteLately ? SOCIAL_WINDOW_REASON : null,
      }
    })
  }, [inbox.conversations, chatLabelOf, recentInbound])

  // Sends a copy of the messages (each one's text, then its files, oldest first) to every chat chosen.
  // Null when all went out; otherwise which chats did not get it, and why (the others did).
  async function forwardMessages(messages: ChatwootMessage[], targetIds: number[]) {
    try {
      const parts: ReturnType<typeof splitSequence> = []
      for (const message of messages) {
        const files = await Promise.all(
          (message.attachments ?? []).map(async (attachment) => {
            const response = await fetch(ownMediaUrl(attachment.data_url, apiUrl))
            if (!response.ok) {
              throw new Error('file')
            }
            const blob = await response.blob()
            const name = decodeURIComponent(attachment.data_url.split('?')[0].split('/').pop() ?? 'file')
            return new File([blob], name, { type: blob.type })
          }),
        )
        const tooBig = files.map((file) => fileProblem(file)).find((problem) => problem !== null)
        if (tooBig) {
          return tooBig
        }
        parts.push(...splitSequence([(message.content ?? '').trim(), ...files]))
      }
      // One part at a time: the next only goes once WhatsApp has accepted the one before, so a file
      // is never overtaken by the text that follows it. A chat that refuses does not stop the others.
      const failures = await forwardToEach(
        targetIds,
        parts,
        (targetId, part) =>
          client.sendMessage(targetId, { content: part.content, isPrivate: false, files: part.files, sender: currentUser }),
        inbox.waitUntilSent,
      )
      if (failures.length === 0) {
        return null
      }
      const nameOf = (id: number) => forwardTargets.find((target) => target.id === id)?.title ?? 'A chat'
      const sent = targetIds.length - failures.length
      return {
        message: [
          sent > 0 ? `Sent to ${sent} of ${targetIds.length} chats. Not sent to:` : 'Not sent:',
          ...failures.map((failure) => `• ${nameOf(failure.targetId)}: ${failure.reason}`),
        ].join('\n'),
        failedIds: failures.map((failure) => failure.targetId),
      }
    } catch {
      return "A file of the message couldn't be downloaded to send it on. Nothing was sent."
    }
  }
  // Opens a new personal quick reply made of the messages: each one's text, then its photos, videos and PDFs.
  async function startQuickReplyFrom(messages: ChatwootMessage[]) {
    setQuickReplyStart(
      await quickReplyStartFrom(messages, async (url) => {
        const response = await fetch(ownMediaUrl(url, apiUrl))
        if (!response.ok) {
          throw new Error('file')
        }
        return response.blob()
      }),
    )
    setManagingReplies(true)
  }
  // Sends an approved automation message to the parent's chat: the chat the school already has for
  // the number (also one whose number WhatsApp hides), else the one the server has, else a new one.
  // Resolves to an error message, or null once WhatsApp has accepted the message.
  async function sendQueued(entry: QueueItem, message: string) {
    // A Messenger / Instagram message names its chat; a WhatsApp one is found by its number.
    const known =
      entry.conversationId !== null
        ? (inbox.conversations.find((chat) => chat.id === entry.conversationId) ?? null)
        : findChatForNumber({
            conversations: inbox.conversations,
            phone: entry.phone ?? '',
            leadId: entry.leadId,
            leads: crm.leads,
            students: crm.students,
          })
    let conversationId = known?.id ?? entry.conversationId
    if (known && known.status === 'resolved') {
      await inbox.setStatus(known.id, 'open')
    }
    if (conversationId === null) {
      const started = await startChat(client, { phone: entry.phone ?? '', name: entry.parentName ?? '' })
      if (started.error !== null) {
        return started.error
      }
      conversationId = started.conversationId
    }
    // The picture of the message (if it has one) goes with the text as its caption.
    const files: File[] = []
    if (entry.mediaUrl) {
      try {
        const response = await fetch(entry.mediaUrl)
        if (!response.ok) {
          throw new Error('picture')
        }
        const blob = await response.blob()
        const name = decodeURIComponent(entry.mediaUrl.split('/').pop() ?? 'picture').split('?')[0] || 'picture'
        files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }))
      } catch {
        return "Couldn't load the picture of this message. Check your connection and try again."
      }
    }
    try {
      const sent = await client.sendMessage(conversationId, {
        content: message,
        isPrivate: false,
        files,
        sender: currentUser,
      })
      await inbox.waitUntilSent(conversationId, sent.id)
      return null
    } catch {
      return "WhatsApp didn't accept the message. Check the chat before trying again."
    }
  }
  // What the AI reply suggestion may know: every child's first name and age and who is writing. Phone
  // numbers and the parent's name are never given to it. Null (feature off) for people who cannot edit leads.
  const aiContext = useMemo(() => {
    // No reply suggestion in a group: it is not one parent, and every message would cost an AI call.
    // WhatsApp, Messenger and Instagram chats all get one.
    if (!inbox.selected || !crm.canEditLeads || isGroupChat(inbox.selected.meta.sender)) {
      return null
    }
    const sender = inbox.selected.meta.sender
    const { lead } = resolveChatLead(getLinkedLeadId(inbox.selected), getRealPhone(sender.phone_number), crm.leads)
    return {
      children: (lead?.children ?? []).map((child) => ({
        name: child.name?.trim() ? child.name.trim().split(/\s+/)[0] : null,
        age: typeof child.age === 'number' && child.age > 0 ? child.age : null,
      })),
      teamName: currentUser.name || null,
      // Only the classes that really are on the calendar now; the notes' own times may be out of date.
      openClasses: hoaSlotLinesForAi(
        crm.listHoaSlots(),
        (lead?.children ?? []).map((child) => (typeof child.age === 'number' && child.age > 0 ? child.age : null)),
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.selected, crm.canEditLeads, crm.leads, crm.trialBookings, currentUser.name])
  // What {parent name}, {child name} and the like become in the open chat.
  const quickReplyFill = useMemo(() => {
    if (!inbox.selected) {
      return {}
    }
    const sender = inbox.selected.meta.sender
    const { lead } = resolveChatLead(getLinkedLeadId(inbox.selected), getRealPhone(sender.phone_number), crm.leads)
    return quickReplyValues({
      lead,
      chatName: '',
      trialDate: lead ? crm.trialDateFor(lead.id) : null,
      myName: currentUser.name,
    })
  }, [inbox.selected, crm, currentUser.name])

  // "+" > Automation: a message or a flow for this chat's person at a chosen time, and what is scheduled.
  const chatSchedules = useChatSchedules(inbox.selected?.id ?? null)
  const [scheduling, setScheduling] = useState<{ editing: ChatSchedule | null } | null>(null)
  // "+" > Start automation: a flow started for this chat now.
  const [startingFlow, setStartingFlow] = useState(false)
  // "+" > From Galleries: a school file attached to this chat's message.
  const [pickingGallery, setPickingGallery] = useState(false)
  const scheduleTarget: ScheduleTarget | null = inbox.selected
    ? {
        conversationId: inbox.selected.id,
        contactId: inbox.selected.meta.sender.id ?? null,
        inboxId: inbox.selected.inbox_id ?? null,
        channel: categoryOf(inbox.selected),
        phone: getRealPhone(inbox.selected.meta.sender.phone_number),
        leadId: leadIdOf(inbox.selected),
        parentName: chatLabelOf(inbox.selected) || inbox.selected.meta.sender.name || null,
      }
    : null
  async function cancelScheduled(schedule: ChatSchedule) {
    try {
      await cancelSchedule(schedule.id)
    } catch (failure) {
      window.alert(scheduleError(failure, "Couldn't cancel it. Try again."))
    }
    chatSchedules.reload()
  }

  // Stickers: a chat's files are reached through the school's own inbox address; an admin manages the library.
  const stickerSource = useMemo(
    () => ({ mediaUrl: (url: string) => ownMediaUrl(url, apiUrl), canManage: numbersView?.isAdmin ?? false }),
    [apiUrl, numbersView?.isAdmin],
  )

  // On a computer the Inbox reaches down to the bottom of the window, whatever its height.
  const inboxBox = useRef<HTMLDivElement>(null)
  const inboxHeight = useFillToBottom(inboxBox)
  // The two lines between the columns can be dragged; the widths are kept on this browser.
  const columns = useInboxColumns(inboxBox, Boolean(inbox.selected))

  return (
    <StickerSourceContext.Provider value={stickerSource}>
    <div>
    {/* The Student Inbox is WhatsApp only: no channel buttons. */}
    <div role="group" aria-label="Channel" className={cn('mb-3 flex flex-wrap gap-2', hasChat && 'max-lg:hidden', isStudentInbox && 'hidden')}>
      {CATEGORY_BUTTONS.map(({ key, label, icon: ChannelIcon, color }) => {
        const selected = category === key
        const unread = categoryUnread[key]
        return (
          <button
            key={key}
            type="button"
            onClick={() => changeCategory(key)}
            aria-pressed={selected}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-semibold transition sm:gap-2 sm:px-3.5 sm:text-sm',
              selected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <ChannelIcon size={20} weight="fill" color={selected ? '#ffffff' : color} aria-hidden="true" />
            {label}
            {unread > 0 && (
              <span
                title="Chats nobody has opened yet"
                className="min-w-5 rounded-full bg-[#fc0c97] px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
    <div
      ref={inboxBox}
      style={inboxHeight ? { ...columns.style, height: inboxHeight } : columns.style}
      className={cn(
        // The channel switch above the box takes 52px (40 + the gap), which the box gives back.
        'relative grid h-[calc(100dvh-314px)] min-h-[520px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-[calc(100dvh-234px)] lg:grid-cols-[var(--inbox-list)_minmax(0,1fr)] xl:grid-cols-[var(--inbox-list)_minmax(0,1fr)_var(--inbox-details)]',
        // On a phone an open chat takes the whole screen, above the page title and
        // tools, and stops just above the bottom menu.
        hasChat && 'max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-[5.7rem] max-lg:z-30 max-lg:h-auto max-lg:min-h-0 max-lg:rounded-none max-lg:border-0',
      )}
    >
      <ColumnHandle handle={columns.list} className="left-[var(--inbox-list)] lg:block" />
      {columns.withDetails && <ColumnHandle handle={columns.details} className="left-[calc(100%-var(--inbox-details))] xl:block" />}
      <ConversationList
        pictureOf={pictureOf}
        className={cn(hasChat && 'hidden lg:flex')}
        conversations={visible}
        counts={counts}
        hasMoreOpen={inbox.canLoadMore.open}
        tab={tab}
        search={search}
        tagId={tagId}
        sourceId={sourceId}
        tags={tagOptions}
        sources={sourceOptions}
        snippets={messageHits}
        peopleIds={peopleIds}
        matchOf={searching ? (conversation) => chatIdentityMatch(conversation, search, leadOfChat, searchNamesOf) : undefined}
        leadNameOf={chatTitleLabelOf}
        draftOf={draftOf}
        reactionPreviews={reactionPreviews}
        studentLabelsOf={studentLabelsOf}
        stageOf={stageOfChat}
        followUpOf={followUpOf}
        isOlderDuplicate={isOlderDuplicate}
        isEmptyDuplicate={isEmptyDuplicate}
        isStudentSelf={(conversation) => getChatRole(conversation) === 'student'}
        tagsOf={tagsOf}
        picOf={picOf}
        kind={kind}
        kindChoices={studentGroupChoices}
        onKind={setKind}
        stage={stageFilter}
        stages={stageChoices}
        onStage={setStageFilter}
        ownerId={ownerId}
        owners={ownerOptions}
        onOwner={setOwnerId}
        selectedId={inbox.selectedId}
        nowSeconds={nowSeconds}
        overdueCount={overdueCount}
        isLoading={inbox.isLoading}
        loadError={inbox.loadError}
        canLoadMore={tab === 'done' ? inbox.canLoadMore.resolved : inbox.canLoadMore.open}
        isLoadingMore={tab === 'done' ? inbox.isLoadingMore.resolved : inbox.isLoadingMore.open}
        onTab={setTab}
        onTag={setTagId}
        onSource={setSourceId}
        onSearch={setSearch}
        onSelect={(id) => {
          setDetailsOpen(false)
          // A chat found by its words opens on the message that matched.
          const found = search.trim().length >= 2 ? messageSearch.messageIds.get(id) : undefined
          if (found !== undefined) {
            inbox.openAt(id, found)
          } else {
            inbox.setSelectedId(id)
          }
        }}
        onLoadMore={() => void inbox.loadMore(tab === 'done' ? 'resolved' : 'open')}
        onNewChat={() => setStartingChat(true)}
        automationCount={automationWaiting}
        onOpenAutomations={isStudentInbox ? undefined : () => setAutomationOpen(true)}
        category={category}
        allChannelsLabel={category === 'whatsapp' ? 'All numbers' : category === 'instagram' ? 'All Instagram accounts' : 'All Messenger pages'}
        numberOf={numberLabelOf}
        inboxId={inboxFilter}
        numberChoices={channelChoices}
        onInbox={setInboxFilter}
        onManageNumbers={numbersView?.isAdmin ? openNumbers : undefined}
        channelOf={channelOf}
        onManageChannels={numbersView?.isAdmin ? () => setManagingChannels(true) : undefined}
      />

      {inbox.selected ? (
        <>
          <ChatPanel
            followUpBar={selectedFollowUp && crm.followUps ? (
              <FollowUpChatBar
                key={selectedFollowUp.item.id}
                item={selectedFollowUp.item}
                stepLabel={selectedFollowUp.stepLabel}
                state={selectedFollowUp.state}
                handlerName={handlerOf(inbox.selected)?.name ?? null}
                onDone={() => crm.followUps!.done(selectedFollowUp.item.id)}
                onChangeDate={(date) => crm.followUps!.save({ ...draftOfItem(selectedFollowUp.item), date }, selectedFollowUp.item)}
                templates={quickReplies.replies.filter(
                  (reply) => reply.isActive && reply.followupStep != null && reply.followupStep === (selectedFollowUp.item.followupStep ?? 1),
                )}
                onUseTemplate={(reply) => setQuickReplyRequest((current) => ({ id: (current?.id ?? 0) + 1, reply }))}
              />
            ) : undefined}
            picture={pictureOf(inbox.selected)}
            className={cn(!hasChat && 'hidden lg:flex', detailsOpen && 'hidden xl:flex')}
            conversation={inbox.selected}
            focusMessageId={inbox.focusMessageId}
            onFocused={inbox.clearFocus}
            leadName={chatTitleLabelOf(inbox.selected)}
            onOpenLead={
              leadIdOf(inbox.selected) !== null ? () => crm.onOpenLead(leadIdOf(inbox.selected!)!) : undefined
            }
            messages={inbox.messages}
            waitingMessages={inbox.waitingMessages}
            hasOlder={inbox.hasOlder}
            staff={staff}
            handledBy={handlerOf(inbox.selected)}
            actionError={inbox.actionError ?? messageEvents.error}
            onBack={() => {
              setDetailsOpen(false)
              inbox.setSelectedId(null)
            }}
            onOpenDetails={() => setDetailsOpen(true)}
            onLoadOlder={() => void inbox.loadOlder()}
            onSend={inbox.send}
            onDismissUnsent={inbox.dismissUnsent}
            onRetryUnsent={inbox.retryUnsent}
            onSetOwner={(person) => setHandler(inbox.selected!, person)}
            onSetStatus={(status) => void inbox.setStatus(inbox.selected!.id, status)}
            onMarkUnread={() => void inbox.markUnread(inbox.selected!.id)}
            quickReplies={quickReplies}
            quickReplyValues={quickReplyFill}
            onManageQuickReplies={() => setManagingReplies(true)}
            draftRequest={draftRequest}
            quickReplyRequest={quickReplyRequest}
            fileRequest={fileRequest}
            messageEvents={messageEvents.events}
            onSendSpecial={messageEvents.sendSpecial}
            onSchedule={() => setScheduling({ editing: null })}
            onStartFlow={crm.canStartFlows && crm.canEditLeads ? () => setStartingFlow(true) : undefined}
            onPickFromGallery={crm.canUseGalleries ? () => setPickingGallery(true) : undefined}
            scheduledSlot={
              <ScheduledList
                schedules={chatSchedules.schedules}
                flows={chatSchedules.flows}
                onEdit={(schedule) => setScheduling({ editing: schedule })}
                onCancel={(schedule) => void cancelScheduled(schedule)}
              />
            }
            followUpControl={
              crm.followUps && crm.canEditLeads ? (
                <FollowUpButton
                  key={inbox.selected.id}
                  leadId={leadIdOf(inbox.selected)}
                  leadName={getChatIdentity(inbox.selected.meta.sender, chatLabelOf(inbox.selected), inbox.selected.meta.channel).title}
                  items={crm.followUps.items}
                  people={staff}
                  meId={crm.followUps.meId}
                  onSave={crm.followUps.save}
                  onDone={crm.followUps.done}
                  onRemove={crm.followUps.remove}
                />
              ) : undefined
            }
            followUpChip={
              crm.followUps ? <FollowUpChip leadId={leadIdOf(inbox.selected)} items={crm.followUps.items} /> : undefined
            }
            pinned={inbox.selected.custom_attributes?.crm_pinned === true}
            onTogglePin={() => void inbox.togglePinned(inbox.selected!.id)}
            starredIds={inbox.selected.custom_attributes?.crm_starred ?? []}
            onToggleStar={(message) => void inbox.toggleStar(inbox.selected!.id, message.id)}
            pinnedMessageIds={inbox.selected.custom_attributes?.crm_pinned_messages ?? []}
            onTogglePinMessage={(messageId) => void inbox.togglePinMessage(inbox.selected!.id, messageId)}
            onForward={setForwarding}
            onMakeQuickReply={(chosen) => void startQuickReplyFrom(chosen)}
            onTyping={showTyping}
            aiContext={aiContext}
            sendingFrom={sendingLookOf(inbox.selected).label}
            sendingFromColor={sendingLookOf(inbox.selected).color}
            sendingFromTitle={sendingLookOf(inbox.selected).title}
            chatChoices={chatChoices}
            onSwitchChat={(option) => setSwitchRequest({ option, fetched: false })}
            onReact={(message, emoji) => {
              const waId = waIdOf(message.source_id)
              if (waId) {
                void messageEvents.react(waId, emoji)
              }
            }}
            onEditMessage={(message, text) => {
              const waId = waIdOf(message.source_id)
              return waId ? messageEvents.edit(waId, text) : Promise.resolve(false)
            }}
            onDeleteMessage={(message) => {
              const waId = waIdOf(message.source_id)
              return waId ? messageEvents.remove(waId, message.id) : Promise.resolve(false)
            }}
            draft={drafts.get(inbox.selected.id) ?? null}
            onDraftChange={(draft) => setDraft(inbox.selected!.id, draft)}
          />
          <DetailsPanel
            whatsappLabels={messageEvents.labels}
            starredMessages={(inbox.selected.custom_attributes?.crm_starred ?? []).flatMap((id) => {
              const message = inbox.messages.find((entry) => entry.id === id)
              return message
                ? [{ id, text: summarizeMessage(message.content) || (message.attachments?.length ? 'Photo, video or file' : ''), at: message.created_at }]
                : []
            })}
            onUnstar={(id) => void inbox.toggleStar(inbox.selected!.id, id)}
            className={cn(
              'min-h-0 border-l border-slate-200 bg-white',
              detailsOpen ? 'flex' : 'hidden xl:flex',
            )}
            conversation={inbox.selected}
            messages={inbox.messages}
            hasOlder={inbox.hasOlder}
            crm={crm}
            sourceRules={sourceRules.rules}
            onManageRules={(phrase) => setManagingRules({ phrase })}
            onLoadOlder={() => void inbox.loadOlder()}
            onLinkLead={(leadId) => setLeadLinkAndFamily(inbox.selected!.id, leadId)}
            conversations={inbox.conversations}
            onLinkChat={setLeadLinkAndFamily}
            onLinkStudents={async (ids) => {
              const ok = await inbox.setStudentLinks(inbox.selected!.id, ids)
              const contact = contactOf(inbox.selected!.id)
              if (ok && ids.length > 0 && contact !== null) {
                tellFamily(linkContactToStudents(contact, ids))
              }
              return ok
            }}
            people={people}
            chatOfContact={chatOfContact}
            pictureOfContact={pictureOfContact}
            onPeopleChanged={() => refreshPeople()}
            studentZone={isStudentInbox}
            userName={currentUser.name}
            onWriteMessage={(text) => {
              setDraftRequest((current) => ({ id: (current?.id ?? 0) + 1, text }))
              setDetailsOpen(false)
            }}
            onAttachFile={(file) => {
              setFileRequest((current) => ({ id: (current?.id ?? 0) + 1, files: [file] }))
              setDetailsOpen(false)
            }}
            role={getChatRole(inbox.selected)}
            onSetRole={async (role) => {
              const ok = await inbox.setChatRole(inbox.selected!.id, role)
              const contact = contactOf(inbox.selected!.id)
              if (ok && role !== null && contact !== null) {
                tellFamily(setContactRole(contact, role))
              }
              return ok
            }}
            numbersContacted={
              (numbersView?.numbers.length ?? 0) > 1
                ? numbersContacted(
                    inbox.contactChats,
                    (inboxId) => numbersView?.numbers.find((entry) => entry.inboxId === inboxId)?.label ?? null,
                  )
                : []
            }
            otherChats={familyChatsOf(inbox.selected).map((other) => ({
              id: other.id,
              title: getChatIdentity(other.meta.sender, chatTitleLabelOf(other), other.meta.channel).title,
              role: getChatRole(other),
              lastActivity: other.last_activity_at,
              isDone: other.status === 'resolved',
            }))}
            onOpenChat={(id) => inbox.setSelectedId(id)}
            onBack={() => setDetailsOpen(false)}
          />
        </>
      ) : (
        <div className="hidden items-center justify-center bg-slate-50 p-8 text-center text-sm text-slate-500 lg:col-span-1 lg:flex xl:col-span-2">
          Pick a chat on the left to read it and reply.
        </div>
      )}
      {startingChat && (
        <NewChatDialog
          leads={crm.leads}
          numbers={numberChoices.map((choice, index) => ({ id: index, label: choice.label, inboxId: choice.inboxId }))}
          defaultInboxId={inboxFilter ?? numberChoices[0]?.inboxId ?? null}
          initial={chatPrefill ?? undefined}
          onClose={() => {
            setStartingChat(false)
            setChatPrefill(null)
          }}
          onStart={async ({ phone, name, leadId, inboxId }) => {
            // The school may already have this parent's chat under a hidden ID; open that one
            // instead of making a second, empty chat for the number.
            const existing = findChatForNumber({
              conversations: inbox.conversations,
              phone,
              leadId,
              leads: crm.leads,
              students: crm.students,
            })
            if (existing) {
              setTab(getTab(existing))
              setDetailsOpen(false)
              inbox.setSelectedId(existing.id)
              return null
            }
            const result = await inbox.startNewChat({ phone, name, inboxId })
            if (result.error !== null) {
              return result.error
            }
            setTab('chats')
            setDetailsOpen(false)
            if (leadId !== null) {
              await inbox.setLeadLink(result.conversationId, leadId)
            }
            return null
          }}
        />
      )}
      {managingChannels && (
        <ChannelPicturesDialog
          channels={channelRows}
          onSave={channelAvatars.save}
          onRemove={channelAvatars.remove}
          labels={channelLabels.labels}
          onSaveLabel={channelLabels.save}
          onClose={() => setManagingChannels(false)}
        />
      )}
      {managingNumbers && numbersView && (
        <NumbersDialog
          numbers={numbersView.numbers}
          assignments={numbersView.assignments}
          staff={numbersView.staff}
          inboxes={inboxList}
          onSave={numbersView.onSave}
          onRemove={numbersView.onRemove}
          onClose={() => setManagingNumbers(false)}
          apiUrl={apiUrl}
          onReload={numbersView.onReload}
          labels={channelLabels.labels}
          onSaveLabel={channelLabels.save}
          onOpenLabelSync={() => {
            setManagingNumbers(false)
            setManagingLabelSync(true)
          }}
        />
      )}
      {managingLabelSync && <WaLabelSyncDialog tags={crm.leadOptions} onClose={() => setManagingLabelSync(false)} />}
      {automationOpen && (
        <AutomationQueueDialog
          items={automation.items}
          autoRuleKeys={automation.autoRuleKeys}
          sendHours={automation.sendHours}
          settings={automation.settings}
          sentToday={automation.sentToday}
          canEdit={crm.canEditLeads}
          isLoading={automation.isLoading}
          loadError={automation.error}
          progress={automation.progress}
          onClose={() => setAutomationOpen(false)}
          onSaveMessage={automation.saveMessage}
          onSkip={automation.skip}
          onApprove={(entries) => automation.approve(entries, sendQueued)}
        />
      )}
      {managingRules && (
        <SourceRuleManager
          rules={sourceRules.rules}
          isLoading={sourceRules.isLoading}
          loadError={sourceRules.error}
          leadOptions={crm.leadOptions}
          initialPhrase={managingRules.phrase}
          onClose={() => setManagingRules(null)}
        />
      )}
      {scheduling && scheduleTarget && (
        <ScheduleDialog
          target={scheduleTarget}
          quickReplies={quickReplies.replies}
          editing={scheduling.editing}
          onClose={() => setScheduling(null)}
          onSaved={chatSchedules.reload}
        />
      )}
      {pickingGallery && (
        <GalleryPicker
          use="inbox"
          onClose={() => setPickingGallery(false)}
          onPick={async (picked) => {
            const file = await fileFromGallery(picked)
            setFileRequest({ id: Date.now(), files: [file] })
            setPickingGallery(false)
          }}
        />
      )}
      {startingFlow && scheduleTarget && (
        <StartFlowDialog target={scheduleTarget} onClose={() => setStartingFlow(false)} onStarted={chatSchedules.reload} />
      )}
      {forwarding && (
        <ForwardDialog
          targets={forwardTargets.filter((target) => target.id !== inbox.selectedId)}
          preview={
            forwarding.length > 1
              ? `${forwarding.length} messages`
              : summarizeMessage(forwarding[0]?.content) || 'A photo, video or file'
          }
          onClose={() => setForwarding(null)}
          onForward={(ids) => forwardMessages(forwarding, ids)}
        />
      )}
      {managingReplies && (
        <QuickReplyManager
          replies={quickReplies.replies}
          isLoading={quickReplies.isLoading}
          loadError={quickReplies.error}
          canEditTeam={crm.canEditLeads}
          canUseGalleries={crm.canUseGalleries}
          start={quickReplyStart}
          onClose={() => {
            setManagingReplies(false)
            setQuickReplyStart(null)
          }}
          onSave={quickReplies.save}
          onRemove={quickReplies.remove}
          onReorder={quickReplies.reorder}
          onDuplicate={quickReplies.duplicate}
        />
      )}
    </div>
    </div>
    </StickerSourceContext.Provider>
  )
}
