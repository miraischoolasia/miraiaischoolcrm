import { describe, expect, it } from 'vitest'
import {
  buildFacts,
  buildSystemPrompt,
  defaultReportSettings,
  firstNameOf,
  parseReport,
  readSettings,
  type StudentFacts,
} from '../../supabase/functions/student-report/logic'

const facts: StudentFacts = {
  firstName: 'Ali',
  age: 10,
  className: 'FRI Coding C007',
  lessons: [
    {
      date: '2026-10-09',
      status: 'Present',
      attended: true,
      scores: [{ criterion: 'Problem Solving', score: 4, max: 5, remark: null }],
      lessonRemark: 'Finished the maze',
    },
    {
      date: '2026-10-02',
      status: 'Present',
      attended: true,
      scores: [{ criterion: 'Problem Solving', score: 2, max: 5, remark: 'Gave up early' }],
      lessonRemark: null,
    },
    { date: '2026-09-25', status: 'Absent', attended: false, scores: [], lessonRemark: null },
  ],
  points: { total: 35, recent: ['Great answer (+5)'] },
}

describe('student report facts', () => {
  it('sends only the first name', () => {
    expect(firstNameOf('  Ali bin Ahmad ')).toBe('Ali')
    expect(firstNameOf('')).toBe('The student')
  })

  it('writes attendance, ratings with their trend, notes and points', () => {
    const text = buildFacts(facts, defaultReportSettings.sources)
    expect(text).toContain('Student: Ali, 10 years old')
    expect(text).toContain('Attendance over the last 3 lessons: Absent 1, Present 2')
    expect(text).toContain('- Problem Solving: 3.0 out of 5, 2.0 -> 4.0')
    expect(text).toContain('2026-10-02 (Problem Solving): Gave up early')
    expect(text).toContain('2026-10-09: Finished the maze')
    expect(text).toContain('Reward points: 35')
  })

  it('leaves out the sources the school switched off', () => {
    const text = buildFacts(facts, { reviews: true, remarks: false, attendance: false, points: false })
    expect(text).toContain('Problem Solving')
    expect(text).not.toContain('Gave up early')
    expect(text).not.toContain('Attendance')
    expect(text).not.toContain('Reward points')
  })
})

describe('student report prompt and answer', () => {
  it('writes in the school language with its own guidance', () => {
    const prompt = buildSystemPrompt('parent', { ...defaultReportSettings, language: '中文', instructions: 'Mention the coding project.' }, 'Mirai AI School')
    expect(prompt).toContain('Write everything in 中文.')
    expect(prompt).toContain("parent")
    expect(prompt).toContain("The school's own guidance: Mention the coding project.")
  })

  it('reads settings with safe defaults', () => {
    expect(readSettings(null)).toEqual(defaultReportSettings)
    expect(readSettings({ sources: { points: false }, language: ' Bahasa Melayu ' })).toEqual({
      sources: { reviews: true, remarks: true, attendance: true, points: false },
      language: 'Bahasa Melayu',
      instructions: '',
    })
  })

  it('keeps a good answer and drops an unusable one', () => {
    expect(
      parseReport('```json\n{"summary": "Doing well.", "strengths": ["Logic", 3, ""], "needs": [], "next_steps": ["Try loops"], "message": "Great job!"}\n```'),
    ).toEqual({ summary: 'Doing well.', strengths: ['Logic'], needs: [], next_steps: ['Try loops'], message: 'Great job!' })
    expect(parseReport('not json')).toBeNull()
    expect(parseReport('{"summary": ""}')).toBeNull()
  })
})
