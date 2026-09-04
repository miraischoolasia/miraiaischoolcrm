import { useState } from 'react'
import miraiLogo from '../assets/mirai-logo.png'
import { usernameToInternalEmail } from '../lib/auth'
import { supabase } from '../lib/supabase'

type AuthScreenProps = {
  /** Set when a resolved Supabase Auth session has no matching/active teacher row. */
  blockedMessage?: string | null
}

export function AuthScreen({ blockedMessage }: AuthScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }

    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToInternalEmail(username),
      password,
    })

    setIsSubmitting(false)

    if (signInError) {
      setError('Incorrect username or password.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img src={miraiLogo} alt="Mirai AI School" className="h-12 w-auto" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Teaching System</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
        </div>

        {blockedMessage && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {blockedMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Username</span>
            <input
              type="text"
              id="auth-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Password</span>
            <input
              type="password"
              id="auth-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
