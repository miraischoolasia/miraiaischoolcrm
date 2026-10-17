import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeNote } from '../../lib/aiKnowledge'
import { AiKnowledgeSection } from './AiKnowledgeSection'

const hook = vi.hoisted(() => ({
  state: {
    notes: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    reload: vi.fn(),
    save: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    loadVersions: vi.fn(),
  },
}))
vi.mock('../../hooks/useAiKnowledge', () => ({ useAiKnowledge: () => hook.state }))

const learning = vi.hoisted(() => ({
  state: {
    isLoading: false,
    error: null as string | null,
    reload: vi.fn(),
    gaps: [] as unknown[],
    examples: [] as unknown[],
    report: { drafts: 0, answered: 0, asIs: 0, edited: 0, replaced: 0, byCategory: [] as unknown[] },
    closeGap: vi.fn(),
    closeExample: vi.fn(),
  },
}))
vi.mock('../../hooks/useAiLearning', () => ({ useAiLearning: () => learning.state }))

const lesson = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../lib/aiLearning', async (original) => ({
  ...(await original<typeof import('../../lib/aiLearning')>()),
  requestLesson: lesson.request,
}))

const note = (change: Partial<KnowledgeNote> = {}): KnowledgeNote => ({
  id: 1,
  title: '学校',
  body: 'Mirai AI School，7 年经验。',
  enabled: true,
  updatedAt: '2026-10-13T01:00:00Z',
  ...change,
})

beforeEach(() => {
  hook.state.notes = [note(), note({ id: 2, title: 'HOA', body: 'RM38', enabled: false })]
  hook.state.isLoading = false
  hook.state.error = null
  hook.state.save.mockReset()
  hook.state.toggle.mockReset().mockResolvedValue(null)
  hook.state.remove.mockReset().mockResolvedValue(null)
  hook.state.move.mockReset().mockResolvedValue(null)
  hook.state.loadVersions.mockReset().mockResolvedValue({ versions: [], error: null })
  learning.state.isLoading = false
  learning.state.error = null
  learning.state.gaps = []
  learning.state.examples = []
  learning.state.report = { drafts: 0, answered: 0, asIs: 0, edited: 0, replaced: 0, byCategory: [] }
  learning.state.closeGap.mockReset().mockResolvedValue(null)
  learning.state.closeExample.mockReset().mockResolvedValue(null)
})

describe('the list of notes', () => {
  it('shows each note with how many are on, and what the AI reads', async () => {
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    expect(screen.getByText('学校')).toBeInTheDocument()
    expect(screen.getByText('HOA')).toBeInTheDocument()
    expect(screen.getByText(/of 2 notes on/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /What the AI reads, all together/ }))
    expect(screen.getByText(/## 学校/)).toBeInTheDocument()
    expect(screen.queryByText(/## HOA/)).not.toBeInTheDocument()
  })

  it('switches a note on or off and moves it', async () => {
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('switch', { name: 'HOA on or off' }))
    expect(hook.state.toggle).toHaveBeenCalledWith(2, true)
    expect(await screen.findByText('"HOA" is on: the AI reads it.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Move HOA up' }))
    expect(hook.state.move).toHaveBeenCalledWith(2, -1)
  })

  it('shows the sentence when the change is refused', async () => {
    hook.state.toggle.mockResolvedValue('Only an admin can change the AI knowledge.')
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('switch', { name: 'HOA on or off' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an admin can change the AI knowledge.')
  })

  it('lets someone who is not an admin read, not change', () => {
    render(<AiKnowledgeSection canEdit={false} />)
    expect(screen.queryByRole('button', { name: 'New note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move HOA up' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'HOA on or off' })).toBeDisabled()
  })

  it('warns when every note is off', () => {
    hook.state.notes = [note({ enabled: false })]
    render(<AiKnowledgeSection canEdit />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Every note is off/)
  })

  it('says the built-in text is used when there are no notes', () => {
    hook.state.notes = []
    render(<AiKnowledgeSection canEdit />)
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })
})

describe('one note', () => {
  it('saves a changed text', async () => {
    const saved = note({ body: 'New wording' })
    hook.state.save.mockResolvedValue({ error: null, note: saved })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByText('学校'))

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const box = screen.getByLabelText(/Text the AI reads/)
    await user.clear(box)
    await user.type(box, 'New wording')
    expect(save).toBeEnabled()
    await user.click(save)

    expect(hook.state.save).toHaveBeenCalledWith(1, { title: '学校', body: 'New wording', enabled: true })
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('adds a new note', async () => {
    hook.state.save.mockResolvedValue({ error: null, note: note({ id: 3, title: 'Payment', body: 'QR' }) })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(screen.getByLabelText('Title'), 'Payment')
    await user.type(screen.getByLabelText(/Text the AI reads/), 'QR')
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    expect(hook.state.save).toHaveBeenCalledWith(null, { title: 'Payment', body: 'QR', enabled: true })
  })

  it('shows why a save did not work and keeps the text', async () => {
    hook.state.save.mockResolvedValue({ error: 'Give the note a title.', note: null })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(screen.getByLabelText(/Text the AI reads/), 'QR')
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the note a title.')
    expect(screen.getByLabelText(/Text the AI reads/)).toHaveValue('QR')
  })

  it('asks before leaving with unsaved changes', async () => {
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByText('学校'))
    await user.type(screen.getByLabelText(/Text the AI reads/), ' more')
    await user.click(screen.getByRole('button', { name: /AI Knowledge/ }))
    expect(screen.getByText(/changes you have not saved/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(await screen.findByText(/of 2 notes on/)).toBeInTheDocument()
  })

  it('puts an older wording back into the box without saving it', async () => {
    hook.state.loadVersions.mockResolvedValue({
      versions: [{ id: 9, title: '学校', body: 'Old wording', writtenAt: '2026-10-12T01:00:00Z' }],
      error: null,
    })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByText('学校'))
    await user.click(screen.getByRole('button', { name: /Older versions/ }))
    await waitFor(() => expect(hook.state.loadVersions).toHaveBeenCalledWith(1))
    await user.click(await screen.findByRole('button', { name: 'Put back' }))
    expect(screen.getByLabelText(/Text the AI reads/)).toHaveValue('Old wording')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(hook.state.save).not.toHaveBeenCalled()
  })

  it('deletes only after asking', async () => {
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByText('HOA'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(hook.state.remove).not.toHaveBeenCalled()
    expect(screen.getByText(/Delete the note "HOA"/)).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(buttons[buttons.length - 1])
    await waitFor(() => expect(hook.state.remove).toHaveBeenCalledWith(2))
    expect(await screen.findByText('Note deleted.')).toBeInTheDocument()
  })

  it('is read-only for someone who is not an admin', async () => {
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit={false} />)
    await user.click(screen.getByText('学校'))
    expect(screen.getByLabelText(/Text the AI reads/)).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Older versions/ })).not.toBeInTheDocument()
  })
})

describe('learning from the chats', () => {
  const gap = { note: '缺少付款方式', count: 3, lastAt: '2026-10-13T03:00:00Z', example: '怎么付款？' }
  const example = {
    id: 11,
    createdAt: '2026-10-13T02:00:00Z',
    chatId: 3,
    lastMessageId: 7,
    category: 'info',
    parentText: '你们有什么课？',
    draft: '妈咪，孩子几岁呢？',
    sentText: '我们有 HOA 和 Holiday Camp 哦😊',
    outcome: 'replaced',
  }

  it('shows the tabs to an admin with how many things wait, and nothing to someone else', () => {
    learning.state.gaps = [gap]
    learning.state.examples = [example]
    const { unmount } = render(<AiKnowledgeSection canEdit />)
    expect(screen.getByRole('tab', { name: 'To fill in (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Replies to learn from (1)' })).toBeInTheDocument()
    unmount()
    render(<AiKnowledgeSection canEdit={false} />)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('opens a new note from a reminder, and marks the reminder done once the note is saved', async () => {
    learning.state.gaps = [gap]
    hook.state.save.mockResolvedValue({ error: null, note: note({ id: 3, title: 'Payment', body: 'QR' }) })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('tab', { name: 'To fill in (1)' }))
    expect(screen.getByText('缺少付款方式')).toBeInTheDocument()
    expect(screen.getByText(/Came up 3 times/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Write the answer' }))
    expect(screen.getByText(/The AI asked for this: 缺少付款方式/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), 'Payment')
    await user.type(screen.getByLabelText(/Text the AI reads/), 'QR')
    await user.click(screen.getByRole('button', { name: 'Add note' }))

    await waitFor(() => expect(learning.state.closeGap).toHaveBeenCalledWith('缺少付款方式'))
    expect(await screen.findByText('Saved. The AI reads it from the next draft.')).toBeInTheDocument()
  })

  it('shows the AI draft beside what the team sent and copies it into a note for review, not straight into the AI', async () => {
    learning.state.examples = [example]
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('tab', { name: 'Replies to learn from (1)' }))
    expect(screen.getByText('妈咪，孩子几岁呢？')).toBeInTheDocument()
    expect(screen.getByText('我们有 HOA 和 Holiday Camp 哦😊')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Teach the AI this' }))
    const box = screen.getByLabelText(/Text the AI reads/) as HTMLTextAreaElement
    expect(box.value).toContain('例子（家长问 → 我们回）：')
    expect(box.value).toContain('家长：你们有什么课？')
    expect(box.value).toContain('我们：我们有 HOA 和 Holiday Camp 哦😊')
    // Nothing is saved until the admin presses Save.
    expect(hook.state.save).not.toHaveBeenCalled()
    expect(learning.state.closeExample).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('puts an example away without teaching it', async () => {
    learning.state.examples = [example]
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('tab', { name: 'Replies to learn from (1)' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(learning.state.closeExample).toHaveBeenCalledWith(11)
  })

  it('shows how the drafts are doing and which kinds always need a person', async () => {
    learning.state.report = {
      drafts: 40,
      answered: 34,
      asIs: 30,
      edited: 3,
      replaced: 1,
      byCategory: [
        { category: 'info', total: 31, asIs: 30, edited: 1, replaced: 0 },
        { category: 'price', total: 3, asIs: 0, edited: 2, replaced: 1 },
      ],
    }
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('tab', { name: 'Report' }))
    expect(screen.getByText('88%')).toBeInTheDocument()
    expect(screen.getByText('Could be sent without a person')).toBeInTheDocument()
    expect(screen.getByText('Always a person')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is sent without a person today/)).toBeInTheDocument()
  })

  it('shows the chat before the reply, asks the AI why, and teaches with the chat and the reason', async () => {
    learning.state.examples = [example]
    lesson.request.mockReset().mockResolvedValue({ lesson: '家长同意价钱后，直接给一个时间确认。', error: null })
    const loadThread = vi.fn().mockResolvedValue([
      { from: 'team', text: 'HOA 现在优惠 RM38 哦' },
      { from: 'parent', text: '你们有什么课？' },
    ])
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit loadThread={loadThread} />)
    await user.click(screen.getByRole('tab', { name: 'Replies to learn from (1)' }))

    const chat = await screen.findByRole('list', { name: 'The chat before the reply' })
    expect(loadThread).toHaveBeenCalledWith(3, 7)
    expect(chat).toHaveTextContent('Team: HOA 现在优惠 RM38 哦')
    expect(chat).toHaveTextContent('Parent: 你们有什么课？')

    await user.click(screen.getByRole('button', { name: 'Ask the AI why' }))
    expect(lesson.request).toHaveBeenCalledWith({
      thread: [
        { from: 'team', text: 'HOA 现在优惠 RM38 哦' },
        { from: 'parent', text: '你们有什么课？' },
      ],
      draft: '妈咪，孩子几岁呢？',
      sent: '我们有 HOA 和 Holiday Camp 哦😊',
    })
    expect(await screen.findByDisplayValue('家长同意价钱后，直接给一个时间确认。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Teach the AI this' }))
    const box = screen.getByLabelText(/Text the AI reads/) as HTMLTextAreaElement
    expect(box.value).toContain('例子（聊天记录 → 我们回）：')
    expect(box.value).toContain('我们：HOA 现在优惠 RM38 哦')
    expect(box.value).toContain('我们回：我们有 HOA 和 Holiday Camp 哦😊')
    expect(box.value).toContain('原因：家长同意价钱后，直接给一个时间确认。')
    expect(hook.state.save).not.toHaveBeenCalled()
  })

  it('says why the AI could not explain, and still lets the admin write the reason by hand', async () => {
    learning.state.examples = [example]
    lesson.request.mockReset().mockResolvedValue({ lesson: null, error: 'Only an admin can ask for an explanation.' })
    const user = userEvent.setup()
    render(<AiKnowledgeSection canEdit />)
    await user.click(screen.getByRole('tab', { name: 'Replies to learn from (1)' }))
    await user.click(screen.getByRole('button', { name: 'Ask the AI why' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an admin can ask for an explanation.')
    // Without a connection to the chat, the parent's last message is what the AI is given.
    expect(lesson.request).toHaveBeenCalledWith(
      expect.objectContaining({ thread: [{ from: 'parent', text: '你们有什么课？' }] }),
    )
    await user.type(screen.getByPlaceholderText(/Write the rule in your own words/), '先确认时间')
    await user.click(screen.getByRole('button', { name: 'Teach the AI this' }))
    expect((screen.getByLabelText(/Text the AI reads/) as HTMLTextAreaElement).value).toContain('原因：先确认时间')
  })
})
