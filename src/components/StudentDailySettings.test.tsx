import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchDailySettings: vi.fn(),
  saveDailySettings: vi.fn(),
  saveDailyTask: vi.fn(),
}))

vi.mock('../lib/studentDaily', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/studentDaily')>()
  return { ...actual, ...api }
})

import { StudentDailySettings } from './StudentDailySettings'
import { defaultDailySettings, type DailyTask } from '../lib/studentDaily'

const tasks: DailyTask[] = [
  { id: 1, label: 'Watch a learning video', kind: 'video', target: 1, coins: 3, is_active: true, sort_order: 1 },
  { id: 2, label: 'Old task', kind: 'live_right', target: 1, coins: 3, is_active: false, sort_order: 2 },
]

beforeEach(() => {
  api.fetchDailySettings.mockReset().mockResolvedValue({ settings: defaultDailySettings, tasks })
  api.saveDailySettings.mockReset().mockResolvedValue(null)
  api.saveDailyTask.mockReset().mockResolvedValue(null)
})

describe('Daily check-in, tasks and practice in Class Settings', () => {
  it('shows the tasks, hidden ones marked', async () => {
    render(<StudentDailySettings />)
    expect(await screen.findByText('Watch a learning video')).toBeInTheDocument()
    expect(screen.getByText('Hidden')).toBeInTheDocument()
  })

  it('saves the check-in and practice settings', async () => {
    render(<StudentDailySettings />)
    const coins = await screen.findByLabelText('Coins for checking in')
    await userEvent.clear(coins)
    await userEvent.type(coins, '5')
    await userEvent.click(screen.getByLabelText('Daily practice'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.saveDailySettings).toHaveBeenCalledWith({ ...defaultDailySettings, checkin_coins: 5, practice_enabled: false })
  })

  it('will not save coins out of range', async () => {
    render(<StudentDailySettings />)
    const coins = await screen.findByLabelText('Coins for checking in')
    await userEvent.clear(coins)
    await userEvent.type(coins, '500')
    expect(screen.getByText('Check-in coins: 1 to 100.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('adds a task', async () => {
    render(<StudentDailySettings />)
    await userEvent.click(await screen.findByRole('button', { name: '+ Add a task' }))
    await userEvent.type(screen.getByLabelText('Task name'), 'Practise twice')
    await userEvent.selectOptions(screen.getByLabelText('What it counts'), 'practice')
    const times = screen.getByLabelText('Times')
    await userEvent.clear(times)
    await userEvent.type(times, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(api.saveDailyTask).toHaveBeenCalledWith({ id: null, label: 'Practise twice', kind: 'practice', target: 2, coins: 3, is_active: true })
  })

  it('hides a task instead of deleting it', async () => {
    render(<StudentDailySettings />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    await userEvent.click(screen.getByLabelText('Shown'))
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(api.saveDailyTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1, is_active: false }))
  })
})
