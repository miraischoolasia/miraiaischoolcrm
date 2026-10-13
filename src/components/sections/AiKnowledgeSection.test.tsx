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
