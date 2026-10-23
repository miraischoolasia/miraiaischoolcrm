import { describe, expect, it } from 'vitest'
import { PARENT_TEXTS } from './classQuality'
import { cardText, monthName, summarizeCard, type CardData, type CardLesson } from './progressCards'

const lesson = (date: string, extra: Partial<CardLesson> = {}): CardLesson => ({
  sessionId: Number(date.replace(/-/g, '')),
  date,
  classroom: 'F1 Math',
  teacher: 'Teacher Lina',
  status: 'present',
  attended: true,
  hasZoom: true,
  participation: 90,
  questions: 5,
  correct: 4,
  wrong: 1,
  points: 40,
  ...extra,
})

const card = (lessons: CardLesson[], words: CardData['words'] = []): CardData => ({
  student: { id: 1, name: 'Aiden Lim', code: null, consultant: 'Amy', sendTo: { phone: '60123456789', name: 'Mrs Lim', contactId: null } },
  month: '2026-10-01',
  lessons,
  words,
  sentAt: null,
})

describe('the month on one card', () => {
  const data = card(
    [
      lesson('2026-09-10', { questions: 10, correct: 5, wrong: 5 }),
      // 3 of 5 right, one question not answered.
      lesson('2026-10-02', { correct: 3, wrong: 1, participation: 80 }),
      lesson('2026-10-09', { attended: false, status: 'absent', participation: null, correct: 0, wrong: 0, points: 0 }),
      lesson('2026-10-16', { correct: 5, wrong: 0, participation: 100 }),
    ],
    [{ date: '2026-10-16', teacher: 'Teacher Lina', text: 'Great focus on fractions.' }],
  )

  it('counts each quiz as right of how many, and compares with the month before', () => {
    expect(summarizeCard(data)).toMatchObject({
      lessons: 3,
      attended: 2,
      // The missed lesson's quiz is not counted.
      correct: 8,
      questions: 10,
      improved: true,
      participation: 90,
      classes: ['F1 Math'],
      trend: [
        { date: '2026-10-02', correct: 3, total: 5 },
        { date: '2026-10-16', correct: 5, total: 5 },
      ],
      words: { text: 'Great focus on fractions.' },
    })
  })

  it('fills in the school’s text, in Chinese by default', () => {
    expect(cardText(PARENT_TEXTS.zh.card, data, summarizeCard(data), 'EduHero')).toBe(
      [
        '📚 Aiden Lim（F1 Math）10月学习报告',
        '✅ 出席：2/3 堂课',
        '📝 Quiz 成绩：答对 8/10 题，比上个月进步了 👍',
        '⏱️ 上课时间：90%',
        '💬 Teacher Lina：「Great focus on fractions.」',
        '',
        '谢谢您的支持，我们一起继续加油！— EduHero',
      ].join('\n'),
    )
  })

  it('or in English', () => {
    expect(cardText(PARENT_TEXTS.en.card, data, summarizeCard(data), 'Mirai AI School', 'en')).toMatch(
      /October 2026 progress \(F1 Math\)\n✅ Attended 2 of 3 classes\n📝 Quiz: 8\/10 answers right \(better than last month\)/,
    )
  })

  it('leaves out a line with nothing to fill, and never says "worse than last month"', () => {
    const quiet = card([lesson('2026-09-10'), lesson('2026-10-02', { questions: 4, correct: 1, wrong: 3 })])
    const text = cardText(PARENT_TEXTS.zh.card, quiet, summarizeCard(quiet), 'Mirai AI School')
    expect(summarizeCard(quiet).improved).toBe(false)
    expect(text).toMatch(/答对 1\/4 题\n/)
    expect(text).not.toMatch(/进步|💬/)
    const noQuiz = card([lesson('2026-10-02', { questions: 0, correct: 0, wrong: 0 })])
    expect(cardText(PARENT_TEXTS.zh.card, noQuiz, summarizeCard(noQuiz), 'Mirai AI School')).not.toMatch(/Quiz/)
  })

  it('names the month', () => {
    expect(monthName('2026-10-01')).toBe('October 2026')
  })
})
