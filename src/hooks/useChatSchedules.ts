import { useCallback, useEffect, useState } from 'react'
import { listChatSchedules, listFlowChoices, type ChatSchedule, type FlowChoice } from '../lib/chatSchedules'

const REFRESH_MS = 60_000

// What is scheduled for the open chat (and the flows, for their names). Read when the chat opens, after a change,
// and every minute while it stays open (a parent's reply or the sender may have closed one).
export function useChatSchedules(conversationId: number | null) {
  const [schedules, setSchedules] = useState<ChatSchedule[]>([])
  const [flows, setFlows] = useState<FlowChoice[]>([])
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    listFlowChoices().then(setFlows).catch(() => setFlows([]))
  }, [])

  useEffect(() => {
    setSchedules([])
    if (conversationId === null) {
      return
    }
    let cancelled = false
    const read = () => {
      if (document.hidden) {
        return
      }
      listChatSchedules(conversationId)
        .then((list) => {
          if (!cancelled) {
            setSchedules(list)
          }
        })
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [conversationId, version])

  return { schedules, flows, reload }
}
