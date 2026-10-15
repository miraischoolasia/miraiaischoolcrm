import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { createChatwootClient, type Sender } from '../../lib/chatwootClient'
import { useMessageSearch } from '../../hooks/useMessageSearch'
import { useWhatsAppInbox } from '../../hooks/useWhatsAppInbox'
import {
  type ChatwootConversation,
  type ChatwootMessage,
  countByTab,
  filterConversations,
  getChatIdentity,
  getInitials,
  getLinkedLeadId,
  getChatRole,
  getLinkedStudentIds,
  getOwner,
  getRealPhone,
  getTab,
  isGroupChat,
  isMessengerChannel,
  isRecentlyOverdue,
  type InboxTab,
} from '../../lib/whatsappInbox'
import { hoaSlotLinesForAi } from '../../lib/hoaSlots'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useAutomationQueue } from '../../hooks/useAutomationQueue'
import { needsApproval, type QueueItem } from '../../lib/automationQueue'
import { useSourceRules } from '../../hooks/useSourceRules'
import { useAutoLeads } from '../../hooks/useAutoLeads'
import { makeLeadResolver, quickReplyValues, resolveChatLead } from '../../lib/chatLink'
import { findChatForNumber } from '../../lib/chatForNumber'
import { useAutoChatRole } from '../../hooks/useAutoChatRole'
import { usePeople } from '../../hooks/usePeople'
import { linkContactToLead, linkContactToStudents, setContactRole } from '../../lib/peopleApi'
import { draftPreview, draftsFirst, type Draft } from '../../lib/draft'
import { createWaActions, waIdOf } from '../../lib/waActions'
import { useReactionPreviews } from '../../hooks/useReactionPreviews'
import { findChatByPhone, startChat } from '../../lib/startChat'
import { fileProblem, splitSequence } from '../../lib/outbox'
import { summarizeMessage } from '../../lib/specialMessages'
import { ForwardDialog } from './ForwardDialog'
import { forwardInOrder } from '../../lib/forwardSend'
import { useMessageEvents } from '../../hooks/useMessageEvents'
import { useTyping } from '../../hooks/useTyping'
import { describeStudent, getStudentKind, makeStudentResolver, type StudentKind } from '../../lib/studentLink'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'
import { AutomationQueueDialog } from './AutomationQueueDialog'
import { NewChatDialog } from './NewChatDialog'
import { NumbersDialog, type AssignableStaff } from './NumbersDialog'
import type { WhatsAppNumber, WhatsAppNumberDraft } from '../../lib/whatsappNumbers'
import { QuickReplyManager } from './QuickReplyManager'
import { SourceRuleManager } from './SourceRuleManager'

type WhatsAppInboxProps = {
  apiUrl: string
  currentUser: Sender
  staff: Sender[]
  crm: WhatsAppCrm
  // False while another page is showing; this page stays mounted so it is as it was left.
  active?: boolean
  // A number somewhere else in the app asked for its chat. Each request has its own id.
  openRequest?: { id: number; phone: string; name: string | null; leadId: number | null } | null
  // The school's WhatsApp numbers and who may see which. Without it the page is one inbox for everybody.
  numbersView?: WhatsAppNumbersView
}

// What the inbox needs to know about the school's WhatsApp numbers.
export type WhatsAppNumbersView = {
  numbers: WhatsAppNumber[]
  assignments: Map<number, number[]>
  // undefined while loading; null when nothing is restricted; otherwise the Chatwoot inboxes this person sees.
  allowedInboxIds: number[] | null | undefined
  isAdmin: boolean
  staff: AssignableStaff[]
  onSave: (existing: WhatsAppNumber | null, draft: WhatsAppNumberDraft, teacherIds: number[]) => Promise<string | null>
  onRemove: (number: WhatsAppNumber) => Promise<string | null>
}

export function WhatsAppInbox({
  apiUrl,
  currentUser,
  staff,
  crm,
  active = true,
  openRequest = null,
  numbersView,
}: WhatsAppInboxProps) {
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  const waActions = useMemo(() => createWaActions(apiUrl), [apiUrl])
  // While the numbers load nothing is listed, so a restricted person never sees a chat flash by.
  const allowedInboxIds = numbersView ? (numbersView.allowedInboxIds === undefined ? [] : numbersView.allowedInboxIds) : null
  const inbox = useWhatsAppInbox(client, currentUser, active, allowedInboxIds)
  const [tab, setTab] = useState<InboxTab>('chats')
  const [tagId, setTagId] = useState<number | null>(null)
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [kind, setKind] = useState<StudentKind | 'none' | null>(null)
  const [ownerId, setOwnerId] = useState<number | 'none' | null>(null)
  const [inboxFilter, setInboxFilter] = useState<number | null>(null)
  const [managingNumbers, setManagingNumbers] = useState(false)
  const [inboxList, setInboxList] = useState<{ id: number; name: string }[]>([])
  const [search, setSearch] = useState('')
  // Text the enrol steps write for the message box; each new id is added once.
  const [draftRequest, setDraftRequest] = useState<{ id: number; text: string } | null>(null)
  // On a small screen the side panel takes the place of the chat.
  const [detailsOpen, setDetailsOpen] = useState(false)

  const counts = useMemo(() => countByTab(inbox.conversations), [inbox.conversations])
  // Words typed in the search are also looked for inside the messages of every chat.
  const messageHits = useMessageSearch(client, search)
  const matchedIds = useMemo(() => new Set(messageHits.keys()), [messageHits])
  const { loadMissingConversations } = inbox
  useEffect(() => {
    if (messageHits.size > 0) {
      void loadMissingConversations([...messageHits.keys()])
    }
  }, [messageHits, loadMissingConversations])

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
      const leadName = leadNameOf(conversation)
      const role = getChatRole(conversation)
      const studentNames = studentsOf(conversation).map((student) => student.name)
      // A lead that is not a student yet is named by the children written on it.
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      const names =
        studentNames.length > 0
          ? studentNames
          : (lead?.children ?? []).map((child) => child.name?.trim()).filter((name): name is string => Boolean(name))
      if (!role || names.length === 0) {
        return leadName
      }
      if (role === 'student') {
        return `${names[0]} (${studentNames.length > 0 ? 'student' : 'child'})`
      }
      const parentOf = `${names.join(' & ')}'s parent`
      return leadName ? `${leadName} · ${parentOf}` : parentOf
    },
    [leadNameOf, studentsOf, resolveLead],
  )
  // Every name a chat can be found by in the search box.
  const searchNamesOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      return [
        chatLabelOf(conversation) ?? '',
        lead?.fullName ?? '',
        ...(lead?.children ?? []).map((child) => child.name ?? ''),
        ...studentsOf(conversation).map((student) => student.name ?? ''),
      ].filter((name) => name.trim() !== '')
    },
    [chatLabelOf, resolveLead, studentsOf],
  )
  const studentLabelsOf = useCallback(
    (conversation: ChatwootConversation) => [
      ...new Set(studentsOf(conversation).map((student) => describeStudent(student, crm.packages))),
    ],
    [studentsOf, crm.packages],
  )
  const studentKindsOf = useCallback(
    (conversation: ChatwootConversation) =>
      studentsOf(conversation).map((student) => getStudentKind(student, crm.packages)),
    [studentsOf, crm.packages],
  )
  // The lead's tags and person in charge, shown on each chat in the list.
  const optionsById = useMemo(() => new Map(crm.leadOptions.map((option) => [option.id, option])), [crm.leadOptions])
  const tagsOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      return (lead?.tagIds ?? []).flatMap((id) => {
        const option = optionsById.get(id)
        return option && option.kind === 'tag' ? [option] : []
      })
    },
    [resolveLead, optionsById],
  )
  const picOf = useCallback(
    (conversation: ChatwootConversation) => {
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      const leadPic = lead?.picId != null ? optionsById.get(lead.picId)?.label : undefined
      const owner = getOwner(conversation)
      const name = (owner ? (staff.find((person) => person.id === owner.id)?.name ?? owner.name) : undefined) ?? leadPic
      return name ? { name, initials: getInitials(name) } : null
    },
    [resolveLead, optionsById, staff],
  )
  // "Handled by" and the lead's person in charge are one thing for the team. They are two lists (the PIC
  // names end in 小老师, the staff names in 老师), so a person is matched to a PIC by the name without 小.
  const sameName = (a: string, b: string) => a.replace(/[小\s]/g, '').toLowerCase() === b.replace(/[小\s]/g, '').toLowerCase()
  const picOptions = useMemo(() => crm.leadOptions.filter((option) => option.kind === 'pic'), [crm.leadOptions])
  const handlerOf = useCallback(
    (conversation: ChatwootConversation) => {
      const owner = getOwner(conversation)
      if (owner) {
        return { id: owner.id, name: staff.find((person) => person.id === owner.id)?.name ?? owner.name }
      }
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      const pic = lead?.picId != null ? picOptions.find((option) => option.id === lead.picId) : undefined
      return (pic ? staff.find((person) => sameName(person.name, pic.label)) : undefined) ?? null
    },
    [picOptions, resolveLead, staff],
  )
  // Choosing who handles a chat also sets the lead's person in charge, when that person is one.
  const setHandler = useCallback(
    (conversation: ChatwootConversation, person: Sender | null) => {
      void inbox.setOwner(conversation.id, person)
      const lead = resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number))
      if (!lead || !crm.canEditLeads) {
        return
      }
      const pic = person ? picOptions.find((option) => option.isActive && sameName(option.label, person.name)) : undefined
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
    [crm, inbox, picOptions, resolveLead],
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
      return lead ? (chatsByLead.get(lead.id) ?? []).filter((other) => other.id !== conversation.id) : []
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
  const visible = useMemo(
    () =>
      // Pinned chats first, then the ones with a draft, then the rest in their order.
      draftsFirst(
        draftsFirst(
        filterConversations(
          inbox.conversations,
          { tab, search, tagId, sourceId, matchedIds, kind, ownerId, inboxId: inboxFilter },
          (conversation) =>
            resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number)),
          studentKindsOf,
          searchNamesOf,
        ),
        (id) => id !== inbox.selectedId && drafts.has(id),
        ),
        (id) => pinnedIds.has(id),
      ),
    [inbox.conversations, inbox.selectedId, pinnedIds, drafts, tab, search, tagId, sourceId, matchedIds, kind, ownerId, inboxFilter, resolveLead, studentKindsOf, searchNamesOf],
  )
  const hasChat = inbox.selected !== null
  // Reactions, edits and deletes of the open chat, and the team's own.
  const messageEvents = useMessageEvents(waActions, client, currentUser, inbox.selectedId, inbox.messages, active)
  const reactionPreviews = useReactionPreviews(active ? waActions : null, visible)
  const showTyping = useTyping(waActions, inbox.selected ? getRealPhone(inbox.selected.meta.sender.phone_number) : null)

  // Ticks every 30 seconds so a chat turns red the moment it passes 30 minutes.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const overdueCount = useMemo(
    () => inbox.conversations.filter((conversation) => isRecentlyOverdue(conversation, nowSeconds)).length,
    [inbox.conversations, nowSeconds],
  )

  const quickReplies = useQuickReplies(true)
  const sourceRules = useSourceRules(true)
  // Messages the automations want to send; each goes out only when a person approves it.
  const automation = useAutomationQueue({ enabled: active })
  const [automationOpen, setAutomationOpen] = useState(false)
  const automationWaiting = useMemo(
    () => automation.items.filter((entry) => needsApproval(entry, automation.autoRuleKeys, Date.now())).length,
    [automation.items, automation.autoRuleKeys],
  )
  // The family table: who is whose parent. The database keeps it in step with leads and students; the
  // page adds each WhatsApp contact and what the team ties together by hand.
  const { people, refresh: refreshPeople } = usePeople({
    enabled: active,
    canEdit: crm.canEditLeads || crm.canEditStudents,
    conversations: inbox.conversations,
  })
  const contactOf = useCallback(
    (conversationId: number) =>
      inbox.conversations.find((conversation) => conversation.id === conversationId)?.meta.sender.id ?? null,
    [inbox.conversations],
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
      const ok = await inbox.setLeadLink(conversationId, leadId)
      const contact = contactOf(conversationId)
      if (ok && leadId !== null && contact !== null) {
        tellFamily(linkContactToLead(contact, leadId))
      }
      return ok
    },
    [inbox, contactOf, tellFamily],
  )
  // A new chat that matches a source rule becomes a lead without anyone pressing "Save lead".
  useAutoLeads({
    enabled: active,
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
  // Set while the source rules window is open; phrase starts a new rule from a message.
  const [managingRules, setManagingRules] = useState<{ phrase: string } | null>(null)
  const [managingReplies, setManagingReplies] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  // The number and lead a "New chat" window starts with, when it was opened from one.
  const [chatPrefill, setChatPrefill] = useState<{ phone: string; name: string; leadId: number | null } | null>(null)
  // The message being forwarded, while the person picks the chats.
  const [forwarding, setForwarding] = useState<ChatwootMessage | null>(null)

  // Another page asked for the chat of a number: open the one this page has, else look
  // for it on the server, and only when there is none offer to start one.
  const handledRequest = useRef<number | null>(null)
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
  const { conversations: loadedChats, isLoading: isLoadingChats, setSelectedId, startNewChat } = inbox
  useEffect(() => {
    if (!openRequest || !active || isLoadingChats || handledRequest.current === openRequest.id) {
      return
    }
    handledRequest.current = openRequest.id
    const show = (conversation: ChatwootConversation | null) => {
      setSearch('')
      setTagId(null)
      setSourceId(null)
      setKind(null)
      setOwnerId(null)
      setDetailsOpen(false)
      if (conversation) {
        setTab(getTab(conversation))
        setSelectedId(conversation.id)
      }
    }
    // Also a chat whose number WhatsApp hides, when it is tied to a lead or student with this number.
    const here = findChatForNumber({
      conversations: loadedChats,
      phone: openRequest.phone,
      leadId: openRequest.leadId,
      leads: crm.leads,
      students: crm.students,
    })
    if (here) {
      show(here)
      return
    }
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
  }, [openRequest, active, isLoadingChats, loadedChats, client, setSelectedId, startNewChat, crm.leads, crm.students])

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
      .map((entry) => ({ inboxId: entry.inboxId, label: entry.label }))
  }, [numbersView])
  // The name of the number a chat is on; shown only when there is more than one to tell apart.
  const numberLabelOf = useCallback(
    (conversation: ChatwootConversation) =>
      numberChoices.length > 1
        ? (numberChoices.find((choice) => choice.inboxId === conversation.inbox_id)?.label ?? null)
        : null,
    [numberChoices],
  )
  const openNumbers = useCallback(() => {
    setManagingNumbers(true)
    client
      .listInboxes()
      .then((list) => setInboxList(list.map((entry) => ({ id: entry.id, name: entry.name }))))
      .catch(() => setInboxList([]))
  }, [client])

  const forwardTargets = useMemo(
    () =>
      inbox.conversations.map((conversation) => {
        const identity = getChatIdentity(conversation.meta.sender, chatLabelOf(conversation), conversation.meta.channel)
        return { id: conversation.id, title: identity.title, subtitle: identity.subtitle }
      }),
    [inbox.conversations, chatLabelOf],
  )

  // Sends a copy of the message (its text, then each file) to every chat chosen. Null when all went out.
  async function forwardMessage(message: ChatwootMessage, targetIds: number[]) {
    try {
      const files = await Promise.all(
        (message.attachments ?? []).map(async (attachment) => {
          const response = await fetch(attachment.data_url)
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
      const parts = splitSequence([(message.content ?? '').trim(), ...files])
      // One part at a time: the next only goes once WhatsApp has accepted the one before, so a file
      // is never overtaken by the text that follows it.
      await forwardInOrder(
        targetIds,
        parts,
        (targetId, part) =>
          client.sendMessage(targetId, { content: part.content, isPrivate: false, files: part.files, sender: currentUser }),
        inbox.waitUntilSent,
      )
      return null
    } catch {
      return "Couldn't forward it to every chat. Check which ones got it, then try again."
    }
  }
  // Sends an approved automation message to the parent's chat: the chat the school already has for
  // the number (also one whose number WhatsApp hides), else the one the server has, else a new one.
  // Resolves to an error message, or null once WhatsApp has accepted the message.
  async function sendQueued(entry: QueueItem, message: string) {
    const known = findChatForNumber({
      conversations: inbox.conversations,
      phone: entry.phone,
      leadId: entry.leadId,
      leads: crm.leads,
      students: crm.students,
    })
    let conversationId = known?.id ?? null
    if (known && known.status === 'resolved') {
      await inbox.setStatus(known.id, 'open')
    }
    if (conversationId === null) {
      const started = await startChat(client, { phone: entry.phone, name: entry.parentName ?? '' })
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
    // Nor in a Messenger chat: its text is not sent to the AI service (Meta's data-handling answers say so).
    if (
      !inbox.selected ||
      !crm.canEditLeads ||
      isGroupChat(inbox.selected.meta.sender) ||
      isMessengerChannel(inbox.selected.meta.channel)
    ) {
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

  return (
    <div
      className={cn(
        'grid h-[calc(100dvh-210px)] min-h-[520px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-[calc(100dvh-130px)] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]',
        // On a phone an open chat takes the whole screen, above the page title and
        // tools, and stops just above the bottom menu.
        hasChat && 'max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-[5.7rem] max-lg:z-30 max-lg:h-auto max-lg:min-h-0 max-lg:rounded-none max-lg:border-0',
      )}
    >
      <ConversationList
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
        leadNameOf={chatLabelOf}
        draftOf={draftOf}
        reactionPreviews={reactionPreviews}
        studentLabelsOf={studentLabelsOf}
        isOlderDuplicate={isOlderDuplicate}
        isEmptyDuplicate={isEmptyDuplicate}
        isStudentSelf={(conversation) => getChatRole(conversation) === 'student'}
        tagsOf={tagsOf}
        picOf={picOf}
        kind={kind}
        onKind={setKind}
        ownerId={ownerId}
        owners={ownerOptions}
        onOwner={setOwnerId}
        selectedId={inbox.selectedId}
        nowSeconds={nowSeconds}
        overdueCount={overdueCount}
        isLoading={inbox.isLoading}
        loadError={inbox.loadError}
        canLoadMore={tab === 'done' ? inbox.canLoadMore.resolved : inbox.canLoadMore.open}
        onTab={setTab}
        onTag={setTagId}
        onSource={setSourceId}
        onSearch={setSearch}
        onSelect={(id) => {
          setDetailsOpen(false)
          inbox.setSelectedId(id)
        }}
        onLoadMore={() => void inbox.loadMore(tab === 'done' ? 'resolved' : 'open')}
        onNewChat={() => setStartingChat(true)}
        automationCount={automationWaiting}
        onOpenAutomations={() => setAutomationOpen(true)}
        numberOf={numberLabelOf}
        inboxId={inboxFilter}
        numberChoices={numberChoices}
        onInbox={setInboxFilter}
        onManageNumbers={numbersView?.isAdmin ? openNumbers : undefined}
      />

      {inbox.selected ? (
        <>
          <ChatPanel
            className={cn(!hasChat && 'hidden lg:flex', detailsOpen && 'hidden xl:flex')}
            conversation={inbox.selected}
            leadName={chatLabelOf(inbox.selected)}
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
            onSetOwner={(person) => setHandler(inbox.selected!, person)}
            onSetStatus={(status) => void inbox.setStatus(inbox.selected!.id, status)}
            onMarkUnread={() => void inbox.markUnread(inbox.selected!.id)}
            quickReplies={quickReplies}
            quickReplyValues={quickReplyFill}
            onManageQuickReplies={crm.canEditLeads ? () => setManagingReplies(true) : undefined}
            draftRequest={draftRequest}
            messageEvents={messageEvents.events}
            onSendSpecial={messageEvents.sendSpecial}
            pinned={inbox.selected.custom_attributes?.crm_pinned === true}
            onTogglePin={() => void inbox.togglePinned(inbox.selected!.id)}
            starredIds={inbox.selected.custom_attributes?.crm_starred ?? []}
            onToggleStar={(message) => void inbox.toggleStar(inbox.selected!.id, message.id)}
            onForward={setForwarding}
            onTyping={showTyping}
            aiContext={aiContext}
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
              'min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-4',
              detailsOpen ? 'block' : 'hidden xl:block',
            )}
            conversation={inbox.selected}
            messages={inbox.messages}
            hasOlder={inbox.hasOlder}
            crm={crm}
            sourceRules={sourceRules.rules}
            onManageRules={(phrase) => setManagingRules({ phrase })}
            onLoadOlder={() => void inbox.loadOlder()}
            onLinkLead={(leadId) => setLeadLinkAndFamily(inbox.selected!.id, leadId)}
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
            userName={currentUser.name}
            onWriteMessage={(text) => {
              setDraftRequest((current) => ({ id: (current?.id ?? 0) + 1, text }))
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
            otherChats={familyChatsOf(inbox.selected).map((other) => ({
              id: other.id,
              title: getChatIdentity(other.meta.sender, chatLabelOf(other), other.meta.channel).title,
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
        />
      )}
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
          onSave={sourceRules.save}
          onRemove={sourceRules.remove}
          onAddOption={crm.onAddOption}
        />
      )}
      {forwarding && (
        <ForwardDialog
          targets={forwardTargets.filter((target) => target.id !== inbox.selectedId)}
          preview={summarizeMessage(forwarding.content) || 'A photo, video or file'}
          onClose={() => setForwarding(null)}
          onForward={(ids) => forwardMessage(forwarding, ids)}
        />
      )}
      {managingReplies && (
        <QuickReplyManager
          replies={quickReplies.replies}
          isLoading={quickReplies.isLoading}
          loadError={quickReplies.error}
          onClose={() => setManagingReplies(false)}
          onSave={quickReplies.save}
          onRemove={quickReplies.remove}
          onReorder={quickReplies.reorder}
        />
      )}
    </div>
  )
}
