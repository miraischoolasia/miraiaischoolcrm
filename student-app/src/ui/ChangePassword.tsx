import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import { useSession } from '@/lib/session'
import { Body, Button, colors, Muted } from '@/ui/kit'

// Me > Account: choose a new password. Closed until asked for, so a child
// does not change it by mistake.
export function ChangePassword({ color }: { color: string }) {
  const { changePassword } = useSession()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function close() {
    setOpen(false)
    setCurrent('')
    setNext('')
    setAgain('')
    setError(null)
  }

  async function save() {
    if (next !== again) {
      setError('The two new passwords are not the same.')
      return
    }
    setBusy(true)
    setError(null)
    const problem = await changePassword(current, next)
    setBusy(false)
    if (problem) {
      setError(problem)
      return
    }
    close()
    setDone(true)
  }

  if (!open) {
    return (
      <View style={{ gap: 6 }}>
        {done && <Text style={{ color: colors.good }}>Password changed. Use the new one next time.</Text>}
        <Button
          label="Change password"
          variant="outline"
          color={color}
          onPress={() => {
            setDone(false)
            setOpen(true)
          }}
        />
      </View>
    )
  }

  return (
    <View style={styles.form}>
      <Field label="Current password" value={current} onChange={setCurrent} complete="current-password" />
      <Field label="New password (at least 8)" value={next} onChange={setNext} complete="new-password" />
      <Field label="New password again" value={again} onChange={setAgain} complete="new-password" onSubmit={() => void save()} />
      {error && <Text style={{ color: colors.bad, fontSize: 14 }}>{error}</Text>}
      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button label="Save" color={color} busy={busy} disabled={!current || !next || !again} onPress={() => void save()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="outline" color={color} disabled={busy} onPress={close} />
        </View>
      </View>
      <Muted>Forgot it? The school can give you a new one.</Muted>
    </View>
  )
}

function Field({
  label,
  value,
  onChange,
  complete,
  onSubmit,
}: {
  label: string
  value: string
  onChange: (text: string) => void
  complete: 'current-password' | 'new-password'
  onSubmit?: () => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <Body>{label}</Body>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={complete}
        accessibilityLabel={label}
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  buttons: { flexDirection: 'row', gap: 10 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
})
