import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatDay } from '@/lib/format'
import { fetchClassQuestionHistory, optionText, type HistoryLesson, type HistoryQuestion } from '@/lib/lessonReport'
import { Card, colors, Empty, Heading, Loading, Muted } from '@/ui/kit'

const resultLook: Record<HistoryQuestion['result'], { label: string; color: string; background: string }> = {
  correct: { label: 'Right', color: colors.good, background: colors.goodBg },
  wrong: { label: 'Wrong', color: colors.bad, background: '#fef2f2' },
  pending: { label: 'Waiting for the teacher', color: colors.warn, background: colors.warnBg },
  unanswered: { label: 'Not answered', color: colors.muted, background: '#f1f5f9' },
}

// A class's questions lesson by lesson (the subject's Room in the videos
// page): each question, the child's own answer, right or wrong, and the right
// answer (only questions the teacher has shown).
export function QuestionHistory({ studentId, classroomId }: { studentId: number; classroomId: number }) {
  const [lessons, setLessons] = useState<HistoryLesson[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchClassQuestionHistory(studentId, classroomId)
      .then((found) => {
        if (!alive) return
        setLessons(found)
        setError(null)
      })
      .catch((problem: Error) => alive && setError(problem.message))
    return () => {
      alive = false
    }
  }, [classroomId, studentId])

  if (error) return <Empty>{error}</Empty>
  if (!lessons) return <Loading />
  if (lessons.length === 0) return <Empty>No questions in this class yet.</Empty>

  return (
    <View style={styles.list}>
      {lessons.map((lesson) => {
        const right = lesson.questions.filter((question) => question.result === 'correct').length
        return (
          <Card key={lesson.session_id}>
            <View style={styles.lessonHead}>
              <Heading>{formatDay(lesson.date)}</Heading>
              <Muted>
                {right}/{lesson.questions.length} right
              </Muted>
            </View>
            {lesson.questions.map((question) => (
              <QuestionRow key={question.number} question={question} />
            ))}
          </Card>
        )
      })}
    </View>
  )
}

function QuestionRow({ question }: { question: HistoryQuestion }) {
  const look = resultLook[question.result]
  const options = (question.options ?? []) as ({ text: string } | string)[]
  const mine =
    question.my_choices && question.my_choices.length > 0
      ? question.my_choices.map((index) => optionText(options[index])).join(', ')
      : (question.my_text ?? '')
  const correct =
    question.correct_options && question.correct_options.length > 0
      ? question.correct_options.map((index) => optionText(options[index])).join(', ')
      : (question.accepted_answers ?? []).join(' / ')
  return (
    <View style={styles.question}>
      <View style={styles.questionHead}>
        <Text style={styles.number}>{question.number}</Text>
        <Text style={styles.prompt}>{question.prompt}</Text>
      </View>
      <View style={styles.answerRow}>
        <View style={[styles.pill, { backgroundColor: look.background }]}>
          <Text style={[styles.pillText, { color: look.color }]}>{look.label}</Text>
        </View>
        {question.my_points > 0 && <Text style={styles.points}>+{question.my_points}</Text>}
      </View>
      {mine ? <Text style={styles.line}>My answer: {mine}</Text> : null}
      {correct && question.result !== 'correct' ? <Text style={[styles.line, { color: colors.good }]}>Right answer: {correct}</Text> : null}
      {question.feedback ? <Text style={styles.feedback}>{question.feedback}</Text> : null}
      {question.explanation ? <Muted>{question.explanation}</Muted> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  lessonHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  question: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  questionHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  number: { minWidth: 24, height: 24, borderRadius: 8, backgroundColor: '#f1f5f9', textAlign: 'center', lineHeight: 24, fontWeight: '800', color: colors.text },
  prompt: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 32 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '800' },
  points: { fontSize: 13, fontWeight: '800', color: '#d97706' },
  line: { paddingLeft: 32, fontSize: 14, color: colors.text },
  feedback: { paddingLeft: 32, fontSize: 14, color: '#4338ca', fontStyle: 'italic' },
})
