import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation } from '../../lib/whatsappInbox'
import { ChannelBadge } from './ChannelBadge'
import { ChannelPicturesDialog, type ChannelPictureRow } from './ChannelPicturesDialog'
import { ConversationList } from './ConversationList'

describe('ChannelBadge', () => {
  it("shows the Page's picture when there is one", () => {
    const { container } = render(<ChannelBadge info={{ kind: 'messenger', name: 'EduHero Online', avatar: 'https://x.test/p.jpg' }} />)

    expect(screen.getByRole('img', { name: 'Messenger: EduHero Online' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.test/p.jpg')
  })

  it("falls back to the channel's logo when the picture cannot load", () => {
    const { container } = render(<ChannelBadge info={{ kind: 'messenger', name: 'EduHero Online', avatar: 'https://x.test/gone.jpg' }} />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('shows the WhatsApp logo for a WhatsApp chat, never a Page picture', () => {
    const { container } = render(<ChannelBadge info={{ kind: 'whatsapp', name: null, avatar: 'https://x.test/p.jpg' }} />)

    expect(screen.getByRole('img', { name: 'WhatsApp' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

const NOW = 1_800_000_000

const social = (id: number, page: string, inboxId: number): ChatwootConversation =>
  ({
    id,
    inbox_id: inboxId,
    status: 'open',
    unread_count: 0,
    timestamp: NOW,
    last_activity_at: NOW,
    meta: {
      channel: 'Channel::FacebookPage',
      sender: { id, name: `Parent ${id}`, phone_number: null, identifier: null, additional_attributes: { ghl_page_name: page } },
    },
    last_non_activity_message: { id, content: 'hi', message_type: 0, created_at: NOW, private: false, status: 'sent' },
  }) as unknown as ChatwootConversation

describe('ConversationList channel badge', () => {
  it('puts the Page of each chat on its picture, with that Page’s own picture', () => {
    const chats = [social(1, 'EduHero Online', 7), social(2, '万能教', 7)]
    render(
      <ConversationList
        conversations={chats}
        counts={{ chats: 2, unread: 0, done: 0 }}
        hasMoreOpen={false}
        tab="chats"
        search=""
        tagId={null}
        sourceId={null}
        tags={[]}
        sources={[]}
        snippets={new Map()}
        selectedId={null}
        nowSeconds={NOW}
        overdueCount={0}
        isLoading={false}
        loadError={null}
        canLoadMore={false}
        category="messenger"
        channelOf={(conversation) => ({
          kind: 'messenger',
          name: String(conversation.meta.sender.additional_attributes?.ghl_page_name),
          avatar: conversation.id === 1 ? 'https://x.test/eduhero.jpg' : null,
        })}
        onTab={vi.fn()}
        onTag={vi.fn()}
        onSource={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onNewChat={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Messenger: EduHero Online' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Messenger: 万能教' })).toBeInTheDocument()
    // The words "Messenger" / "Instagram" are not repeated beside the name when the badge says it.
    expect(screen.queryByText('Messenger')).not.toBeInTheDocument()
  })
})

describe('ConversationList channel buttons', () => {
  function renderWith(onInbox: (id: number | null) => void, inboxId: number | null) {
    render(
      <ConversationList
        conversations={[social(1, 'EduHero Online', 7)]}
        counts={{ chats: 1, unread: 0, done: 0 }}
        hasMoreOpen={false}
        tab="chats"
        search=""
        tagId={null}
        sourceId={null}
        tags={[]}
        sources={[]}
        snippets={new Map()}
        selectedId={null}
        nowSeconds={NOW}
        overdueCount={0}
        isLoading={false}
        loadError={null}
        canLoadMore={false}
        category="messenger"
        allChannelsLabel="All Messenger pages"
        inboxId={inboxId}
        onInbox={onInbox}
        numberChoices={[
          { inboxId: 7, label: 'EduHero Online', info: { kind: 'messenger', name: 'EduHero Online', avatar: 'https://x.test/a.jpg' } },
          { inboxId: 8, label: '万能教', info: { kind: 'messenger', name: '万能教', avatar: null } },
        ]}
        onTab={vi.fn()}
        onTag={vi.fn()}
        onSource={vi.fn()}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onNewChat={vi.fn()}
      />,
    )
  }

  it('has one button per channel in the left bar, and no channel drop-down', async () => {
    const onInbox = vi.fn()
    renderWith(onInbox, null)

    expect(screen.queryByLabelText('Filter by channel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Only 万能教' }))

    expect(onInbox).toHaveBeenCalledWith(8)
  })

  it('shows all channels again when the chosen one is pressed (the X)', async () => {
    const onInbox = vi.fn()
    renderWith(onInbox, 7)

    await userEvent.click(screen.getByRole('button', { name: /EduHero Online: show all messenger pages/ }))

    expect(onInbox).toHaveBeenCalledWith(null)
  })
})

const rows: ChannelPictureRow[] = [
  { key: '7|EduHero Online', kind: 'messenger', name: 'EduHero Online', auto: null, uploaded: null },
  { key: '7|万能教', kind: 'messenger', name: '万能教', auto: 'https://x.test/p.jpg', uploaded: null },
  { key: '8', kind: 'instagram', name: 'eduhero.ig', auto: null, uploaded: 'data:image/jpeg;base64,AAAA' },
]

describe('ChannelPicturesDialog', () => {
  it('says where each picture comes from', () => {
    render(<ChannelPicturesDialog channels={rows} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/Messenger · No picture yet/)).toBeInTheDocument()
    expect(screen.getByText(/Messenger · The Page's own picture/)).toBeInTheDocument()
    expect(screen.getByText(/Instagram · Your picture/)).toBeInTheDocument()
  })

  it('removes an uploaded picture, and only an uploaded one can be removed', async () => {
    const onRemove = vi.fn().mockResolvedValue(null)
    render(<ChannelPicturesDialog channels={rows} onSave={vi.fn()} onRemove={onRemove} onClose={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onRemove).toHaveBeenCalledWith('8')
  })

  it('shows what went wrong when a file is not a picture', async () => {
    const onSave = vi.fn()
    render(<ChannelPicturesDialog channels={rows} onSave={onSave} onRemove={vi.fn()} onClose={vi.fn()} />)

    const input = screen.getByLabelText('Picture for EduHero Online')
    await userEvent.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a picture')
    expect(onSave).not.toHaveBeenCalled()
  })
})
