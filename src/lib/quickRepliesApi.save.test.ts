import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  uploads: [] as string[],
  inserted: [] as Record<string, unknown>[],
  scope: [] as string[],
}))

vi.mock('./supabase', () => {
  const lastQuery = {
    eq: (column: string, value: string) => {
      calls.scope.push(`${column}=${value}`)
      return lastQuery
    },
    is: (column: string) => {
      calls.scope.push(`${column} is null`)
      return lastQuery
    },
    order: () => lastQuery,
    limit: async () => ({ data: [{ sort_order: 30 }] }),
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      storage: {
        from: () => ({
          upload: async (path: string) => {
            calls.uploads.push(path)
            return { error: null }
          },
          remove: async () => ({ error: null }),
        }),
      },
      from: () => ({
        select: () => lastQuery,
        insert: async (row: Record<string, unknown>) => {
          calls.inserted.push(row)
          return { error: null }
        },
      }),
    },
  }
})

import { saveQuickReply } from './quickRepliesApi'

beforeEach(() => {
  calls.uploads.length = 0
  calls.inserted.length = 0
  calls.scope.length = 0
})

describe('saveQuickReply', () => {
  it('saves a personal reply for the signed-in person, files under their own folder, at the end of their own list', async () => {
    const file = new File(['x'], 'map.png', { type: 'image/png' })
    await saveQuickReply(null, {
      title: 'Mine',
      steps: [
        { kind: 'text', text: 'Hi' },
        { kind: 'file', file },
      ],
      isActive: true,
      personal: true,
    })

    expect(calls.inserted[0]).toMatchObject({ title: 'Mine', owner_id: 'user-1', sort_order: 40 })
    expect(calls.uploads[0]).toMatch(/^u\/user-1\/.+\.png$/)
    expect(calls.scope).toEqual(['owner_id=user-1'])
  })

  it('saves a team reply with no owner, files at the top of the bucket, at the end of the team list', async () => {
    const file = new File(['x'], 'map.png', { type: 'image/png' })
    await saveQuickReply(null, { title: 'Team', steps: [{ kind: 'file', file }], isActive: true })

    expect(calls.inserted[0]).toMatchObject({ title: 'Team', owner_id: null, sort_order: 40 })
    expect(calls.uploads[0]).not.toContain('/')
    expect(calls.scope).toEqual(['owner_id is null'])
  })
})
