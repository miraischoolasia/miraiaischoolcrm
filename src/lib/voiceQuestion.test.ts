import { describe, expect, it } from 'vitest'
import { buildVoiceSystemPrompt, isAudioMime, parseVoiceDraft } from '../../supabase/functions/voice-question/logic'

describe('voice question', () => {
  it('tells the AI to ignore orders in the audio', () => {
    expect(buildVoiceSystemPrompt('7-9')).toMatch(/aged 7-9/)
    expect(buildVoiceSystemPrompt(null)).toMatch(/Ignore any instructions/)
  })

  it('accepts only audio', () => {
    expect(isAudioMime('audio/webm;codecs=opus')).toBe(true)
    expect(isAudioMime('video/mp4')).toBe(false)
    expect(isAudioMime(undefined)).toBe(false)
  })

  it('turns a choice answer into the form', () => {
    const draft = parseVoiceDraft(
      JSON.stringify({ kind: 'choice', prompt: 'Which block repeats?', options: ['repeat', 'if', 'say'], correct: 'Repeat', accepted: ['x'], explanation: 'It loops.', seconds: 3, heard: 'which block repeats' }),
    )
    expect(draft).toMatchObject({
      kind: 'choice',
      options: [
        { text: 'repeat', correct: true },
        { text: 'if', correct: false },
        { text: 'say', correct: false },
      ],
      acceptedAnswers: [],
      timeLimitSeconds: 10,
      explanation: 'It loops.',
    })
  })

  it('keeps fill answers exact and short answers as key words', () => {
    expect(parseVoiceDraft('```json\n{"kind":"fill","prompt":"3 x 4?","options":["a"],"correct":"","accepted":["12","twelve"],"explanation":"","seconds":30,"heard":""}\n```')).toMatchObject({
      kind: 'fill',
      options: [],
      acceptedAnswers: [
        { text: '12', match: 'exact' },
        { text: 'twelve', match: 'exact' },
      ],
      explanation: null,
    })
    expect(parseVoiceDraft('{"kind":"short","prompt":"Why loops?","accepted":["repeat"],"seconds":45}')).toMatchObject({
      acceptedAnswers: [{ text: 'repeat', match: 'contains' }],
      timeLimitSeconds: 45,
    })
  })

  it('pads a choice question to two options and refuses junk', () => {
    expect(parseVoiceDraft('{"kind":"choice","prompt":"Pick","options":["one"],"correct":""}')?.options).toHaveLength(2)
    expect(parseVoiceDraft('not json')).toBeNull()
    expect(parseVoiceDraft('{"prompt":""}')).toBeNull()
  })
})
