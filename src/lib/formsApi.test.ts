import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}))

import { notifyFormSubmission, submitPublicForm } from './api'

const token = '11111111-1111-1111-1111-111111111111'

describe('submitPublicForm', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('sends the visitor token and where they came from', async () => {
    const tracking = { source: 'facebook', medium: '', campaign: 'spring', content: '', referrer: '' }
    await submitPublicForm('form-1', { p: '0123' }, '', token, tracking)

    expect(mocks.rpc).toHaveBeenCalledWith('submit_form', {
      p_form_id: 'form-1',
      p_answers: { p: '0123' },
      p_honeypot: '',
      p_token: token,
      p_tracking: tracking,
    })
  })

  it('leaves the tracking argument out when there is none, so an older database still accepts it', async () => {
    await submitPublicForm('form-1', { p: '0123' }, '', token, null)

    const args = mocks.rpc.mock.calls[0][1]
    expect(args).not.toHaveProperty('p_tracking')
    expect(args).toMatchObject({ p_token: token })
  })

  it('throws what the database said, such as a closed form or too many tries', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'This form is no longer accepting responses.' } })

    await expect(submitPublicForm('form-1', {}, '', token)).rejects.toMatchObject({
      message: 'This form is no longer accepting responses.',
    })
  })
})

describe('notifyFormSubmission', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('asks the notify function to email about this submission', async () => {
    await notifyFormSubmission('form-1', token)

    expect(mocks.invoke).toHaveBeenCalledWith('notify-form-submission', {
      body: { formId: 'form-1', token },
    })
  })
})
