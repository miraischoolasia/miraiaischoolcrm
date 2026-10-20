import { useCallback, useEffect, useState } from 'react'
import { fetchChannelLabels, saveChannelLabel, type ChannelLabel, type ChannelLabels } from '../lib/channelLabels'

// The short names and colours an admin gave the inbox's channels (20261027700000). A read that fails leaves none:
// a database not set up for this yet shows the channels as before.
export function useChannelLabels(enabled: boolean) {
  const [labels, setLabels] = useState<ChannelLabels>(() => new Map())

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setLabels(await fetchChannelLabels())
    } catch {
      // Keep what is shown.
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  // Resolves to an error message, or null when it worked.
  const save = useCallback(async (key: string, label: ChannelLabel): Promise<string | null> => {
    try {
      await saveChannelLabel(key, label)
      setLabels((current) => {
        const next = new Map(current)
        if (label.shortName?.trim() || label.color) {
          next.set(key, { shortName: label.shortName?.trim() || null, color: label.color || null })
        } else {
          next.delete(key)
        }
        return next
      })
      return null
    } catch (problem) {
      const message = (problem as { message?: string })?.message ?? ''
      return /channel_labels/.test(message) ? 'The database is not set up for short names yet. Ask the admin to update it.' : "Couldn't save the short name."
    }
  }, [])

  return { labels, reload, save }
}
