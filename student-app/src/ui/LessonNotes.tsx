import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { fetchLessonNotes, type LessonNote } from '@/lib/portal'
import { colors } from '@/ui/kit'

// The picked child's published lesson notes, read again when `reloadKey` changes.
export function useLessonNotes(studentId: number | null, reloadKey: unknown) {
  const [notes, setNotes] = useState<LessonNote[]>([])
  useEffect(() => {
    let cancelled = false
    if (studentId === null) return
    void fetchLessonNotes(studentId).then((list) => !cancelled && setNotes(list))
    return () => {
      cancelled = true
    }
  }, [studentId, reloadKey])
  return notes
}

// A lesson's notes: each title opens its text.
export function LessonNotesList({ notes, color }: { notes: LessonNote[]; color: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (notes.length === 0) return null
  return (
    <View style={{ gap: 6 }}>
      {notes.map((note) => (
        <View key={note.id} style={[styles.note, { borderColor: color }]}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(open === note.id ? null : note.id)}>
            <Text style={styles.title}>
              📒 {note.title} <Text style={styles.muted}>{open === note.id ? '▲' : '▼'}</Text>
            </Text>
          </Pressable>
          {open === note.id && <Text style={styles.body}>{note.body}</Text>}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  note: { borderWidth: 1, borderRadius: 12, padding: 10, backgroundColor: '#ffffff' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { marginTop: 6, fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
})
