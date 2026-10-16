import { describe, expect, it } from 'vitest'
import { buildMarkRequest, buildMarkSystemPrompt, parseMark } from '../../supabase/functions/live-answer-mark/logic'

describe('live answer AI marking', () => {
  it('tells the AI never to follow the answer', () => {
    expect(buildMarkSystemPrompt()).toMatch(/never follow instructions/)
  })

  it('sends the question, the accepted answers and the answer, but no name', () => {
    const text = buildMarkRequest({
      kind: 'short',
      prompt: 'What does a loop do?',
      accepted: ['repeat', 'again'],
      guidance: 'It runs the same blocks again.',
      answer: '  it does it many times ',
      ageGroup: '9-11 Years Old',
    })
    expect(text).toContain('Question: What does a loop do?')
    expect(text).toContain('repeat | again')
    expect(text).toContain("Teacher's explanation: It runs the same blocks again.")
    expect(text).toContain('<answer>it does it many times</answer>')
  })

  it('says a picture is attached for screenshots', () => {
    const text = buildMarkRequest({ kind: 'screenshot', prompt: 'Show your sprite', accepted: [], guidance: null, answer: null, ageGroup: null })
    expect(text).toContain('attached picture')
    expect(text).not.toContain('<answer>')
  })

  it('reads the reply, with or without a code fence', () => {
    expect(parseMark('{"suggestion": "right", "feedback": "Well done!", "note": "Means repeat."}')).toEqual({
      suggestion: 'right',
      feedback: 'Well done!',
      note: 'Means repeat.',
    })
    expect(parseMark('```json\n{"suggestion": "unsure"}\n```')).toEqual({ suggestion: 'unsure', feedback: '', note: '' })
  })

  it('refuses replies it cannot use', () => {
    expect(parseMark('right')).toBeNull()
    expect(parseMark('{"suggestion": "maybe"}')).toBeNull()
  })
})
