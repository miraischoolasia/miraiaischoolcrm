import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { choiceLetter, useLive, type LiveState, type Picture } from '@/lib/live'
import { Body, Button, Card, colors, Heading, Muted, Pill } from '@/ui/kit'

type ActiveState = Extract<LiveState, { active: true }>

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// The question the teacher popped: answer it while the timer runs; once the
// teacher shows the answer, see whether it was right and the top places.
export function LiveQuestionCard({ color }: { color: string }) {
  const { state, secondsLeft } = useLive()
  if (!state?.active) return null
  const { question, answer } = state
  const open = question.open && secondsLeft > 0

  return (
    <Card style={[styles.card, { borderColor: color }]}>
      <View style={styles.header}>
        <Pill color="#fff" background={color}>
          {`Question ${question.number}`}
        </Pill>
        {open ? (
          <Text style={[styles.timer, secondsLeft <= 10 && { color: colors.bad }]}>⏱ {clock(secondsLeft)}</Text>
        ) : (
          <Muted>{question.revealed ? 'Answer shown' : 'Time is up'}</Muted>
        )}
      </View>
      <Text style={styles.prompt}>{question.prompt}</Text>

      {/* Remount per question so a new one starts with nothing picked. */}
      {open && !answer && <AnswerForm key={question.id} state={state} color={color} />}
      {answer && !question.revealed && (
        <View style={styles.sent}>
          <Body style={{ fontWeight: '700' }}>✅ Sent! Wait for your teacher.</Body>
          <YourAnswer state={state} />
        </View>
      )}
      {!answer && !open && !question.revealed && <Muted>You did not answer this one.</Muted>}
      {question.revealed && <Revealed state={state} />}
      {question.revealed && <Leaderboard state={state} color={color} />}
    </Card>
  )
}

function AnswerForm({ state, color }: { state: ActiveState; color: string }) {
  const { submit, sendPicture } = useLive()
  const { question } = state
  const [picked, setPicked] = useState<number[]>([])
  const [text, setText] = useState('')
  const [picture, setPicture] = useState<(Picture & { uri: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(action: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    const problem = await action()
    setBusy(false)
    if (problem) setError(problem)
  }

  async function choosePicture() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true })
    const asset = result.canceled ? null : result.assets[0]
    if (!asset?.base64) return
    const mimeType = asset.mimeType && /^image\/(jpeg|png|webp)$/.test(asset.mimeType) ? asset.mimeType : 'image/jpeg'
    setPicture({ uri: asset.uri, base64: asset.base64, mimeType })
  }

  return (
    <View style={{ gap: 10 }}>
      {question.kind === 'choice' && (
        <>
          {question.options.map((option, index) => {
            const isPicked = picked.includes(index)
            return (
              <Pressable
                key={index}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isPicked }}
                accessibilityLabel={`${choiceLetter(index)}. ${option.text}`}
                onPress={() =>
                  setPicked((current) => (current.includes(index) ? current.filter((value) => value !== index) : [...current, index]))
                }
                style={[styles.option, isPicked && { borderColor: color, backgroundColor: `${color}14` }]}
              >
                <Text style={[styles.letter, { color: isPicked ? color : colors.muted }]}>{choiceLetter(index)}</Text>
                <Body style={{ flex: 1 }}>{option.text}</Body>
              </Pressable>
            )
          })}
          <Button label="Send answer" color={color} busy={busy} disabled={picked.length === 0} onPress={() => void send(() => submit({ choices: picked }))} />
        </>
      )}

      {(question.kind === 'fill' || question.kind === 'short' || question.kind === 'link') && (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={question.kind === 'link' ? 'Paste the link to your work' : 'Type your answer'}
            accessibilityLabel="Your answer"
            multiline={question.kind === 'short'}
            autoCapitalize="none"
            autoCorrect={question.kind !== 'link'}
            keyboardType={question.kind === 'link' ? 'url' : 'default'}
            maxLength={question.kind === 'fill' ? 300 : 2000}
            style={[styles.input, question.kind === 'short' && { minHeight: 90, textAlignVertical: 'top' }]}
          />
          <Button label="Send answer" color={color} busy={busy} disabled={!text.trim()} onPress={() => void send(() => submit({ text: text.trim() }))} />
        </>
      )}

      {question.kind === 'screenshot' && (
        <>
          {picture ? (
            <Image source={{ uri: picture.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Your picture" />
          ) : (
            <Muted>Take a screenshot of your work, then choose it here.</Muted>
          )}
          <Button label={picture ? 'Choose another picture' : 'Choose picture'} color={color} variant="outline" onPress={() => void choosePicture()} />
          {picture && (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a note (optional)"
              accessibilityLabel="Note for your teacher"
              maxLength={500}
              style={styles.input}
            />
          )}
          <Button label="Send picture" color={color} busy={busy} disabled={!picture} onPress={() => picture && void send(() => sendPicture(picture, text))} />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

function YourAnswer({ state }: { state: ActiveState }) {
  const { question, answer } = state
  if (!answer) return null
  if (question.kind === 'choice') {
    return (
      <Muted>
        Your answer: {(answer.choices ?? []).map((index) => `${choiceLetter(index)}. ${question.options[index]?.text ?? ''}`).join(', ')}
      </Muted>
    )
  }
  if (answer.has_file) return <Muted>Your picture was sent{answer.text ? ` · ${answer.text}` : ''}.</Muted>
  return <Muted>Your answer: {answer.text}</Muted>
}

function Revealed({ state }: { state: ActiveState }) {
  const { question, answer, key } = state
  const result = answer?.result
  return (
    <View style={{ gap: 6 }}>
      {answer &&
        (result === 'correct' ? (
          <Body style={[styles.result, { color: colors.good }]}>🎉 Right! +{answer.points ?? 0} points</Body>
        ) : result === 'wrong' ? (
          <Body style={[styles.result, { color: colors.bad }]}>Not this time — keep going!</Body>
        ) : (
          <Body style={styles.result}>⏳ Your teacher is checking your answer.</Body>
        ))}
      <YourAnswer state={state} />
      {answer?.feedback && <Body>💬 {answer.feedback}</Body>}
      {key && question.kind === 'choice' && (key.correct_options ?? []).length > 0 && (
        <Body>
          Right answer:{' '}
          {(key.correct_options ?? []).map((index) => `${choiceLetter(index)}. ${question.options[index]?.text ?? ''}`).join(', ')}
        </Body>
      )}
      {key && question.kind === 'fill' && key.answers.length > 0 && (
        <Body>Right answer: {key.answers[0]}</Body>
      )}
      {key?.explanation && <Muted>{key.explanation}</Muted>}
    </View>
  )
}

function Leaderboard({ state, color }: { state: ActiveState; color: string }) {
  if (state.leaderboard.length === 0 && !state.my_points) return null
  return (
    <View style={styles.board}>
      {state.leaderboard.length > 0 && <Heading>Top of the class</Heading>}
      {state.leaderboard.map((row) => (
        <View key={`${row.place}-${row.name}`} style={styles.boardRow}>
          <Body style={[{ flex: 1 }, row.me && { fontWeight: '800', color }]}>
            {row.place === 1 ? '🥇' : row.place === 2 ? '🥈' : row.place === 3 ? '🥉' : `${row.place}.`} {row.name}
            {row.me ? ' (you)' : ''}
          </Body>
          <Body style={{ fontWeight: '700' }}>{row.points}</Body>
        </View>
      ))}
      <Muted>
        You: {state.my_points} points this lesson{state.my_place ? ` · place ${state.my_place}` : ''}
      </Muted>
    </View>
  )
}

// On the other tabs: a bar that says a question is waiting.
export function LiveQuestionBanner({ color, onOpen }: { color: string; onOpen: () => void }) {
  const { state, secondsLeft } = useLive()
  if (!state?.active || !state.question.open || secondsLeft <= 0 || state.answer) return null
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={[styles.banner, { backgroundColor: color }]}>
      <Text style={styles.bannerText}>📣 Your teacher asked a question — tap to answer ({clock(secondsLeft)})</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  prompt: { fontSize: 19, fontWeight: '700', color: colors.text, lineHeight: 26 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 48,
  },
  letter: { fontSize: 16, fontWeight: '800', width: 20 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.background },
  sent: { gap: 4, paddingVertical: 4 },
  result: { fontSize: 17, fontWeight: '800' },
  error: { color: colors.bad, fontSize: 14 },
  board: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { paddingVertical: 10, paddingHorizontal: 16 },
  bannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
})
