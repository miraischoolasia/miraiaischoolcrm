import { describe, expect, it } from 'vitest'
import {
  buildImportTemplate,
  checkAnswer,
  draftProblem,
  editDistance,
  emptyQuestionDraft,
  fitsClassroom,
  matchesAnswer,
  parseQuestionImport,
  readAgeGroup,
} from './questions'

describe('matching an answer', () => {
  it('exact ignores spaces and case unless asked', () => {
    expect(matchesAnswer('  kuala   LUMPUR ', { text: 'Kuala Lumpur', match: 'exact' }, false)).toBe(true)
    expect(matchesAnswer('kuala lumpur', { text: 'Kuala Lumpur', match: 'exact' }, true)).toBe(false)
  })

  it('contains finds the words inside a longer answer', () => {
    expect(matchesAnswer('We test to find bugs early', { text: 'find bugs', match: 'contains' }, false)).toBe(true)
    expect(matchesAnswer('to be safe', { text: 'find bugs', match: 'contains' }, false)).toBe(false)
  })

  it('close forgives one letter on short words, two on longer ones', () => {
    expect(matchesAnswer('pyton', { text: 'python', match: 'close' }, false)).toBe(true)
    expect(matchesAnswer('pytn', { text: 'python', match: 'close' }, false)).toBe(false)
    expect(matchesAnswer('Kuala Lumpar', { text: 'Kuala Lumpur', match: 'close' }, false)).toBe(true)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('never matches an empty answer', () => {
    expect(matchesAnswer('   ', { text: 'a', match: 'contains' }, false)).toBe(false)
  })
})

describe('checkAnswer', () => {
  const choice = {
    kind: 'choice' as const,
    options: [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
      { text: 'C', correct: true },
    ],
    acceptedAnswers: [],
    caseSensitive: false,
  }

  it('a choice question needs exactly the correct options', () => {
    expect(checkAnswer(choice, [0, 2])).toBe('correct')
    expect(checkAnswer(choice, [0])).toBe('wrong')
    expect(checkAnswer(choice, [0, 1, 2])).toBe('wrong')
  })

  it('a fill-in answer is right or wrong; a short answer that matches nothing goes to the teacher', () => {
    const fill = { kind: 'fill' as const, options: [], acceptedAnswers: [{ text: '42', match: 'exact' as const }], caseSensitive: false }
    expect(checkAnswer(fill, '42')).toBe('correct')
    expect(checkAnswer(fill, '41')).toBe('wrong')
    expect(checkAnswer({ ...fill, kind: 'short' }, 'forty two')).toBe('teacher')
  })

  it('screenshots and links go to the teacher', () => {
    expect(checkAnswer({ ...choice, kind: 'screenshot' }, '')).toBe('teacher')
    expect(checkAnswer({ ...choice, kind: 'link' }, 'https://x.y')).toBe('teacher')
  })
})

describe('draftProblem', () => {
  it('says what is missing', () => {
    expect(draftProblem(emptyQuestionDraft())).toBe('Write the question.')
    const draft = { ...emptyQuestionDraft(), prompt: 'Pick one' }
    expect(draftProblem(draft)).toBe('Every option needs its text.')
    expect(draftProblem({ ...draft, options: [{ text: 'A', correct: false }, { text: 'B', correct: false }] })).toBe(
      'Mark at least one option as correct.',
    )
    expect(draftProblem({ ...draft, options: [{ text: 'A', correct: true }, { text: 'B', correct: false }] })).toBeNull()
    expect(draftProblem({ ...emptyQuestionDraft('fill'), prompt: 'Word?', acceptedAnswers: [] })).toBe(
      'A fill-in question needs at least one accepted answer.',
    )
    expect(draftProblem({ ...emptyQuestionDraft('link'), prompt: 'Send it', points: 0 })).toBe('Points must be from 1 to 100.')
  })
})

describe('parseQuestionImport', () => {
  it('reads the template, every row good', () => {
    const rows = parseQuestionImport(buildImportTemplate())
    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.error === null)).toBe(true)
    expect(rows[0].draft).toMatchObject({
      kind: 'choice',
      options: [
        { text: 'Repeats steps', correct: true },
        { text: 'Stops the game', correct: false },
        { text: 'Draws a picture', correct: false },
      ],
      points: 10,
      timeLimitSeconds: 30,
      topic: 'Coding basics',
    })
    expect(rows[2].draft?.acceptedAnswers).toEqual([
      { text: 'Kuala Lumpur', match: 'close' },
      { text: 'KL', match: 'close' },
    ])
  })

  it('reads rows pasted from a spreadsheet (tabs)', () => {
    const rows = parseQuestionImport('type\tquestion\tanswers\nfill\t6 x 7?\t42')
    expect(rows).toEqual([
      {
        row: 2,
        error: null,
        draft: expect.objectContaining({ kind: 'fill', prompt: '6 x 7?', acceptedAnswers: [{ text: '42', match: 'exact' }] }),
      },
    ])
  })

  it('names the row and the problem', () => {
    const rows = parseQuestionImport('type,question,options\nquiz,Hi,\nchoice,Pick,A | B')
    expect(rows[0]).toMatchObject({ row: 2, draft: null, error: expect.stringContaining('Unknown type "quiz"') })
    expect(rows[1]).toMatchObject({ row: 3, draft: null, error: 'Mark at least one option as correct.' })
  })

  it('needs the column names first', () => {
    expect(parseQuestionImport('choice,Pick')[0].error).toContain('The first row must name the columns')
  })
})

describe('subjects and ages', () => {
  const coding = { id: 1, name: 'Coding', sortOrder: 10, isActive: true }
  const maths = { id: 2, name: 'Maths', sortOrder: 20, isActive: true }
  const codingClass = { subjectId: 1, ageGroup: '9-11 Years Old' as const }

  it('fits a class by subject and age group', () => {
    expect(fitsClassroom({ subjectId: 1, ageGroups: ['9-11 Years Old'] }, codingClass)).toBe(true)
    expect(fitsClassroom({ subjectId: 1, ageGroups: ['15-17 Years Old'] }, codingClass)).toBe(false)
    expect(fitsClassroom({ subjectId: 2, ageGroups: [] }, codingClass)).toBe(false)
    expect(fitsClassroom({ subjectId: null, ageGroups: [] }, codingClass)).toBe(true)
    expect(fitsClassroom({ subjectId: 2, ageGroups: [] }, { subjectId: null, ageGroup: '6-8 Years Old' })).toBe(true)
  })

  it('reads age groups written short or long', () => {
    expect(readAgeGroup('9-11')).toBe('9-11 Years Old')
    expect(readAgeGroup(' 12 - 14 years old ')).toBe('12-14 Years Old')
    expect(readAgeGroup('7')).toBeNull()
  })

  it('imports the subject by name and the ages', () => {
    const rows = parseQuestionImport('type,question,answers,subject,ages\nfill,6 x 7?,42,maths,6-8 | 9-11 | 6-8', [coding, maths])
    expect(rows[0].draft).toMatchObject({ subjectId: 2, ageGroups: ['6-8 Years Old', '9-11 Years Old'] })
  })

  it('names an unknown subject or age', () => {
    const rows = parseQuestionImport('type,question,answers,subject,ages\nfill,A?,a,Art,\nfill,B?,b,,10', [coding])
    expect(rows[0].error).toContain('Unknown subject "Art"')
    expect(rows[1].error).toContain('Unknown age group "10"')
  })
})

