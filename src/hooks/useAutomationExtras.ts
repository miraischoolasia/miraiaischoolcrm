import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { everyWhileVisible } from '../lib/visibleTimer'
import { fetchFlowStats, type FlowStats } from '../lib/automationStats'
import { deleteOptout, fetchOptouts, optoutsErrorMessage, type AutomationOptout } from '../lib/automationOptouts'
import {
  DEFAULT_AUTO_SEND,
  autoSendErrorMessage,
  fetchAutoSend,
  saveAutoSend,
  validateAutoSend,
  type AutoSendSettings,
} from '../lib/autoSend'

// What each flow has done so far. A page without the numbers still works, so a failure is not shown.
export function useAutomationStats({ enabled }: { enabled: boolean }) {
  const [stats, setStats] = useState<Map<number, FlowStats>>(() => new Map())

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setStats(await fetchFlowStats())
    } catch {
      setStats(new Map())
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  return { stats, reload }
}

// The forms a flow can ask about ("filled in form X"). Only their names are read.
export function useAutomationForms({ enabled }: { enabled: boolean }) {
  const [forms, setForms] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!enabled || !supabase) {
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from('forms').select('id, name').order('name', { ascending: true })
      if (!cancelled && !error) {
        setForms(((data ?? []) as { id: string; name: string }[]).map((form) => ({ id: form.id, name: form.name })))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return forms
}

// The numbers that asked to stop, and a way to allow one again.
export function useAutomationOptouts({ enabled }: { enabled: boolean }) {
  const [optouts, setOptouts] = useState<AutomationOptout[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setOptouts(await fetchOptouts())
      setError(null)
    } catch (problem) {
      setError(optoutsErrorMessage(problem, "Couldn't load the list."))
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  const allowAgain = useCallback(async (phone: string): Promise<string | null> => {
    try {
      await deleteOptout(phone)
      setOptouts((current) => current.filter((entry) => entry.phone !== phone))
      return null
    } catch (problem) {
      return optoutsErrorMessage(problem, "Couldn't allow this number again.")
    }
  }, [])

  return { optouts, error, reload, allowAgain }
}

// The rules for messages sent by themselves, and whether the sender program is running.
export function useAutoSend({ enabled }: { enabled: boolean }) {
  const [settings, setSettings] = useState<AutoSendSettings>(DEFAULT_AUTO_SEND)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setSettings(await fetchAutoSend())
      setError(null)
    } catch (problem) {
      setError(autoSendErrorMessage(problem, "Couldn't load the sending rules."))
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void reload()
    // Not while the tab is in the background; at once when it is looked at again.
    return everyWhileVisible(() => void reload(), 60_000)
  }, [enabled, reload])

  const save = useCallback(
    async (change: Partial<Omit<AutoSendSettings, 'senderSeenAt'>>): Promise<string | null> => {
      const problem = validateAutoSend({ ...settings, ...change })
      if (problem) {
        return problem
      }
      try {
        await saveAutoSend(change)
        setSettings((current) => ({ ...current, ...change }))
        return null
      } catch (failure) {
        await reload()
        return autoSendErrorMessage(failure, "Couldn't save the change.")
      }
    },
    [settings, reload],
  )

  return { settings, error, save, reload }
}
