import { Fragment, useEffect, useRef, useState } from 'react'
import { PictureOrText } from './Avatar'
import { Bell, BellSlash, CaretDown, ChatCircleDots, CheckCircle, EnvelopeSimple, FunnelSimple, ImageSquare, Lightning, X, MagnifyingGlass, Phone, Plus, SpeakerHigh, SpeakerSlash, PushPin } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { LeadTagChip } from '../LeadTagChip'
import { ChannelBadge, type ChannelInfo } from './ChannelBadge'
import { WifiSlash } from '@phosphor-icons/react'
import { Highlighted } from './Highlighted'
import { formatReactionLine, isCheckingReaction, type ReactionPreview } from '../../lib/reactionPreview'
import { waIdOf } from '../../lib/waActions'
import type { LeadOption } from '../../types/domain'
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
  socialKindOf,
  getPreview,
  type ChatwootConversation,
  type InboxCategory,
  type InboxTab,
} from '../../lib/whatsappInbox'

const tabs: { key: InboxTab; label: string; icon: Icon }[] = [
  { key: 'chats', label: 'Chats', icon: ChatCircleDots },
  { key: 'unread', label: 'Unread', icon: EnvelopeSimple },
  { key: 'done', label: 'Done', icon: CheckCircle },
]

// The "Load older chats" button loads by itself as soon as it scrolls into view, so the list simply goes on
// (the button stays for a computer without that, and to try again).
function LoadMoreButton({ onLoadMore, isLoadingMore }: { onLoadMore: () => void; isLoadingMore: boolean }) {
  const button = useRef<HTMLButtonElement>(null)
  const load = useRef(onLoadMore)
  useEffect(() => {
    load.current = onLoadMore
  }, [onLoadMore])
  useEffect(() => {
    const element = button.current
    if (!element || isLoadingMore || typeof IntersectionObserver === 'undefined') {
      return
    }
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load.current()
      }
    })
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [isLoadingMore])
  return (
    <button
      ref={button}
      type="button"
      onClick={onLoadMore}
      disabled={isLoadingMore}
      className="w-full px-3 py-3 text-sm font-medium text-[#be185d] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
    >
      {isLoadingMore ? 'Loading...' : 'Load older chats'}
    </button>
  )
}

// What an empty tab says: each tab is empty for a different reason.
function emptyText(tab: InboxTab, moreToLoad: boolean) {
  if (moreToLoad) {
    return 'None in the chats loaded so far. Press "Load older chats" to look further back.'
  }
  if (tab === 'done') {
    return 'No finished chats yet. A chat you press Done on moves here, and comes back when the parent writes again.'
  }
  if (tab === 'unread') {
    return "You're all caught up. There are no unread chats."
  }
  return 'Nothing here. New messages from parents will show up here.'
}

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
  // While searching: the chats found by name or number. The rest were found by the words in their messages.
  // null when nothing is being searched.
  peopleIds?: ReadonlySet<number> | null
  // The name or number that made a chat fit the search, shown when the row itself does not show it.
  matchOf?: (conversation: ChatwootConversation) => string | null
  // The parent's name on the lead a chat belongs to, for chats WhatsApp gave no name.
  leadNameOf?: (conversation: ChatwootConversation) => string | null
  // What the parent's students are to the school ("Regular · 3 Months", "HOA"), per chat.
  studentLabelsOf?: (conversation: ChatwootConversation) => string[]
  // The lead stage of a chat's lead (the school's own name and colour); null for students and chats with no lead.
  stageOf?: (conversation: ChatwootConversation) => { label: string; badge: string } | null
  // The lead's tags, shown as chips under the chat.
  tagsOf?: (conversation: ChatwootConversation) => Pick<LeadOption, 'id' | 'label' | 'color' | 'isActive'>[]
  // Who is in charge of the parent: the lead's person in charge, else whoever handles the chat.
  picOf?: (conversation: ChatwootConversation) => { name: string; initials: string } | null
  // The parent's WhatsApp picture, shown in place of the initials when there is one.
  pictureOf?: (conversation: ChatwootConversation) => string | null
  // How long a parent has waited (the red banner, the red row, "Waiting 45 min"). Hidden for now.
  showWaiting?: boolean
  // What the reactions at the end of chats were put on, by the reaction's WhatsApp id.
  reactionPreviews?: ReadonlyMap<string, ReactionPreview>
  // What is left unsent in the chat, as one short line; null when nothing is.
  draftOf?: (conversation: ChatwootConversation) => string | null
  // True for an older chat of a parent who has a newer one.
  isOlderDuplicate?: (conversation: ChatwootConversation) => boolean
  // True for a chat nobody wrote in, of a parent who has another chat with messages.
  isEmptyDuplicate?: (conversation: ChatwootConversation) => boolean
  // True when the team (or the page) said the student themself is on this chat.
  isStudentSelf?: (conversation: ChatwootConversation) => boolean
  // Show only parents with a student in this group (a class category or an identity label), or 'none' for none yet.
  kind?: string | null
  // The groups to pick from (studentGroupOptions); the CRM's four kinds when not given.
  kindChoices?: string[]
  selectedId: number | null
  // The clock, so a chat that has waited too long is flagged without a refresh.
  nowSeconds: number
  // How many chats are past the limit, across every tab and filter.
  overdueCount: number
  isLoading: boolean
  loadError: string | null
  canLoadMore: boolean
  // A page of older chats is on its way.
  isLoadingMore?: boolean
  className?: string
  onTab: (tab: InboxTab) => void
  onTag: (tagId: number | null) => void
  onSource: (sourceId: number | null) => void
  onKind?: (kind: string | null) => void
  // Stage filter: the stage key picked, the school's stages to pick from.
  stage?: string | null
  stages?: { key: string; label: string }[]
  onStage?: (stage: string | null) => void
  // Staff filter: the chats a staff member took. Shown when there is at least one staff to pick.
  ownerId?: number | 'none' | null
  owners?: { id: number; label: string }[]
  onOwner?: (ownerId: number | 'none' | null) => void
  // The part of the inbox on show (WhatsApp, Messenger or Instagram); the switch itself sits above the box.
  category?: InboxCategory
  // The words of the "all channels" choice in the channel filter ("All numbers" for WhatsApp).
  allChannelsLabel?: string
  // WhatsApp numbers: shown on each chat (short name, colour, and the full name on a long look), and a filter when
  // the person sees more than one.
  numberOf?: (conversation: ChatwootConversation) => { label: string; color: string | null; title: string } | null
  // Which channel a chat came through (WhatsApp, a Messenger Page, Instagram) and that Page's picture: shown as a
  // small badge on the chat's picture.
  channelOf?: (conversation: ChatwootConversation) => ChannelInfo | null
  inboxId?: number | null
  // The channels the inbox has (the numbers, Pages or accounts of this part): each is a button at the top of the left
  // bar; pressing one shows only its chats, and pressing it again (the X) shows them all.
  // `short` is what the button says (the short name, else the last 4 digits); `title` the full name and number,
  // shown when the pointer rests on it or a finger holds it.
  // `problem`: the channel stopped working (e.g. "Logged out"); its button gets a red mark (the red bar on top says more).
  numberChoices?: { inboxId: number; label: string; short?: string; title?: string; info?: ChannelInfo; problem?: string | null }[]
  onInbox?: (inboxId: number | null) => void
  // Admin: opens the window where numbers are added and given to staff.
  onManageNumbers?: () => void
  // Admin: opens the window where the Pages' pictures are set.
  onManageChannels?: () => void
  onSearch: (value: string) => void
  onSelect: (id: number) => void
  onLoadMore: () => void
  onNewChat: () => void
  // Messages the automations want to send, waiting for approval. The button shows when a handler is given.
  automationCount?: number
  onOpenAutomations?: () => void
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
  peopleIds = null,
  matchOf,
  leadNameOf,
  studentLabelsOf,
  stageOf,
  tagsOf,
  picOf,
  pictureOf,
  showWaiting = false,
  draftOf,
  reactionPreviews,
  isOlderDuplicate,
  isEmptyDuplicate,
  isStudentSelf,
  kind = null,
  kindChoices,
  stage = null,
  stages = [],
  onStage,
  ownerId = null,
  owners = [],
  onOwner,
  category = 'whatsapp',
  allChannelsLabel = 'All numbers',
  numberOf,
  channelOf,
  inboxId = null,
  numberChoices = [],
  onInbox,
  onManageNumbers,
  onManageChannels,
  selectedId,
  nowSeconds,
  overdueCount,
  isLoading,
  loadError,
  canLoadMore,
  isLoadingMore = false,
  className,
  onTab,
  onTag,
  onSource,
  onKind,
  onSearch,
  onSelect,
  onLoadMore,
  onNewChat,
  automationCount = 0,
  onOpenAutomations,
}: ConversationListProps) {
  // The filters sit behind one button; they open by themselves while one of them is on.
  const activeFilters = [
    tagId !== null,
    sourceId !== null,
    ownerId !== null,
    Boolean(kind),
    Boolean(stage),
  ].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A channel button held down on a phone shows its full name; the press that showed it does not also pick it.
  const [heldChannel, setHeldChannel] = useState<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const heldPress = useRef(false)
  const showFilters = filtersOpen || activeFilters > 0

  const railButton =
    'relative flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-medium leading-none transition'
  const railBadge =
    'absolute -right-1 -top-1 min-w-4 rounded-full bg-[#fc0c97] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white'

  return (
    <div className={cn('flex min-h-0 border-slate-200 bg-white lg:border-r', className)}>
      <nav
        aria-label="Inbox menu"
        className="flex w-[58px] shrink-0 flex-col items-center gap-1.5 border-r border-slate-200 bg-slate-50 py-3"
      >
        {onInbox && numberChoices.length > 1 && (
          <>
            {numberChoices.map((choice) => {
              const on = inboxId === choice.inboxId
              return (
                <button
                  key={choice.inboxId}
                  type="button"
                  onClick={() => {
                    if (heldPress.current) {
                      heldPress.current = false
                      return
                    }
                    onInbox(on ? null : choice.inboxId)
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') {
                      return
                    }
                    heldPress.current = false
                    holdTimer.current = window.setTimeout(() => {
                      heldPress.current = true
                      setHeldChannel(choice.inboxId)
                    }, 450)
                  }}
                  onPointerUp={() => {
                    if (holdTimer.current !== null) {
                      window.clearTimeout(holdTimer.current)
                      holdTimer.current = null
                    }
                    window.setTimeout(() => setHeldChannel((current) => (current === choice.inboxId ? null : current)), 1500)
                  }}
                  onPointerLeave={() => {
                    if (holdTimer.current !== null) {
                      window.clearTimeout(holdTimer.current)
                      holdTimer.current = null
                    }
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  aria-label={`${on ? `${choice.title ?? choice.label}: show ${allChannelsLabel.toLowerCase()}` : `Only ${choice.title ?? choice.label}`}${choice.problem ? ` (${choice.problem})` : ''}`}
                  aria-pressed={on}
                  title={`${on ? `${choice.title ?? choice.label} (press to see ${allChannelsLabel.toLowerCase()})` : (choice.title ?? choice.label)}${choice.problem ? ` · ${choice.problem}` : ''}`}
                  className={cn(
                    railButton,
                    'gap-1 px-0.5',
                    on ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white',
                    choice.problem && !on && 'border-red-300 bg-red-50 text-red-700',
                  )}
                >
                  <ChannelBadge info={choice.info ?? { kind: category, name: choice.label, avatar: null }} size={26} className="ring-0" />
                  <span className="w-full truncate text-center">{choice.short ?? choice.label}</span>
                  {heldChannel === choice.inboxId && (
                    <span
                      role="tooltip"
                      className="absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
                    >
                      {choice.title ?? choice.label}
                    </span>
                  )}
                  {choice.problem && (
                    <span
                      aria-hidden="true"
                      className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white ring-2 ring-white"
                    >
                      <WifiSlash size={10} weight="bold" />
                    </span>
                  )}
                  {on && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#fc0c97] text-white">
                      <X size={10} weight="bold" />
                    </span>
                  )}
                </button>
              )
            })}
            <span aria-hidden="true" className="my-1 h-px w-8 bg-slate-200" />
          </>
        )}
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
                railButton,
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white',
              )}
            >
              <TabIcon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              {label}
              {key === 'unread' && count > 0 && (
                <span title="Chats nobody has opened yet" className={railBadge}>
                  {count > 99 ? '99+' : `${count}${hasMoreOpen ? '+' : ''}`}
                </span>
              )}
            </button>
          )
        })}
        <span aria-hidden="true" className="my-1 h-px w-8 bg-slate-200" />
        {category === 'whatsapp' && (
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            title="Start a new chat"
            className={cn(railButton, 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white')}
          >
            <Plus size={20} aria-hidden="true" />
            New
          </button>
        )}
        {onOpenAutomations && (
          <button
            type="button"
            onClick={onOpenAutomations}
            aria-label={`Automations, ${automationCount} waiting`}
            title="Automations: messages waiting for your approval"
            className={cn(railButton, 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white')}
          >
            <Lightning size={20} aria-hidden="true" />
            Auto
            {automationCount > 0 && <span className={railBadge}>{automationCount > 99 ? '99+' : automationCount}</span>}
          </button>
        )}
        {onManageNumbers && category === 'whatsapp' && (
          <button
            type="button"
            onClick={onManageNumbers}
            aria-label="Numbers"
            title="WhatsApp numbers and who answers them"
            className={cn(railButton, 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white')}
          >
            <Phone size={20} aria-hidden="true" />
            Numbers
          </button>
        )}
        {onManageChannels && category !== 'whatsapp' && (
          <button
            type="button"
            onClick={onManageChannels}
            aria-label="Pages"
            title="The pictures of the Pages your chats come through"
            className={cn(railButton, 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white')}
          >
            <ImageSquare size={20} aria-hidden="true" />
            Pages
          </button>
        )}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-[4.5px] text-sm text-slate-500 focus-within:border-[#fc0c97]">
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
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={showFilters}
            aria-label="Filters"
            title="Filter by staff, tag, source, type or stage"
            className={cn(
              'relative inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border transition',
              activeFilters > 0 || showFilters
                ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <FunnelSimple size={18} aria-hidden="true" />
            {activeFilters > 0 && <span className={railBadge}>{activeFilters}</span>}
          </button>
        </div>

        {showWaiting && overdueCount > 0 && (
          <p role="status" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
            {overdueCount} {overdueCount === 1 ? 'chat has' : 'chats have'} waited over 30 minutes for a reply.
          </p>
        )}
        {showFilters && (
        <div className={cn('mt-2 grid gap-2 text-sm', onKind && !onStage ? 'grid-cols-3' : 'grid-cols-2')}>
          {onOwner && (
            <label className="relative col-span-full min-w-0">
              <span className="sr-only">Filter by staff</span>
              <select
                value={ownerId === null ? '' : String(ownerId)}
                onChange={(event) => {
                  const value = event.target.value
                  onOwner(value === '' ? null : value === 'none' ? 'none' : Number(value))
                }}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                  ownerId === null ? 'border-slate-200 text-slate-700' : 'border-[#fc0c97] text-slate-900',
                )}
              >
                <option value="">All staff</option>
                <option value="none">Nobody has taken it</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.label}
                  </option>
                ))}
              </select>
              <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
          )}
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
                onChange={(event) => onKind(event.target.value || null)}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                  kind ? 'border-[#fc0c97] text-slate-900' : 'border-slate-200 text-slate-700',
                )}
              >
                <option value="">All types</option>
                {(kindChoices ?? ['Regular', 'HOA', 'Trial', 'Camp']).map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
                <option value="none">Not a student</option>
              </select>
              <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
          )}
          {onStage && (
            <label className="relative min-w-0">
              <span className="sr-only">Filter by lead stage</span>
              <select
                value={stage ?? ''}
                onChange={(event) => onStage(event.target.value || null)}
                className={cn(
                  'w-full appearance-none rounded-lg border bg-white py-1.5 pl-2.5 pr-7 text-xs outline-none focus:border-[#fc0c97]',
                  stage ? 'border-[#fc0c97] text-slate-900' : 'border-slate-200 text-slate-700',
                )}
              >
                <option value="">All stages</option>
                {stages.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
          )}
        </div>
        )}
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
            {search || tagId !== null || sourceId !== null || kind || ownerId !== null || inboxId !== null
              ? 'No chats match.'
              : emptyText(tab, canLoadMore)}
          </p>
        )}
        {conversations.map((conversation, index) => {
          // While searching, a heading starts each group: the people found, then the chats where the words were said.
          const isPerson = peopleIds?.has(conversation.id) ?? false
          const startsGroup =
            peopleIds !== null && (index === 0 || (peopleIds.has(conversations[index - 1].id) ?? false) !== isPerson)
          const identity = getChatIdentity(conversation.meta.sender, leadNameOf?.(conversation), conversation.meta.channel)
          // Why a person came up when the row does not show it: the WhatsApp name, a child's name...
          const matched = isPerson ? (matchOf?.(conversation) ?? null) : null
          const matchedName = matched && !identity.title.toLowerCase().includes(matched.toLowerCase()) ? matched : null
          const channel = channelOf?.(conversation) ?? null
          const pic = picOf?.(conversation) ?? null
          const lastMessage = conversation.last_non_activity_message
          const preview = getPreview(conversation)
          // A reaction reads like WhatsApp writes it ("You reacted 😂 to: ...") instead of just the emoji.
          const reaction = reactionPreviews?.get(waIdOf(lastMessage?.source_id) ?? '')
          const byUs = lastMessage?.message_type === 1
          const reactionLine = reaction
            ? formatReactionLine(reaction.emoji, reaction.target, byUs)
            : isCheckingReaction(lastMessage, nowSeconds)
              ? formatReactionLine((lastMessage?.content ?? '').trim(), null, byUs)
              : null
          const selected = conversation.id === selectedId
          const waiting = getWaitingSeconds(conversation, nowSeconds)
          const overdue = showWaiting && waiting !== null && waiting >= OVERDUE_SECONDS
          // Past a day it is most likely an old chat, so it gets the label but not the red row.
          const redRow = overdue && waiting < STALE_SECONDS
          return (
            <Fragment key={conversation.id}>
            {startsGroup && (
              <h3 className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isPerson ? 'Chats' : 'Found in messages'}
              </h3>
            )}
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={cn(
                'grid w-full grid-cols-[36px_minmax(0,1fr)] gap-3 border-b border-l-4 border-b-slate-100 px-3 py-3 text-left transition',
                redRow ? 'border-l-red-500' : 'border-l-transparent',
                selected ? 'bg-pink-50' : redRow ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50',
              )}
            >
              {/* Down a little, so the name tag on its corner stays inside the row (not over the line above). */}
              <span className="relative mt-2 h-9 w-9">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
                >
                  <PictureOrText src={pictureOf?.(conversation)} text={identity.initials} />
                </span>
                {channel && <ChannelBadge info={channel} className="absolute -bottom-1 -right-1" />}
                {/* Who handles the chat, by full name, on the picture's top-left corner (a long name ends in "…"). */}
                {pic && (
                  <span
                    title={`Handled by ${pic.name}`}
                    className="absolute -left-2 -top-2 z-10 max-w-[56px] truncate rounded-full border border-white bg-[#fc0c97] px-1.5 py-px text-[9px] font-semibold leading-tight text-white shadow-sm"
                  >
                    {pic.name}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900" title={identity.title}><Highlighted text={identity.title} query={isPerson ? search : undefined} /></span>
                    {!channel && socialKindOf(conversation.meta.channel, conversation.meta.sender) === 'messenger' && (
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        Messenger
                      </span>
                    )}
                    {!channel && socialKindOf(conversation.meta.channel, conversation.meta.sender) === 'instagram' && (
                      <span className="shrink-0 rounded bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                        Instagram
                      </span>
                    )}
                    {numberOf?.(conversation) && (
                      <span
                        title={numberOf(conversation)!.title}
                        className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                      >
                        {numberOf(conversation)!.color && (
                          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: numberOf(conversation)!.color! }} />
                        )}
                        {numberOf(conversation)!.label}
                      </span>
                    )}
                    {conversation.custom_attributes?.crm_pinned && (
                      <PushPin size={12} weight="fill" className="shrink-0 text-slate-400" aria-label="Pinned" />
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatListTime(conversation.last_activity_at)}</span>
                </span>
                {isPerson && matchedName && (
                  <span className="block truncate text-xs text-slate-500">
                    <Highlighted text={matchedName} query={search} />
                  </span>
                )}
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
                        <Highlighted text={snippets.get(conversation.id) ?? ''} query={search} />
                      </>
                    ) : reactionLine ? (
                      reactionLine
                    ) : lastMessage?.private && preview ? (
                      <>
                        Note: <Highlighted text={preview} query={search} />
                      </>
                    ) : lastMessage?.message_type === 1 && preview ? (
                      <>
                        You: <Highlighted text={preview} query={search} />
                      </>
                    ) : (
                      <Highlighted text={preview} query={search} />
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
                  {isStudentSelf?.(conversation) && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                      Student themself
                    </span>
                  )}
                  {isEmptyDuplicate?.(conversation) && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Empty. This parent's chat is another one
                    </span>
                  )}
                  {(() => {
                    const shown = stageOf?.(conversation)
                    return shown ? (
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', shown.badge)} title="Lead stage">
                        {shown.label}
                      </span>
                    ) : null
                  })()}
                  {studentLabelsOf?.(conversation).map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    >
                      {label}
                    </span>
                  ))}
                  {tagsOf?.(conversation).map((tag) => (
                    <span key={tag.id} className="max-w-full">
                      <LeadTagChip tag={tag} compact />
                    </span>
                  ))}
                </span>
              </span>
            </button>
            </Fragment>
          )
        })}
        {canLoadMore && <LoadMoreButton onLoadMore={onLoadMore} isLoadingMore={isLoadingMore} />}
      </div>

      <AlertSettings />
      </div>
    </div>
  )
}
