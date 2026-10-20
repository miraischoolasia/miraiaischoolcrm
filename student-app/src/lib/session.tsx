import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  defaultBranding,
  fetchBranding,
  fetchChildren,
  fetchHome,
  fetchOnboarding,
  loginEmail,
  type Branding,
  type Child,
  type Home,
  type Onboarding,
} from './portal'
import { clearRememberMark, loginShouldEnd } from './rememberMe'
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
  // What must happen before the app opens (null while it is being checked).
  onboarding: Onboarding | null
  reloadOnboarding: () => Promise<void>
  isRefreshing: boolean
  refresh: () => Promise<void>
  signIn: (username: string, password: string) => Promise<string | null>
  // A new password chosen in the app; the old one must be right first.
  changePassword: (current: string, next: string) => Promise<string | null>
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
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null)

  useEffect(() => {
    fetchBranding().then(setBranding)
    // "Remember me" left blank last time and the browser closed since: that login ends here.
    const ending = loginShouldEnd()
      ? supabase.auth.signOut({ scope: 'local' }).then(clearRememberMark, clearRememberMark)
      : Promise.resolve()
    ending
      .then(() => supabase.auth.getSession())
      .then(({ data }) => setSession(data.session))
      .finally(() => setIsLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // Signed out: nothing of the last login stays on screen.
      if (!next) {
        setChildren([])
        setChildId(null)
        setHome(null)
        setOnboarding(null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Terms to agree to first (a parent's first sign-in, or new terms).
  useEffect(() => {
    if (!session) return
    fetchOnboarding()
      .then(setOnboarding)
      .catch(() => setOnboarding({ needs_terms: false }))
  }, [session])

  const reloadOnboarding = useCallback(async () => {
    setOnboarding(await fetchOnboarding())
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
        ...current,
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

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const email = session?.user.email
      if (!email) return 'Please sign in again.'
      if (next.length < 8) return 'The new password needs at least 8 letters or numbers.'
      if (next === current) return 'The new password must be different from the old one.'
      const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current })
      if (checkError) return /invalid/i.test(checkError.message) ? 'Your current password is not right.' : checkError.message
      const { error } = await supabase.auth.updateUser({ password: next })
      return error ? error.message : null
    },
    [session],
  )

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
      onboarding,
      reloadOnboarding,
      isRefreshing,
      refresh,
      signIn,
      changePassword,
      signOut,
    }),
    [branding, changePassword, childId, children, chooseChild, home, homeError, isLoading, isRefreshing, onboarding, refresh, reloadOnboarding, session, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{content}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
