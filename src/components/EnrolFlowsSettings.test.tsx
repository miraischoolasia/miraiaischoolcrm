import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EnrolFlowsSettings } from './EnrolFlowsSettings'
import type { Programme } from '../lib/programmes'

const mocks = vi.hoisted(() => ({ setFlow: vi.fn() }))
vi.mock('../lib/programLevels', async (importOriginal) => ({ ...(await importOriginal<object>()), setProgramLevelFlow: mocks.setFlow }))

const flow = (id: number, name: string, patch: Partial<Programme> = {}) =>
  ({ id, name, legacyKey: null, isActive: true, outcome: 'enrol', messageTemplate: '', sortOrder: id, steps: [], ...patch }) as Programme

describe('EnrolFlowsSettings', () => {
  it('picks the flow each kind of class uses, offering only the school\'s own flows that are on', async () => {
    mocks.setFlow.mockResolvedValue(null)
    const onChanged = vi.fn()
    render(
      <EnrolFlowsSettings
        levels={[
          { name: '常规班', sortOrder: 10, isActive: true, flowId: null },
          { name: '备战班', sortOrder: 20, isActive: true, flowId: 5 },
          { name: 'Old', sortOrder: 30, isActive: false, flowId: null },
        ]}
        programmes={[flow(5, '常规报名'), flow(6, '备战班报名'), flow(7, 'Off', { isActive: false }), flow(1, 'HOA class', { legacyKey: 'hoa' })]}
        onChanged={onChanged}
      />,
    )
    expect(screen.queryByLabelText('Flow for Old')).not.toBeInTheDocument()
    const regular = screen.getByLabelText('Flow for 常规班') as HTMLSelectElement
    expect(Array.from(regular.options).map((option) => option.textContent)).toEqual(['No sign-up flow', '常规报名', '备战班报名'])
    expect((screen.getByLabelText('Flow for 备战班') as HTMLSelectElement).value).toBe('5')

    await userEvent.selectOptions(regular, '5')
    expect(mocks.setFlow).toHaveBeenCalledWith('常规班', 5)
    expect(onChanged).toHaveBeenCalled()
  })

  it('waits for the database update before offering anything', () => {
    render(<EnrolFlowsSettings levels={[{ name: '常规班', sortOrder: 10, isActive: true }]} programmes={[flow(5, '常规报名')]} onChanged={vi.fn()} />)
    expect(screen.getByText(/need the database update/)).toBeInTheDocument()
  })
})
