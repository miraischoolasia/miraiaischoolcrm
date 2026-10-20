import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { practiceAnswer, practiceNext, type PracticeNext, type PracticeResult } from '@/lib/daily'

import { formatDay } from '@/lib/format'
import { choiceLetter } from '@/lib/live'
import { Body, Button, Card, colors, Empty, Loading, Muted, Screen, Title } from '@/ui/kit'

// Daily practice: the choice and fill-in questions the child's teachers
// asked in class, one at a time, right or wrong at once with the right
// answer; a few coins for each right one, up to the school's number a day.
// The practice page (app/(app)/practice.tsx) and the development page use it.
export type PracticeApi = {
  next: (studentId: number) => Promise<PracticeNext>
  answer: (studentId: number, questionId: number, answer: { choices: number[] } | { text: string }) => Promise<PracticeResult>
}

const liveApi: PracticeApi = { next: practiceNext, answer: practiceAnswer }

export function PracticeView({
  studentId,
  color,
  onCoins,
  onBack,
  api = liveApi,
}: {
  studentId: number | null
  color: string
  onCoins: () => void
  onBack: () => void
  api?: PracticeApi
}) {
  const [next, setNext] = useState<PracticeNext | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [text, setText] = useState('')
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!studentId) return
    try {
      const value = await api.next(studentId)
      setNext(value)
      setPicked([])
      setText('')
      setResult(null)
      setError(null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not load the practice.')
    }
  }, [api, studentId])

  async function goNext() {
    setBusy(true)
    await load()
    setBusy(false)
  }

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    api.next(studentId).then(
      (value) => !cancelled && setNext(value),
      (problem: unknown) => !cancelled && setError(problem instanceof Error ? problem.message : 'Could not load the practice.'),
    )
    return () => {
      cancelled = true
    }
  }, [api, studentId])

  async function send() {
    const question = next?.question
    if (!studentId || !question) return
    setBusy(true)
    try {
      const answer = question.kind === 'choice' ? { choices: picked } : { text: text.trim() }
      const outcome = await api.answer(studentId, question.id, answer)
      setResult(outcome)
      setError(null)
      if (outcome.coins > 0) onCoins()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not send the answer.')
    } finally {
      setBusy(false)
    }
  }

  if (!next) {
    return <Screen>{error ? <Empty>{error}</Empty> : <Loading />}</Screen>
  }

  const question = next.question
  const number = next.done_today + (result ? 0 : 1)
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Muted>Daily practice</Muted>
        <Title>{question ? `Question ${number} of ${next.per_day}` : 'All done for today!'}</Title>
      </View>

      {!question ? (
        <Card style={{ gap: 10 }}>
          <Body>
            {next.done_today > 0
              ? 'You finished today’s practice. Come back tomorrow for more!'
              : 'There are no practice questions yet. They come from the questions your teacher asks in class.'}
          </Body>
          <Button label="Back" color={color} onPress={onBack} />
        </Card>
      ) : (
        <Card style={{ gap: 12, borderWidth: 2, borderColor: color }}>
          {(question.class || question.lesson_date) && (
            <Muted>
              From {question.class ?? 'class'}
              {question.lesson_date ? ` · ${formatDay(question.lesson_date)}` : ''}
            </Muted>
          )}
          <Text style={styles.prompt}>{question.prompt}</Text>

          {question.kind === 'choice' ? (
            question.options.map((option, index) => {
              const isPicked = picked.includes(index)
              const isRight = result?.right_options?.includes(index) ?? false
              return (
                <Pressable
                  key={index}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPicked, disabled: Boolean(result) }}
                  accessibilityLabel={`${choiceLetter(index)}. ${option.text}`}
                  disabled={Boolean(result)}
                  onPress={() => setPicked((current) => (current.includes(index) ? current.filter((value) => value !== index) : [...current, index]))}
                  style={[
                    styles.option,
                    isPicked && { borderColor: color, backgroundColor: `${color}14` },
                    result && isRight && { borderColor: colors.good, backgroundColor: colors.goodBg },
                  ]}
                >
                  <Text style={[styles.letter, { color: isPicked ? color : colors.muted }]}>{choiceLetter(index)}</Text>
                  <Body style={{ flex: 1 }}>{option.text}</Body>
                  {result && isRight && <Text style={{ color: colors.good, fontWeight: '800' }}>✓</Text>}
                </Pressable>
              )
            })
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!result}
              placeholder="Type your answer"
              accessibilityLabel="Your answer"
              autoCapitalize="none"
              maxLength={300}
              onSubmitEditing={() => !result && text.trim() && void send()}
              style={styles.input}
            />
          )}

          {result ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.verdict, { color: result.correct ? colors.good : colors.bad }]}>
                {result.correct ? `🎉 Right!${result.coins > 0 ? ` +${result.coins} coins` : ''}` : 'Not this time — keep going!'}
              </Text>
              {!result.correct && result.right_answer && <Body>Right answer: {result.right_answer}</Body>}
              {result.explanation && <Muted>{result.explanation}</Muted>}
              <Button label={next.done_today + 1 >= next.per_day ? 'Finish' : 'Next question'} color={color} busy={busy} onPress={() => void goNext()} />
            </View>
          ) : (
            <Button
              label="Check my answer"
              color={color}
              busy={busy}
              disabled={question.kind === 'choice' ? picked.length === 0 : !text.trim()}
              onPress={() => void send()}
            />
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  prompt: { fontSize: 20, fontWeight: '700', color: colors.text, lineHeight: 28 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, padding: 12, minHeight: 48 },
  letter: { fontSize: 16, fontWeight: '800', width: 20 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 48, fontSize: 17, color: colors.text, backgroundColor: '#fff' },
  verdict: { fontSize: 20, fontWeight: '800' },
  error: { color: colors.bad, fontSize: 14 },
})
