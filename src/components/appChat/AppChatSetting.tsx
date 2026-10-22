import { useEffect, useState } from 'react'
import { fetchAppChatOn, setAppChatOn } from '../../lib/appChat'

// Class Settings > Student app: the school's switch for the student app chat.
export function AppChatSetting() {
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchAppChatOn().then((value) => {
      if (alive) setOn(value)
    })
    return () => {
      alive = false
    }
  }, [])

  async function change(next: boolean) {
    setSaving(true)
    setError(null)
    try {
      await setAppChatOn(next)
      setOn(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
      <h3 className="text-base font-semibold text-slate-900">Chat</h3>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input
          type="checkbox"
          checked={on === true}
          disabled={on === null || saving}
          onChange={(event) => void change(event.target.checked)}
          className="h-4 w-4 accent-[#fc0c97]"
        />
        Students can message their class teachers and consultant from the app
      </label>
      <p className="text-sm text-slate-500">
        Only the student&apos;s own login (not a parent&apos;s). Class teachers include assistants, not substitutes. Messages arrive in
        Inbox &gt; App; each teacher sees the chats written to them, admins see all chats but only read them. No WhatsApp is sent.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </section>
  )
}
