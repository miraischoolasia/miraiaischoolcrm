import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  defaultBranding,
  fetchBranding,
  fetchChildren,
  fetchHome,
  loginEmail,
  type Branding,
  type Child,
  type Home,
} from './portal'
import { isConfigured, supabase } from './supabase'

type SessionState = {
  isLoading: boolean
  session: Session | null
  branding: Branding
  children: Child[]
  child: Child | null
  chooseChild: (studentId: number) => void
  home: Home | null
  homeError: string | null
  isRefreshing: boolean
  refresh: () => Promise<void>
  signIn: (username: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

// Who is signed in (a child or a parent), the children they may see, the one
// picked, and that child's home data. Every screen reads it with useSession().
export function SessionProvider({ children: content }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [branding, setBranding] = useState<Branding>(defaultBranding)
  const [children, setChildren] = useState<Child[]>([])
  const [childId, setChildId] = useState<number | null>(null)
  const [home, setHome] = useState<Home | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    fetchBranding().then(setBranding)
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setIsLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // Signed out: nothing of the last login stays on screen.
      if (!next) {
        setChildren([])
        setChildId(null)
        setHome(null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // The children this login may see; the first is picked.
  useEffect(() => {
    if (!session) return
    fetchChildren()
      .then((list) => {
        setChildren(list)
        setChildId((current) => (current && list.some((entry) => entry.studentId === current) ? current : (list[0]?.studentId ?? null)))
        setHomeError(list.length === 0 ? 'This login has no student yet. Please ask the school.' : null)
      })
      .catch((error: Error) => setHomeError(error.message))
  }, [session])

  const applyHome = useCallback((next: Home) => {
    setHome(next)
    setHomeError(null)
    if (next.school_name || next.accent_color) {
      setBranding((current) => ({
        schoolName: next.school_name || current.schoolName,
        accentColor: next.accent_color || current.accentColor,
      }))
    }
  }, [])

  // The picked child's home, whenever the pick changes.
  useEffect(() => {
    if (!childId) return
    let cancelled = false
    fetchHome(childId)
      .then((next) => !cancelled && applyHome(next))
      .catch((error: Error) => !cancelled && setHomeError(error.message))
    return () => {
      cancelled = true
    }
  }, [applyHome, childId])

  // Pull to refresh.
  const refresh = useCallback(async () => {
    if (!childId) return
    setIsRefreshing(true)
    try {
      applyHome(await fetchHome(childId))
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : 'Could not load.')
    } finally {
      setIsRefreshing(false)
    }
  }, [applyHome, childId])

  // Another child: their home loads fresh instead of showing the last one's.
  const chooseChild = useCallback((studentId: number) => {
    setHome(null)
    setChildId(studentId)
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    if (!isConfigured) return 'The app is not set up yet.'
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password })
    if (!error) return null
    return /invalid/i.test(error.message) ? 'That login name or password is not right.' : error.message
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<SessionState>(
    () => ({
      isLoading,
      session,
      branding,
      children,
      child: children.find((entry) => entry.studentId === childId) ?? null,
      chooseChild,
      home,
      homeError,
      isRefreshing,
      refresh,
      signIn,
      signOut,
    }),
    [branding, childId, children, chooseChild, home, homeError, isLoading, isRefreshing, refresh, session, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{content}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
