import { useCallback, useEffect, useRef, useState } from 'react'
import {
  automationErrorMessage,
  canSend,
  claimQueueItem,
  currentUserId,
  DEFAULT_SEND_HOURS,
  DEFAULT_SETTINGS,
  fetchAutoSendRuleKeys,
  fetchSendHours,
  fetchQueue,
  fetchSentToday,
  fetchSettings,
  finishQueueItem,
  roomLeft,
  saveQueueMessage,
  skipQueueItems,
  type AutomationSettings,
  type QueueItem,
  type SendHours,
} from '../lib/automationQueue'

const REFRESH_MS = 60_000

// Sends one message to its parent's WhatsApp chat. Resolves to an error message, or null when
// WhatsApp accepted it.
export type SendQueued = (item: QueueItem, message: string) => Promise<string | null>

export type ApproveResult = {
  sent: number
  // The message that did not go out, which stops the rest; null when all went well.
  failure: string | null
  // Taken or skipped by someone else in the meantime.
  taken: number
  // Left in the queue because the day's limit was reached.
  heldBack: number
}

export type SendProgress = { done: number; total: number; waitingSeconds: number }

type Args = {
  enabled: boolean
  // Waits between two messages; replaced in tests.
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

// The approval queue of the automations, kept fresh while the inbox is open, and the one way a
// message leaves it: claimed (so two people never both send it), sent, then marked sent or failed.
export function useAutomationQueue({ enabled, sleep = defaultSleep }: Args) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS)
  const [sentToday, setSentToday] = useState(0)
  // The flows that send by themselves, so the window can tell which messages need nobody.
  const [autoRuleKeys, setAutoRuleKeys] = useState<ReadonlySet<string>>(new Set())
  const [sendHours, setSendHours] = useState<SendHours>(DEFAULT_SEND_HOURS)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (!enabled) {
      return null
    }
    try {
      const [queue, config, today, autoKeys, hours] = await Promise.all([
        fetchQueue(),
        fetchSettings(),
        fetchSentToday(),
        // Without it every message just looks like it needs approval, which is the safe way round.
        fetchAutoSendRuleKeys().catch(() => new Set<string>()),
        fetchSendHours().catch(() => DEFAULT_SEND_HOURS),
      ])
      setItems(queue)
      setAutoRuleKeys(autoKeys)
      setSendHours(hours)
      setSettings(config)
      setSentToday(today)
      setError(null)
      return { config, today }
    } catch (problem) {
      setError(automationErrorMessage(problem, "Couldn't load the automation queue."))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void reload()
    const timer = window.setInterval(() => {
      if (!busy.current) {
        void reload()
      }
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [enabled, reload])

  const saveMessage = useCallback(
    async (id: number, message: string) => {
      try {
        await saveQueueMessage(id, message)
        setItems((current) => current.map((item) => (item.id === id ? { ...item, message } : item)))
        return null
      } catch (problem) {
        return automationErrorMessage(problem, "Couldn't save the change to this message.")
      }
    },
    [],
  )

  const skip = useCallback(
    async (ids: number[]) => {
      try {
        await skipQueueItems(ids, await currentUserId())
        await reload()
        return null
      } catch (problem) {
        return automationErrorMessage(problem, "Couldn't skip these messages.")
      }
    },
    [reload],
  )

  // Sends the approved messages one at a time, in the order given, with the pause between two
  // messages that the settings ask for. The first one that fails stops the rest, so a WhatsApp
  // that is down does not burn through the whole list.
  const approve = useCallback(
    async (entries: { item: QueueItem; message: string }[], sendOne: SendQueued): Promise<ApproveResult> => {
      const result: ApproveResult = { sent: 0, failure: null, taken: 0, heldBack: 0 }
      if (busy.current || entries.length === 0) {
        return result
      }
      busy.current = true
      try {
        // The limit and the pause are read again now, in case another person sent some.
        const fresh = await reload()
        const config = fresh?.config ?? settings
        const room = roomLeft(config, fresh?.today ?? sentToday)
        const now = Date.now()
        const allowed = entries.filter((entry) => canSend(entry.item, now)).slice(0, room)
        result.heldBack = entries.length - allowed.length
        const userId = await currentUserId()
        setProgress({ done: 0, total: allowed.length, waitingSeconds: 0 })

        for (let index = 0; index < allowed.length; index += 1) {
          const { item, message } = allowed[index]
          const text = message.trim()
          if (text === '') {
            result.failure = 'A message is empty. Write something or skip it.'
            break
          }
          if (text !== item.message) {
            const changed = await saveQueueMessage(item.id, text)
            if (!changed) {
              result.taken += 1
              continue
            }
          }
          const claimed = await claimQueueItem(item.id, userId)
          if (!claimed) {
            result.taken += 1
            continue
          }
          let problem: string | null
          try {
            problem = await sendOne(item, text)
          } catch {
            problem = "Couldn't send the message. Check the connection and try again."
          }
          if (problem !== null) {
            await finishQueueItem(item.id, { ok: false, error: problem })
            result.failure = problem
            break
          }
          await finishQueueItem(item.id, { ok: true })
          result.sent += 1
          setProgress({ done: index + 1, total: allowed.length, waitingSeconds: 0 })
          if (index < allowed.length - 1) {
            setProgress({ done: index + 1, total: allowed.length, waitingSeconds: config.gapSeconds })
            await sleep(config.gapSeconds * 1000)
          }
        }
      } catch (problem) {
        result.failure = automationErrorMessage(problem, "Couldn't update the queue. Check the connection and try again.")
      } finally {
        busy.current = false
        setProgress(null)
        await reload()
      }
      return result
    },
    [reload, settings, sentToday, sleep],
  )

  return {
    items,
    settings,
    sentToday,
    autoRuleKeys,
    sendHours,
    isLoading,
    error,
    progress,
    reload,
    saveMessage,
    skip,
    approve,
  }
}
