import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarLayoutSetting } from './CalendarLayoutSetting'

const mocks = vi.hoisted(() => ({
  saveLayout: vi.fn(async () => null),
  saveWeekly: vi.fn(async () => null),
}))

vi.mock('../lib/calendarLayout', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchCalendarLayout: async () => 'auto',
  fetchMonthWeekly: async () => false,
  saveCalendarLayout: mocks.saveLayout,
  saveMonthWeekly: mocks.saveWeekly,
}))

describe('CalendarLayoutSetting', () => {
  it('turns the weekly classes on the month calendar on, saving only that', async () => {
    const onSaved = vi.fn()
    render(<CalendarLayoutSetting onSaved={onSaved} />)

    const box = await screen.findByRole('checkbox', { name: /Show weekly classes on the month calendar/ })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocks.saveWeekly).toHaveBeenCalledWith(true)
    expect(mocks.saveLayout).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith('auto', true)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
