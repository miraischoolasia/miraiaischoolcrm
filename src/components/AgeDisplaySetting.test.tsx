import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const reload = vi.fn()
let mode: 'age' | 'grade' = 'age'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
vi.mock('../lib/ageDisplay', () => ({ useAgeDisplay: () => mode, reloadAgeDisplay: () => reload() }))

import { AgeDisplaySetting } from './AgeDisplaySetting'

describe('AgeDisplaySetting', () => {
  beforeEach(() => {
    rpc.mockReset()
    reload.mockReset()
    mode = 'age'
  })

  it('shows the school mode and switches it to grade', async () => {
    rpc.mockResolvedValue({ error: null })
    render(<AgeDisplaySetting />)

    expect(screen.getByRole('radio', { name: /Age \(9 years old\)/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /School grade/ }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_age_display', { p_mode: 'grade' }))
    expect(reload).toHaveBeenCalled()
  })

  it('says why when the database refuses', async () => {
    rpc.mockResolvedValue({ error: { message: 'Only admin can change how ages are shown.' } })
    render(<AgeDisplaySetting />)

    await userEvent.click(screen.getByRole('radio', { name: /School grade/ }))

    expect(await screen.findByText('Only admin can change how ages are shown.')).toBeInTheDocument()
  })
})
