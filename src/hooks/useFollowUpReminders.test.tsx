import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarItem } from '../lib/calendarItems'
import { useFollowUpReminders } from './useFollowUpReminders'

const alerts = vi.hoisted(() => ({ playAlertSound: vi.fn(), showDesktopAlert: vi.fn() }))
vi.mock('../lib/inboxAlerts', () => ({ isSoundOn: () => true, ...alerts }))

const item = (id: number, change: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  kind: 'task',
  title: `Follow up ${id}`,
  notes: null,
  date: '2026-10-17',
  startTime: '15:00',
  endTime: null,
  zoomLink: null,
  assigneeId: 1,
  leadId: 11,
  isDone: false,
  createdBy: 1,
  ...change,
})

describe('useFollowUpReminders', () => {
  let clock = new Date(2026, 9, 17, 14, 50)
  const now = () => clock

  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    alerts.playAlertSound.mockClear()
    alerts.showDesktopAlert.mockClear()
    clock = new Date(2026, 9, 17, 14, 50)
  })
  afterEach(() => vi.useRealTimers())

  it('rings once when the time comes, and not before', () => {
    const items = [item(1)]
    const { result } = renderHook(() => useFollowUpReminders(items, 1, now))

    expect(result.current.due).toEqual([])
    expect(alerts.playAlertSound).not.toHaveBeenCalled()

    clock = new Date(2026, 9, 17, 15, 1)
    act(() => void vi.advanceTimersByTime(20_000))
    expect(result.current.due.map((entry) => entry.id)).toEqual([1])
    expect(alerts.playAlertSound).toHaveBeenCalledTimes(1)
    expect(alerts.showDesktopAlert).toHaveBeenCalledWith('Follow up 1', 'Time to write to this parent again.')

    act(() => void vi.advanceTimersByTime(20_000))
    expect(alerts.playAlertSound).toHaveBeenCalledTimes(1)
  })

  it('goes quiet when put off, and rings again when the snooze is over', () => {
    clock = new Date(2026, 9, 17, 15, 1)
    const items = [item(1)]
    const { result } = renderHook(() => useFollowUpReminders(items, 1, now))
    expect(alerts.playAlertSound).toHaveBeenCalledTimes(1)

    act(() => result.current.snooze(1, new Date(2026, 9, 17, 15, 11).getTime()))
    expect(result.current.due).toEqual([])
    expect(JSON.parse(window.localStorage.getItem('followup-snoozed-until') ?? '{}')).toEqual({ 1: new Date(2026, 9, 17, 15, 11).getTime() })

    clock = new Date(2026, 9, 17, 15, 12)
    act(() => void vi.advanceTimersByTime(20_000))
    expect(result.current.due.map((entry) => entry.id)).toEqual([1])
    expect(alerts.playAlertSound).toHaveBeenCalledTimes(2)
  })

  it("does not ring for someone else's follow-up", () => {
    clock = new Date(2026, 9, 17, 15, 1)
    const items = [item(1, { assigneeId: 2 })]
    const { result } = renderHook(() => useFollowUpReminders(items, 1, now))

    expect(result.current.due).toEqual([])
    expect(alerts.playAlertSound).not.toHaveBeenCalled()
  })
})
