import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WA_LABEL_SYNC,
  readWaLabelBudget,
  readWaLabelSync,
  readWaLabelSyncRun,
  waLabelSyncError,
  waLabelSyncRow,
} from './waLabelSync'

describe('WhatsApp label sync settings', () => {
  it('reads the school setting with the defaults for what is missing, and writes it back the same', () => {
    expect(readWaLabelSync(null)).toEqual(DEFAULT_WA_LABEL_SYNC)
    const settings = readWaLabelSync({
      enabled: true,
      max_labels: 18,
      pic_prefix: '🙋 ',
      pic_color: 3,
      per_night: 200,
      gap_seconds: 5,
      inboxes: { '4': { tag_ids: [7, 9] }, bad: { tag_ids: [1] }, '5': {} },
    })
    expect(settings).toEqual({ enabled: true, maxLabels: 18, picPrefix: '🙋 ', picColor: 3, perNight: 200, gapSeconds: 5, inboxes: { 4: [7, 9] } })
    expect(waLabelSyncRow(settings)).toEqual({
      enabled: true,
      max_labels: 18,
      pic_prefix: '🙋 ',
      pic_color: 3,
      per_night: 200,
      gap_seconds: 5,
      inboxes: { '4': { tag_ids: [7, 9] } },
    })
  })

  it('says what is wrong before saving', () => {
    expect(waLabelSyncError(DEFAULT_WA_LABEL_SYNC)).toBeNull()
    expect(waLabelSyncError({ ...DEFAULT_WA_LABEL_SYNC, maxLabels: 0 })).toBe('Labels per number are 1 to 60.')
    expect(waLabelSyncError({ ...DEFAULT_WA_LABEL_SYNC, picPrefix: '123456789' })).toBe('Keep the Handled-by prefix to 8 characters.')
    expect(waLabelSyncError({ ...DEFAULT_WA_LABEL_SYNC, perNight: 5000 })).toBe('Chats per night are 1 to 2000.')
    expect(waLabelSyncError({ ...DEFAULT_WA_LABEL_SYNC, gapSeconds: 0 })).toBe('The gap between chats is 1 to 30 seconds.')
  })

  it("reads a number's budget and the night's report", () => {
    expect(readWaLabelBudget(null)).toBeNull()
    expect(
      readWaLabelBudget({
        max_labels: 20,
        chats: 12,
        ticked: false,
        pic_color: 9,
        pics: [{ id: 1, name: '👤 Amy', chats: 8 }],
        tags_in: [{ id: 5, name: 'VIP', color: '#ff0000', chats: 6 }],
        tags_out: [{ id: 6, name: 'Old', chats: 1, why: 'full' }],
      }),
    ).toEqual({
      maxLabels: 20,
      chats: 12,
      ticked: false,
      picColor: 9,
      pics: [{ id: 1, name: '👤 Amy', chats: 8 }],
      tagsIn: [{ id: 5, name: 'VIP', color: '#ff0000', chats: 6 }],
      tagsOut: [{ id: 6, name: 'Old', chats: 1, why: 'full' }],
    })
    const run = readWaLabelSyncRun({
      inbox_id: 4,
      started_at: '2026-10-24T20:00:00Z',
      finished_at: '2026-10-24T20:10:00Z',
      dry_run: false,
      summary: { chats_planned: 10, chats_done: 9, chats_failed: 1, labels_added: 14, tags_left_out: ['Old', { name: 'Cold' }], stopped: '' },
    })
    expect(run).toMatchObject({ chatsPlanned: 10, chatsDone: 9, chatsFailed: 1, chatsNoNumber: 0, labelsAdded: 14, tagsLeftOut: ['Old', 'Cold'], stopped: null })
  })
})
