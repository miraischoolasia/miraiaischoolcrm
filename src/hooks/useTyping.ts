import { useCallback, useRef } from 'react'
import type { WaActions } from '../lib/waActions'

const TYPING_EVERY_MS = 3_000

// A way to show the parent "typing..." while the team writes a reply. It needs the phone number of
// the chat, so a chat whose number WhatsApp hides shows nothing. (Seeing the parent type is not
// possible: WhatsApp only sends that to a device that shows itself as online all the time, which
// would also tell every parent the school is online.)
export function useTyping(actions: WaActions | null, phone: string | null) {
  const lastTyping = useRef(0)

  // Called as the team types; tells WhatsApp at most every few seconds.
  return useCallback(() => {
    if (!actions || !phone) {
      return
    }
    const now = Date.now()
    if (now - lastTyping.current < TYPING_EVERY_MS) {
      return
    }
    lastTyping.current = now
    void actions.showTyping(phone).catch(() => undefined)
  }, [actions, phone])
}
