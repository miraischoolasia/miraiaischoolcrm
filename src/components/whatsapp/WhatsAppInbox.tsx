import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { createChatwootClient, type Sender } from '../../lib/chatwootClient'
import { useWhatsAppInbox } from '../../hooks/useWhatsAppInbox'
import {
  countByTab,
  filterConversations,
  type InboxTab,
  type OwnerFilter,
} from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'
import { DetailsPanel } from './DetailsPanel'

type WhatsAppInboxProps = {
  apiUrl: string
  currentUser: Sender
  staff: Sender[]
}

export function WhatsAppInbox({ apiUrl, currentUser, staff }: WhatsAppInboxProps) {
  const client = useMemo(() => createChatwootClient(apiUrl), [apiUrl])
  const inbox = useWhatsAppInbox(client, currentUser)
  const [tab, setTab] = useState<InboxTab>('to_reply')
  const [owner, setOwner] = useState<OwnerFilter>('everyone')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => countByTab(inbox.conversations), [inbox.conversations])
  const visible = useMemo(
    () => filterConversations(inbox.conversations, { tab, owner, search, currentUserId: currentUser.id }),
    [inbox.conversations, tab, owner, search, currentUser.id],
  )
  const hasChat = inbox.selected !== null

  return (
    <div className="grid h-[calc(100dvh-210px)] min-h-[520px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]">
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
        onSelect={inbox.setSelectedId}
        onLoadMore={() => void inbox.loadMore(tab === 'done' ? 'resolved' : 'open')}
      />

      {inbox.selected ? (
        <>
          <ChatPanel
            className={!hasChat ? 'hidden lg:flex' : undefined}
            conversation={inbox.selected}
            messages={inbox.messages}
            waitingMessages={inbox.waitingMessages}
            hasOlder={inbox.hasOlder}
            staff={staff}
            actionError={inbox.actionError}
            onBack={() => inbox.setSelectedId(null)}
            onLoadOlder={() => void inbox.loadOlder()}
            onSend={inbox.send}
            onDismissUnsent={inbox.dismissUnsent}
            onSetOwner={(person) => void inbox.setOwner(inbox.selected!.id, person)}
            onSetStatus={(status) => void inbox.setStatus(inbox.selected!.id, status)}
          />
          <DetailsPanel
            className="hidden overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block"
            conversation={inbox.selected}
            onSavePhone={inbox.savePhone}
          />
        </>
      ) : (
        <div className="hidden items-center justify-center bg-slate-50 p-8 text-center text-sm text-slate-500 lg:col-span-1 lg:flex xl:col-span-2">
          Pick a chat on the left to read it and reply.
        </div>
      )}
    </div>
  )
}
