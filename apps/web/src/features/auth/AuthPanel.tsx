import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useI18n, type Language } from '../../lib/i18n'
import './AuthPanel.css'

type Mode = 'login' | 'register' | 'forgot' | 'update' | 'account'

function getAuthErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (!error || typeof error !== 'object') {
    return t('Something went wrong.')
  }

  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : ''

  const messages: Record<string, string> = {
    invalid_credentials: 'Invalid login credentials.',
    email_not_confirmed: 'Email not confirmed.',
    user_already_exists: 'User already registered.',
    weak_password: 'Password is too weak.',
    over_request_rate_limit: 'Too many requests. Please try again later.',
    over_email_send_rate_limit: 'Too many email requests. Please try again later.',
    same_password: 'Please choose a different password.',
  }

  if (code && messages[code]) return t(messages[code])
  if (code) return t('Something went wrong.')

  return t('Something went wrong.')
}

interface Props {
  onClose: () => void
  initialMode?: 'login' | 'update'
  onRecoveryComplete?: () => void
}

export default function AuthPanel({ onClose, initialMode, onRecoveryComplete }: Props) {
  const { t, setLanguage, language: appLanguage } = useI18n()
  const [mode, setMode] = useState<Mode>(() =>
    initialMode ??
    (new URLSearchParams(window.location.search).get('type') === 'recovery'
      ? 'update'
      : 'login'),
  )
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<{
    role: string
    is_premium: boolean
    first_name: string | null
    last_name: string | null
    language: string
  } | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [language, setPreferredLanguage] = useState<Language>(appLanguage)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let active = true

    function applySession(
      nextSession: Session | null,
      event?: string,
    ) {
      if (!active) return

      if (nextSession && !nextSession.user.email_confirmed_at) {
        setSession(null)
        setProfile(null)
        setMode('login')
        setError(t('Please verify your email address before accessing your account.'))

        // Run outside Supabase's auth-state callback to avoid lock deadlocks.
        window.setTimeout(() => {
          if (active) {
            void supabase.auth.signOut({ scope: 'local' })
          }
        }, 0)

        return
      }

      setSession(nextSession)

      const isRecovery =
        new URLSearchParams(window.location.search).get('type') === 'recovery'

      if (event === 'PASSWORD_RECOVERY' ||
          (isRecovery && event === 'INITIAL_SESSION')) {
        setMode('update')
      } else if (nextSession) {
        setMode('account')
      } else if (event) {
        setMode('login')
      }
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return

      if (error) {
        setError(getAuthErrorMessage(error, t))
        return
      }

      applySession(data.session, 'INITIAL_SESSION')
    })

    const { data } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        applySession(nextSession, event)
      },
    )

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null)
      return
    }

    supabase
      .from('profiles')
      .select('role, is_premium, first_name, last_name, language')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data)
          setFirstName(data.first_name ?? '')
          setLastName(data.last_name ?? '')
          setPreferredLanguage(data.language ?? 'en')
          setLanguage((data.language ?? 'en') as Language)
        }
      })
  }, [session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError(t('Authentication is not configured yet.'))
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const redirectTo = 'https://swatchwell.veyca.dev/auth/callback'

      if (mode === 'register' && (!firstName.trim() || !lastName.trim())) {
        throw new Error(t('Please enter both your first name and surname.'))
      }

      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              preferred_language: language,
            },
          },
        })
        if (error) throw error
        setMessage(t('Registration received. Check your email to verify your account.'))
      } else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut({ scope: 'local' })
          throw new Error(t('Please verify your email address before signing in.'))
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${redirectTo}?type=recovery` },
        )
        if (error) throw error
        setMessage(t('If an account exists, a password reset link has been sent.'))
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setMessage(t('Your password has been updated.'))
        setMode('account')
        onRecoveryComplete?.()
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
      setError(getAuthErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) setError(getAuthErrorMessage(error, t))
    else {
      setProfile(null)
      setMessage(t('You have been signed out.'))
      setMode('login')
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !session) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const { error } = await supabase.rpc('update_my_profile', {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_language: language,
      })

      if (error) throw error

      const { data, error: reloadError } = await supabase
        .from('profiles')
        .select('role, is_premium, first_name, last_name, language')
        .eq('id', session.user.id)
        .single()

      if (reloadError) throw reloadError

      setProfile(data)
      setFirstName(data.first_name ?? '')
      setLastName(data.last_name ?? '')
      setPreferredLanguage(data.language ?? 'en')
      setLanguage((data.language ?? 'en') as Language)
      setMessage(t('Your profile settings have been saved.'))
    } catch (err) {
      const savedLanguage = profile?.language
      if (savedLanguage === 'nl' || savedLanguage === 'en' ||
          savedLanguage === 'fr' || savedLanguage === 'de') {
        setPreferredLanguage(savedLanguage)
        setLanguage(savedLanguage)
      }
      setError(getAuthErrorMessage(err, t))
    } finally {
      setBusy(false)
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
        <button className="auth-close" onClick={onClose} aria-label={t("Close")}>×</button>
        <span className="auth-eyebrow">{t("SWATCHWELL ACCOUNT")}</span>
        <h2>{t(titles[mode])}</h2>

        {!supabase && (
          <p className="auth-message">{t("Connect your Supabase project to activate accounts.")}</p>
        )}

        {session && mode === 'account' ? (
          <div className="auth-account">
            <p>{t("Signed in as")} <strong>{session.user.email}</strong></p>
            <p>{t("Account type:")} {profile?.role === 'admin' ? t("Administrator") : t("Personal account")}</p>
            <p>{t("Plan:")} {profile?.is_premium ? t("Premium") : t("Free")}</p>
            {profile?.role === 'admin' && (
              <p className="auth-message">{t("Administrator access is active.")}</p>
            )}

            <form className="auth-profile-form" onSubmit={saveProfile}>
              <h3>{t("Profile settings")}</h3>
              <label>
                {t("First name")}
                <input
                  type="text"
                  autoComplete="given-name"
                  maxLength={80}
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </label>
              <label>
                {t("Surname")}
                <input
                  type="text"
                  autoComplete="family-name"
                  maxLength={80}
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </label>
              <label>
                {t("Preferred language")}
                <select
                  value={language}
                  onChange={(event) => {
                      const nextLanguage = event.target.value as Language
                      setPreferredLanguage(nextLanguage)
                      setLanguage(nextLanguage)
                    }}
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                </select>
              </label>
              <button className="auth-primary" type="submit" disabled={busy}>
                {busy ? t('Saving…') : t('Save profile')}
              </button>
            </form>

            <button className="auth-secondary" onClick={() => setMode('update')}>
              {t("Change password")}
            </button>
            <button className="auth-secondary" onClick={signOut}>{t("Sign out")}</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <label>
                  {t("First name")}
                  <input
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <label>
                  {t("Surname")}
                  <input
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
                <label>
                  {t("Preferred language")}
                  <select
                    value={language}
                    onChange={(event) => {
                      const nextLanguage = event.target.value as Language
                      setPreferredLanguage(nextLanguage)
                      setLanguage(nextLanguage)
                    }}
                  >
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </select>
                </label>
              </>
            )}
            {mode !== 'update' && (
              <label>
                {t("Email address")}
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
                {mode === 'update' ? t('New password') : t('Password')}
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
              {busy ? t('Please wait…') : mode === 'register' ? t('Create account') :
                mode === 'forgot' ? t('Send reset link') :
                mode === 'update' ? t('Update password') : t('Sign in')}
            </button>
          </form>
        )}

        {!session && (
          <div className="auth-links">
            {mode !== 'login' && <button onClick={() => { setMode('login'); setError(''); setMessage('') }}>{t('Sign in')}</button>}
            {mode !== 'register' && <button onClick={() => { setMode('register'); setError(''); setMessage('') }}>{t('Create account')}</button>}
            {mode !== 'forgot' && mode !== 'update' && (
              <button onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>{t('Forgot password?')}</button>
            )}
          </div>
        )}

        {error && session && <p className="auth-error">{error}</p>}
        {message && session && <p className="auth-message">{message}</p>}
      </section>
    </div>
  )
}
