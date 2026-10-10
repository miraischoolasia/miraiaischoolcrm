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
  getLinkedStudentIds,
  getOwner,
  getRealPhone,
  getTab,
  isRecentlyOverdue,
  type InboxTab,
} from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useSourceRules } from '../../hooks/useSourceRules'
import { canonicalPhone, makeLeadResolver, quickReplyValues, resolveChatLead } from '../../lib/chatLink'
import { draftPreview, draftsFirst, type Draft } from '../../lib/draft'
import { createWaActions, waIdOf } from '../../lib/waActions'
import { findChatByPhone } from '../../lib/startChat'
import { splitSequence } from '../../lib/outbox'
import { summarizeMessage } from '../../lib/specialMessages'
import { ForwardDialog } from './ForwardDialog'
import { useMessageEvents } from '../../hooks/useMessageEvents'
import { useTyping } from '../../hooks/useTyping'
import { describeStudent, getStudentKind, makeStudentResolver, type StudentKind } from '../../lib/studentLink'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'
import { NewChatDialog } from './NewChatDialog'
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
}

export function WhatsAppInbox({ apiUrl, currentUser, staff, crm, active = true, openRequest = null }: WhatsAppInboxProps) {
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  const waActions = useMemo(() => createWaActions(apiUrl), [apiUrl])
  const inbox = useWhatsAppInbox(client, currentUser, active)
  const [tab, setTab] = useState<InboxTab>('chats')
  const [tagId, setTagId] = useState<number | null>(null)
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [kind, setKind] = useState<StudentKind | 'none' | null>(null)
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
      const name = leadPic ?? getOwner(conversation)?.name
      return name ? { name, initials: getInitials(name) } : null
    },
    [resolveLead, optionsById],
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
  const isOlderDuplicate = useCallback(
    (conversation: ChatwootConversation) =>
      otherChatsOf(conversation).some((other) => other.last_activity_at > conversation.last_activity_at),
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
          { tab, search, tagId, sourceId, matchedIds, kind },
          (conversation) =>
            resolveLead(getLinkedLeadId(conversation), getRealPhone(conversation.meta.sender.phone_number)),
          studentKindsOf,
        ),
        (id) => id !== inbox.selectedId && drafts.has(id),
        ),
        (id) => pinnedIds.has(id),
      ),
    [inbox.conversations, inbox.selectedId, pinnedIds, drafts, tab, search, tagId, sourceId, matchedIds, kind, resolveLead, studentKindsOf],
  )
  const hasChat = inbox.selected !== null
  // Reactions, edits and deletes of the open chat, and the team's own.
  const messageEvents = useMessageEvents(waActions, client, currentUser, inbox.selectedId, inbox.messages, active)
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
  const { conversations: loadedChats, isLoading: isLoadingChats, setSelectedId, startNewChat } = inbox
  useEffect(() => {
    if (!openRequest || !active || isLoadingChats || handledRequest.current === openRequest.id) {
      return
    }
    handledRequest.current = openRequest.id
    const wanted = canonicalPhone(openRequest.phone)
    const show = (conversation: ChatwootConversation | null) => {
      setSearch('')
      setTagId(null)
      setSourceId(null)
      setKind(null)
      setDetailsOpen(false)
      if (conversation) {
        setTab(getTab(conversation))
        setSelectedId(conversation.id)
      }
    }
    const here = loadedChats.find(
      (conversation) =>
        (openRequest.leadId !== null && getLinkedLeadId(conversation) === openRequest.leadId) ||
        (wanted !== null && canonicalPhone(getRealPhone(conversation.meta.sender.phone_number)) === wanted),
    )
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
  }, [openRequest, active, isLoadingChats, loadedChats, client, setSelectedId, startNewChat])

  const forwardTargets = useMemo(
    () =>
      inbox.conversations.map((conversation) => {
        const identity = getChatIdentity(conversation.meta.sender, leadNameOf(conversation))
        return { id: conversation.id, title: identity.title, subtitle: identity.subtitle }
      }),
    [inbox.conversations, leadNameOf],
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
      const parts = splitSequence([(message.content ?? '').trim(), ...files])
      for (const targetId of targetIds) {
        for (const part of parts) {
          await client.sendMessage(targetId, { content: part.content, isPrivate: false, files: part.files, sender: currentUser })
        }
      }
      return null
    } catch {
      return "Couldn't forward it to every chat. Check which ones got it, then try again."
    }
  }
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
        leadNameOf={leadNameOf}
        draftOf={draftOf}
        studentLabelsOf={studentLabelsOf}
        isOlderDuplicate={isOlderDuplicate}
        tagsOf={tagsOf}
        picOf={picOf}
        kind={kind}
        onKind={setKind}
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
      />

      {inbox.selected ? (
        <>
          <ChatPanel
            className={cn(!hasChat && 'hidden lg:flex', detailsOpen && 'hidden xl:flex')}
            conversation={inbox.selected}
            leadName={leadNameOf(inbox.selected)}
            onOpenLead={
              leadIdOf(inbox.selected) !== null ? () => crm.onOpenLead(leadIdOf(inbox.selected!)!) : undefined
            }
            messages={inbox.messages}
            waitingMessages={inbox.waitingMessages}
            hasOlder={inbox.hasOlder}
            staff={staff}
            actionError={inbox.actionError ?? messageEvents.error}
            onBack={() => {
              setDetailsOpen(false)
              inbox.setSelectedId(null)
            }}
            onOpenDetails={() => setDetailsOpen(true)}
            onLoadOlder={() => void inbox.loadOlder()}
            onSend={inbox.send}
            onDismissUnsent={inbox.dismissUnsent}
            onSetOwner={(person) => void inbox.setOwner(inbox.selected!.id, person)}
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
            onLinkLead={(leadId) => inbox.setLeadLink(inbox.selected!.id, leadId)}
            onLinkStudents={(ids) => inbox.setStudentLinks(inbox.selected!.id, ids)}
            userName={currentUser.name}
            onWriteMessage={(text) => {
              setDraftRequest((current) => ({ id: (current?.id ?? 0) + 1, text }))
              setDetailsOpen(false)
            }}
            otherChats={otherChatsOf(inbox.selected).map((other) => ({
              id: other.id,
              title: getChatIdentity(other.meta.sender, leadNameOf(other)).title,
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
          initial={chatPrefill ?? undefined}
          onClose={() => {
            setStartingChat(false)
            setChatPrefill(null)
          }}
          onStart={async ({ phone, name, leadId }) => {
            const result = await inbox.startNewChat({ phone, name })
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
