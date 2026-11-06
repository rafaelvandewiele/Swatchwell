import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import './AuthPanel.css'

type Mode = 'login' | 'register' | 'forgot' | 'update' | 'account'

interface Props {
  onClose: () => void
  initialMode?: 'login' | 'update'
}

export default function AuthPanel({ onClose, initialMode }: Props) {
  const [mode, setMode] = useState<Mode>(() =>
    initialMode ??
    (new URLSearchParams(window.location.search).get('type') === 'recovery'
      ? 'update'
      : 'login'),
  )
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<{ role: string; is_premium: boolean } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      const isRecovery =
        new URLSearchParams(window.location.search).get('type') === 'recovery'
      if (data.session && !isRecovery) setMode('account')
    })

    const isRecovery =
      new URLSearchParams(window.location.search).get('type') === 'recovery'

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)

      if (
        event === 'PASSWORD_RECOVERY' ||
        (isRecovery && event === 'INITIAL_SESSION')
      ) {
        setMode('update')
      } else if (nextSession) {
        setMode('account')
      } else {
        setMode('login')
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null)
      return
    }

    supabase
      .from('profiles')
      .select('role, is_premium')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data)
      })
  }, [session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError('Authentication is not configured yet.')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const redirectTo = `${window.location.origin}/auth/callback`

      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        })
        if (error) throw error
        setMessage('Registration received. Check your email to verify your account.')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${redirectTo}?type=recovery` },
        )
        if (error) throw error
        setMessage('If an account exists, a password reset link has been sent.')
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setMessage('Your password has been updated.')
        setMode('account')
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('type')
        cleanUrl.searchParams.delete('code')
        window.history.replaceState(
          {},
          document.title,
          `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) setError(error.message)
    else {
      setProfile(null)
      setMessage('You have been signed out.')
      setMode('login')
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Welcome back',
    register: 'Create your account',
    forgot: 'Reset your password',
    update: 'Choose a new password',
    account: 'Your account',
  }

  return (
    <div className="auth-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="auth-panel" role="dialog" aria-modal="true">
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>
        <span className="auth-eyebrow">SWATCHWELL ACCOUNT</span>
        <h2>{titles[mode]}</h2>

        {!supabase && (
          <p className="auth-message">Connect your Supabase project to activate accounts.</p>
        )}

        {session && mode === 'account' ? (
          <div className="auth-account">
            <p>Signed in as <strong>{session.user.email}</strong></p>
            <p>Account type: {profile?.role === 'admin' ? 'Administrator' : 'Personal account'}</p>
            <p>Plan: {profile?.is_premium ? 'Premium' : 'Free'}</p>
            {profile?.role === 'admin' && (
              <p className="auth-message">Administrator access is active.</p>
            )}
            <button className="auth-primary" onClick={() => setMode('update')}>
              Change password
            </button>
            <button className="auth-secondary" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode !== 'update' && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}

            {mode !== 'forgot' && (
              <label>
                {mode === 'update' ? 'New password' : 'Password'}
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-message">{message}</p>}

            <button className="auth-primary" disabled={busy || !supabase}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' :
                mode === 'forgot' ? 'Send reset link' :
                mode === 'update' ? 'Update password' : 'Sign in'}
            </button>
          </form>
        )}

        {!session && (
          <div className="auth-links">
            {mode !== 'login' && <button onClick={() => { setMode('login'); setError(''); setMessage('') }}>Sign in</button>}
            {mode !== 'register' && <button onClick={() => { setMode('register'); setError(''); setMessage('') }}>Create account</button>}
            {mode !== 'forgot' && mode !== 'update' && (
              <button onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>Forgot password?</button>
            )}
          </div>
        )}

        {error && session && <p className="auth-error">{error}</p>}
        {message && session && <p className="auth-message">{message}</p>}
      </section>
    </div>
  )
}
