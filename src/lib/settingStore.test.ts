import { beforeEach, describe, expect, it, vi } from 'vitest'

type AuthListener = (event: string) => void

const state = vi.hoisted(() => ({
  session: null as unknown,
  result: { data: null as unknown, error: null as unknown },
  listener: null as null | ((event: string) => void),
  selects: 0,
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (listener: AuthListener) => {
        state.listener = listener
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.selects += 1
            return state.result
          },
        }),
      }),
    }),
  },
}))

import { createSettingStore } from './settingStore'

const read = (value: unknown) => (value && typeof value === 'object' && (value as { mode?: string }).mode === 'grade' ? 'grade' : 'age')

describe('createSettingStore', () => {
  beforeEach(() => {
    state.session = null
    state.result = { data: null, error: null }
    state.listener = null
    state.selects = 0
  })

  it('reads nothing before anybody is signed in', async () => {
    const store = createSettingStore('age_display', read, 'age')
    await store.reload()
    expect(state.selects).toBe(0)
  })

  it('does not cache a failed read: the next try reads again', async () => {
    const store = createSettingStore('age_display', read, 'age')
    state.session = { user: {} }
    state.result = { data: null, error: { message: '401' } }
    await store.reload()
    state.result = { data: { value: { mode: 'grade' } }, error: null }
    await store.reload()
    expect(state.selects).toBe(2)
  })

  it('treats a missing row as the default', async () => {
    const store = createSettingStore('age_display', read, 'age')
    state.session = { user: {} }
    await expect(store.reload()).resolves.toBeUndefined()
    expect(state.selects).toBe(1)
  })
})
