import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { createChatwootClient, type Sender } from '../../lib/chatwootClient'
import { useWhatsAppInbox } from '../../hooks/useWhatsAppInbox'
import {
  countByTab,
  countWaiting,
  filterConversations,
  getChatIdentity,
  getLinkedLeadId,
  getRealPhone,
  isRecentlyOverdue,
  type InboxTab,
  type OwnerFilter,
} from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useSourceRules } from '../../hooks/useSourceRules'
import { quickReplyValues, resolveChatLead } from '../../lib/chatLink'
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
}

export function WhatsAppInbox({ apiUrl, currentUser, staff, crm }: WhatsAppInboxProps) {
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  const inbox = useWhatsAppInbox(client, currentUser)
  const [tab, setTab] = useState<InboxTab>('chats')
  const [owner, setOwner] = useState<OwnerFilter>('everyone')
  const [search, setSearch] = useState('')
  // On a small screen the side panel takes the place of the chat.
  const [detailsOpen, setDetailsOpen] = useState(false)

  const counts = useMemo(() => countByTab(inbox.conversations), [inbox.conversations])
  const visible = useMemo(
    () => filterConversations(inbox.conversations, { tab, owner, search, currentUserId: currentUser.id }),
    [inbox.conversations, tab, owner, search, currentUser.id],
  )
  const hasChat = inbox.selected !== null

  // Ticks every 30 seconds so a chat turns red the moment it passes 30 minutes.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const waitingCount = useMemo(() => countWaiting(inbox.conversations, nowSeconds), [inbox.conversations, nowSeconds])
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
  // What {parent name}, {child name} and the like become in the open chat.
  const quickReplyFill = useMemo(() => {
    if (!inbox.selected) {
      return {}
    }
    const sender = inbox.selected.meta.sender
    const identity = getChatIdentity(sender)
    const { lead } = resolveChatLead(getLinkedLeadId(inbox.selected), getRealPhone(sender.phone_number), crm.leads)
    return quickReplyValues({
      lead,
      chatName: identity.title === 'Hidden number' || identity.title.startsWith('+') ? '' : identity.title,
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
        owner={owner}
        search={search}
        selectedId={inbox.selectedId}
        nowSeconds={nowSeconds}
        waitingCount={waitingCount}
        overdueCount={overdueCount}
        isLoading={inbox.isLoading}
        loadError={inbox.loadError}
        canLoadMore={tab === 'done' ? inbox.canLoadMore.resolved : inbox.canLoadMore.open}
        onTab={setTab}
        onOwner={setOwner}
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
            messages={inbox.messages}
            waitingMessages={inbox.waitingMessages}
            hasOlder={inbox.hasOlder}
            staff={staff}
            actionError={inbox.actionError}
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
            quickReplies={quickReplies}
            quickReplyValues={quickReplyFill}
            onManageQuickReplies={crm.canEditLeads ? () => setManagingReplies(true) : undefined}
          />
          <DetailsPanel
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
            onSavePhone={inbox.savePhone}
            onLinkLead={(leadId) => inbox.setLeadLink(inbox.selected!.id, leadId)}
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
          onClose={() => setStartingChat(false)}
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
      {managingReplies && (
        <QuickReplyManager
          replies={quickReplies.replies}
          isLoading={quickReplies.isLoading}
          loadError={quickReplies.error}
          onClose={() => setManagingReplies(false)}
          onSave={quickReplies.save}
          onRemove={quickReplies.remove}
        />
      )}
    </div>
  )
}
