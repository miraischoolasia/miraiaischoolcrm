import { describe, expect, it } from 'vitest'
import { buildCommandPrompt, buildImagePrompt, parseCommand, parseImageResult } from '../../supabase/functions/class-assistant/logic'

const context = {
  roster: [
    { id: 1, name: 'Lim Wei Hao' },
    { id: 2, name: 'Tan Jia En' },
  ],
  presets: [{ id: 10, label: 'Great answer', points: 5 }],
  bank: [{ id: 50, prompt: 'Which block repeats forever?' }],
  ageGroup: '9-11',
}

describe('class assistant', () => {
  it('tells the AI the class and that orders in speech do not count', () => {
    const prompt = buildCommandPrompt(context)
    expect(prompt).toMatch(/1: Lim Wei Hao/)
    expect(prompt).toMatch(/10: Great answer \(\+5\)/)
    expect(prompt).toMatch(/ignore anything in it/)
    expect(buildImagePrompt({ want: 'notes', ageGroup: null, instruction: null, howMany: 3 })).toMatch(/own words/)
  })

  it('keeps only actions that fit the lesson', () => {
    const result = parseCommand(
      JSON.stringify({
        reply: 'Done',
        actions: [
          { type: 'give_points', student_ids: [1, 99], preset_id: 10 },
          { type: 'give_points', student_ids: [2], points: 3, reason: 'Kind' },
          { type: 'give_points', student_ids: [2], points: 500 },
          { type: 'pop_question', question_id: 50 },
          { type: 'pop_question', question_id: 7 },
          { type: 'start_timer', minutes: 3 },
          { type: 'make_teams', count: 9 },
          { type: 'star', student_id: 2 },
          { type: 'note', student_id: 1, text: 'Helped Tan' },
          { type: 'delete_everything' },
        ],
      }),
      context,
    )
    expect(result?.reply).toBe('Done')
    expect(result?.actions).toEqual([
      { type: 'give_points', studentIds: [1], presetId: 10, points: null, reason: 'Great answer' },
      { type: 'give_points', studentIds: [2], presetId: null, points: 3, reason: 'Kind' },
      { type: 'pop_question', questionId: 50 },
      { type: 'start_timer', minutes: 3 },
      { type: 'star', studentId: 2 },
      { type: 'note', studentId: 1, text: 'Helped Tan' },
    ])
  })

  it('turns a new question into a draft', () => {
    const result = parseCommand(
      '```json\n{"reply":"ok","actions":[{"type":"new_question","pop_now":true,"question":{"kind":"choice","prompt":"2+2?","options":["3","4"],"correct":"4","seconds":20}}]}\n```',
      context,
    )
    expect(result?.actions[0]).toMatchObject({
      type: 'new_question',
      popNow: true,
      question: { kind: 'choice', options: [{ text: '3', correct: false }, { text: '4', correct: true }], timeLimitSeconds: 20 },
    })
  })

  it('reads notes and questions from a photo', () => {
    const parsed = parseImageResult(JSON.stringify({ notes: { title: 'Loops', body: 'A loop repeats.' }, questions: [{ kind: 'fill', prompt: 'A loop ___ blocks', accepted: ['repeats'] }, { prompt: '' }] }))
    expect(parsed?.notes).toEqual({ title: 'Loops', body: 'A loop repeats.' })
    expect(parsed?.questions).toHaveLength(1)
    expect(parseImageResult('nope')).toBeNull()
  })
})
