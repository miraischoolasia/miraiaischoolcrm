import { useState } from 'react'
import { Bell, BellSlash, CaretDown, ChatCircleDots, CheckCircle, EnvelopeSimple, MagnifyingGlass, Plus, SpeakerHigh, SpeakerSlash, PushPin } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { LeadTagChip } from '../LeadTagChip'
import { formatReactionLine, type ReactionPreview } from '../../lib/reactionPreview'
import { waIdOf } from '../../lib/waActions'
import type { LeadOption } from '../../types/domain'
import type { StudentKind } from '../../lib/studentLink'
import {
  desktopAlertsStatus,
  enableDesktopAlerts,
  isSoundOn,
  setSoundOn,
} from '../../lib/inboxAlerts'
import {
  formatListTime,
  formatWaiting,
  getWaitingSeconds,
  OVERDUE_SECONDS,
  STALE_SECONDS,
  getChatIdentity,
  getPreview,
  type ChatwootConversation,
  type InboxTab,
} from '../../lib/whatsappInbox'

const tabs: { key: InboxTab; label: string; icon: Icon }[] = [
  { key: 'chats', label: 'Chats', icon: ChatCircleDots },
  { key: 'unread', label: 'Unread', icon: EnvelopeSimple },
  { key: 'done', label: 'Done', icon: CheckCircle },
]

// A tag or source to filter by, already worded for the menu (with how many chats it has).
export type FilterChoice = { id: number; label: string }

type ConversationListProps = {
  conversations: ChatwootConversation[]
  counts: Record<InboxTab, number>
  hasMoreOpen: boolean
  tab: InboxTab
  search: string
  // Show only chats of leads with this tag, or from this source.
  tagId: number | null
  sourceId: number | null
  tags: FilterChoice[]
  sources: FilterChoice[]
  // The message that matched the search, by chat.
  snippets: ReadonlyMap<number, string>
  // The parent's name on the lead a chat belongs to, for chats WhatsApp gave no name.
  leadNameOf?: (conversation: ChatwootConversation) => string | null
  // What the parent's students are to the school ("Regular · 3 Months", "HOA"), per chat.
  studentLabelsOf?: (conversation: ChatwootConversation) => string[]
  // The lead's tags, shown as chips under the chat.
  tagsOf?: (conversation: ChatwootConversation) => Pick<LeadOption, 'id' | 'label' | 'color' | 'isActive'>[]
  // Who is in charge of the parent: the lead's person in charge, else whoever handles the chat.
  picOf?: (conversation: ChatwootConversation) => { name: string; initials: string } | null
  // How long a parent has waited (the red banner, the red row, "Waiting 45 min"). Hidden for now.
  showWaiting?: boolean
  // What the reactions at the end of chats were put on, by the reaction's WhatsApp id.
  reactionPreviews?: ReadonlyMap<string, ReactionPreview>
  // What is left unsent in the chat, as one short line; null when nothing is.
  draftOf?: (conversation: ChatwootConversation) => string | null
  // True for an older chat of a parent who has a newer one.
  isOlderDuplicate?: (conversation: ChatwootConversation) => boolean
  // Show only parents with a student of this kind, or with none yet.
  kind?: StudentKind | 'none' | null
  selectedId: number | null
  // The clock, so a chat that has waited too long is flagged without a refresh.
  nowSeconds: number
  // How many chats are past the limit, across every tab and filter.
  overdueCount: number
  isLoading: boolean
  loadError: string | null
  canLoadMore: boolean
  className?: string
  onTab: (tab: InboxTab) => void
  onTag: (tagId: number | null) => void
  onSource: (sourceId: number | null) => void
  onKind?: (kind: StudentKind | 'none' | null) => void
  onSearch: (value: string) => void
  onSelect: (id: number) => void
  onLoadMore: () => void
  onNewChat: () => void
}

function AlertSettings() {
  const [sound, setSound] = useState(isSoundOn())
  const [desktop, setDesktop] = useState(desktopAlertsStatus())

  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
      <button
        type="button"
        onClick={() => {
          setSoundOn(!sound)
          setSound(!sound)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-100"
      >
        {sound ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
        Sound {sound ? 'on' : 'off'}
      </button>
      {desktop !== 'unsupported' && (
        <button
          type="button"
          onClick={async () => setDesktop(await enableDesktopAlerts())}
          title={desktop === 'blocked' ? 'Allow notifications for this site in your browser settings' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-100"
        >
          {desktop === 'on' ? <Bell size={16} /> : <BellSlash size={16} />}
          {desktop === 'on' ? 'Pop-ups on' : desktop === 'blocked' ? 'Pop-ups blocked' : 'Turn on pop-ups'}
        </button>
      )}
    </div>
  )
}

export function ConversationList({
  conversations,
  counts,
  hasMoreOpen,
  tab,
  search,
  tagId,
  sourceId,
  tags,
  sources,
  snippets,
  leadNameOf,
  studentLabelsOf,
  tagsOf,
  picOf,
  showWaiting = false,
  draftOf,
  reactionPreviews,
  isOlderDuplicate,
  kind = null,
  selectedId,
  nowSeconds,
  overdueCount,
  isLoading,
  loadError,
  canLoadMore,
  className,
  onTab,
  onTag,
  onSource,
  onKind,
  onSearch,
  onSelect,
  onLoadMore,
  onNewChat,
}: ConversationListProps) {
  return (
    <div className={cn('flex min-h-0 flex-col border-slate-200 bg-white lg:border-r', className)}>
      <div className="border-b border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">WhatsApp</h2>
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} aria-hidden="true" />
            New chat
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-[4.5px] text-sm text-slate-500 focus-within:border-[#fc0c97]">
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search name or number"
            aria-label="Search chats"
            // The app's default input is tall; this one is kept slim.
            style={{ minHeight: 0, height: 30, padding: 0 }}
            className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {tabs.map(({ key, label, icon: TabIcon }) => {
            const active = tab === key
            const count = counts[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTab(key)}
                aria-label={`${label}, ${count}`}
                aria-pressed={active}
                title={label}
                className={cn(
                  'relative flex h-10 items-center justify-center rounded-lg border transition',
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                <TabIcon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                <span className="ml-1.5 text-sm font-medium">{label}</span>
                {key === 'unread' && count > 0 && (
                  <span
                    title="Chats nobody has opened yet"
                    className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[#fc0c97] px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
                  >
                    {count > 99 ? '99+' : count}
                    {hasMoreOpen ? '+' : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {showWaiting && overdueCount > 0 && (
          <p role="status" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
            {overdueCount} {overdueCount === 1 ? 'chat has' : 'chats have'} waited over 30 minutes for a reply.
          </p>
        )}
        <div className={cn('mt-2 grid gap-2 text-sm', onKind ? 'grid-cols-3' : 'grid-cols-2')}>
          <label className="relative min-w-0">
            <span className="sr-only">Filter by tag</span>
            <select
              value={tagId ?? ''}
              onChange={(event) => onTag(event.target.value ? Number(event.target.value) : null)}
              className={cn(
                'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                tagId === null ? 'border-slate-200 text-slate-700' : 'border-[#fc0c97] text-slate-900',
              )}
            >
              <option value="">All tags</option>
              {tags.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
          </label>
          <label className="relative min-w-0">
            <span className="sr-only">Filter by source</span>
            <select
              value={sourceId ?? ''}
              onChange={(event) => onSource(event.target.value ? Number(event.target.value) : null)}
              className={cn(
                'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                sourceId === null ? 'border-slate-200 text-slate-700' : 'border-[#fc0c97] text-slate-900',
              )}
            >
              <option value="">All sources</option>
              {sources.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
          </label>
          {onKind && (
            <label className="relative min-w-0">
              <span className="sr-only">Filter by student type</span>
              <select
                value={kind ?? ''}
                onChange={(event) => onKind((event.target.value || null) as StudentKind | 'none' | null)}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                  kind ? 'border-[#fc0c97] text-slate-900' : 'border-slate-200 text-slate-700',
                )}
              >
                <option value="">All types</option>
                <option value="regular">Regular</option>
                <option value="hoa">HOA</option>
                <option value="trial">Trial</option>
                <option value="camp">Camp</option>
                <option value="none">Not a student</option>
              </select>
              <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
          )}
        </div>
        {(tagId !== null || sourceId !== null) && (
          <p className="mt-1 text-[11px] text-slate-500">
            Only chats tied to a lead are shown.{' '}
            <button
              type="button"
              onClick={() => {
                onTag(null)
                onSource(null)
              }}
              className="font-medium text-[#be185d] underline"
            >
              Clear filters
            </button>
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-slate-500">Loading chats...</p>}
        {loadError && <p className="p-4 text-sm text-red-600">{loadError}</p>}
        {!isLoading && !loadError && conversations.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            {search || tagId !== null || sourceId !== null || kind ? 'No chats match.' : 'Nothing here. New messages from parents will show up here.'}
          </p>
        )}
        {conversations.map((conversation) => {
          const identity = getChatIdentity(conversation.meta.sender, leadNameOf?.(conversation))
          const pic = picOf?.(conversation) ?? null
          const lastMessage = conversation.last_non_activity_message
          const preview = getPreview(conversation)
          // A reaction reads like WhatsApp writes it ("You reacted 😂 to: ...") instead of just the emoji.
          const reaction = reactionPreviews?.get(waIdOf(lastMessage?.source_id) ?? '')
          const reactionLine = reaction ? formatReactionLine(reaction.emoji, reaction.target, lastMessage?.message_type === 1) : null
          const selected = conversation.id === selectedId
          const waiting = getWaitingSeconds(conversation, nowSeconds)
          const overdue = showWaiting && waiting !== null && waiting >= OVERDUE_SECONDS
          // Past a day it is most likely an old chat, so it gets the label but not the red row.
          const redRow = overdue && waiting < STALE_SECONDS
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                'grid w-full grid-cols-[36px_minmax(0,1fr)] gap-3 border-b border-l-4 border-b-slate-100 px-3 py-3 text-left transition',
                redRow ? 'border-l-red-500' : 'border-l-transparent',
                selected ? 'bg-pink-50' : redRow ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50',
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
              >
                {identity.initials}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">{identity.title}</span>
                    {conversation.custom_attributes?.crm_pinned && (
                      <PushPin size={12} weight="fill" className="shrink-0 text-slate-400" aria-label="Pinned" />
                    )}
                    {pic && (
                      <span
                        title={`In charge: ${pic.name}`}
                        className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-pink-100 px-1 text-[10px] font-bold leading-none text-[#be185d]"
                      >
                        {pic.initials}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatListTime(conversation.last_activity_at)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-slate-500">
                    {draftOf?.(conversation) ? (
                      <>
                        <span className="font-medium text-[#fc0c97]">Draft: </span>
                        {draftOf(conversation)}
                      </>
                    ) : snippets.get(conversation.id) ? (
                      <>
                        <span className="font-medium text-[#be185d]">Found: </span>
                        {snippets.get(conversation.id)}
                      </>
                    ) : reactionLine ? (
                      reactionLine
                    ) : lastMessage?.private && preview ? (
                      `Note: ${preview}`
                    ) : lastMessage?.message_type === 1 && preview ? (
                      `You: ${preview}`
                    ) : (
                      preview
                    )}
                  </span>
                  {conversation.unread_count > 0 && conversation.status !== 'resolved' && conversation.custom_attributes?.crm_marked_unread && conversation.unread_count <= 1 ? (
                    <span role="img" aria-label="Marked as unread" className="size-2.5 shrink-0 rounded-full bg-[#fc0c97]" />
                  ) : conversation.unread_count > 0 && conversation.status !== 'resolved' && (
                    <span className="min-w-5 shrink-0 rounded-full bg-[#fc0c97] px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white">
                      {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                    </span>
                  )}
                </span>
                <span className="mt-1 flex min-h-[22px] flex-wrap gap-1">
                  {overdue && waiting !== null && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      Waiting {formatWaiting(waiting)}
                    </span>
                  )}
                  {isOlderDuplicate?.(conversation) && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Older chat of this parent
                    </span>
                  )}
                  {studentLabelsOf?.(conversation).map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    >
                      {label}
                    </span>
                  ))}
                  {tagsOf?.(conversation).map((tag) => (
                    <span key={tag.id} className="max-w-full text-[11px]">
                      <LeadTagChip tag={tag} />
                    </span>
                  ))}
                </span>
              </span>
            </button>
          )
        })}
        {canLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            className="w-full px-3 py-3 text-sm font-medium text-[#be185d] hover:bg-slate-50"
          >
            Load older chats
          </button>
        )}
      </div>

      <AlertSettings />
    </div>
  )
}
