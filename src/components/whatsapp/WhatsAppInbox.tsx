import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { createChatwootClient, type Sender } from '../../lib/chatwootClient'
import { useWhatsAppInbox } from '../../hooks/useWhatsAppInbox'
import {
  countByTab,
  filterConversations,
  getChatIdentity,
  getLinkedLeadId,
  getRealPhone,
  type InboxTab,
  type OwnerFilter,
} from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { quickReplyValues, resolveChatLead } from '../../lib/chatLink'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'
import { QuickReplyManager } from './QuickReplyManager'

type WhatsAppInboxProps = {
  apiUrl: string
  currentUser: Sender
  staff: Sender[]
  crm: WhatsAppCrm
}

export function WhatsAppInbox({ apiUrl, currentUser, staff, crm }: WhatsAppInboxProps) {
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  const inbox = useWhatsAppInbox(client, currentUser)
  const [tab, setTab] = useState<InboxTab>('to_reply')
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

  const quickReplies = useQuickReplies(true)
  const [managingReplies, setManagingReplies] = useState(false)
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
    <div className="grid h-[calc(100dvh-210px)] min-h-[520px] lg:h-[calc(100dvh-130px)] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]">
      <ConversationList
        className={cn(hasChat && 'hidden lg:flex')}
        conversations={visible}
        counts={counts}
        hasMoreOpen={inbox.canLoadMore.open}
        tab={tab}
        owner={owner}
        search={search}
        selectedId={inbox.selectedId}
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
