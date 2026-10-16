import { useCallback, useEffect, useState } from 'react'
import {
  channelAvatarError,
  fetchChannelAvatars,
  removeChannelAvatar,
  saveChannelAvatar,
  type ChannelAvatars,
} from '../lib/channelAvatars'

// The pictures an admin uploaded for the Pages the inbox has chats from. A read that fails leaves the list
// empty: a database that was not set up for this yet just has no uploaded pictures.
export function useChannelAvatars(enabled: boolean) {
  const [avatars, setAvatars] = useState<ChannelAvatars>(() => new Map())

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setAvatars(await fetchChannelAvatars())
    } catch {
      // Keep what is shown.
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  // Each resolves to an error message, or null when it worked.
  const save = useCallback(async (key: string, avatar: string): Promise<string | null> => {
    try {
      await saveChannelAvatar(key, avatar)
      setAvatars((current) => new Map(current).set(key, avatar))
      return null
    } catch (problem) {
      return channelAvatarError(problem, "Couldn't save the picture.")
    }
  }, [])

  const remove = useCallback(async (key: string): Promise<string | null> => {
    try {
      await removeChannelAvatar(key)
      setAvatars((current) => {
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return null
    } catch (problem) {
      return channelAvatarError(problem, "Couldn't remove the picture.")
    }
  }, [])

  return { avatars, reload, save, remove }
}

export type ChannelAvatarsState = ReturnType<typeof useChannelAvatars>
