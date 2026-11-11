import { useEffect, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'register' | 'forgot' | 'update' | 'account'

interface Profile {
  role: string
  is_premium: boolean
}

export default function AccountScreen() {
  const { recovery } = useLocalSearchParams<{ recovery?: string }>()
  const [mode, setMode] = useState<Mode>(
    recovery === '1' ? 'update' : 'login',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session && recovery !== '1') setMode('account')
      if (data.session) {
        const { data: accountProfile } = await supabase.from('profiles').select('role,is_premium').eq('id', data.session.user.id).maybeSingle()
        setProfile(accountProfile)
      }
    })

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        queueMicrotask(async () => {
          const { data: accountProfile } = await supabase.from('profiles').select('role,is_premium').eq('id', nextSession.user.id).maybeSingle()
          setProfile(accountProfile)
        })
      } else {
        setProfile(null)
      }

      if (event === 'PASSWORD_RECOVERY') {
        setMode('update')
        setMessage('Choose a new password for your account.')
      } else if (nextSession) {
        setMode('account')
      } else {
        setMode('login')
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  function clearFeedback() {
    setError('')
    setMessage('')
  }

  async function submit() {
    if (!supabase) {
      setError('Authentication is not configured yet.')
      return
    }

    if (mode === 'register' && (!firstName.trim() || !lastName.trim())) {
      setError('Please enter both your first name and surname.')
      return
    }

    setBusy(true)
    clearFeedback()

    try {
      const redirectTo = 'swatchwell://auth/callback'

      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
          },
        })
        if (error) throw error
        setMessage('Registration received. Check your email to verify your account.')
      } else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut({ scope: 'local' })
          throw new Error('Please verify your email address before signing in.')
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo },
        )
        if (error) throw error
        setMessage('If an account exists, a password reset link has been sent.')
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setMessage('Your password has been updated.')
        setPassword('')
        setMode('account')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function openSubscriptionAction() {
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const functionName = profile?.is_premium ? 'create-billing-portal' : 'create-checkout-session'
      const { data, error: invokeError } = await supabase.functions.invoke(functionName, { body: {} })
      if (invokeError || !data?.url) throw invokeError ?? new Error('Billing could not be opened.')
      await Linking.openURL(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Billing could not be opened.')
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
      setPassword('')
      setMessage('You have been signed out.')
      setMode('login')
    }
  }

  function changeMode(nextMode: Mode) {
    clearFeedback()
    setPassword('')
    setMode(nextMode)
  }

  const title: Record<Mode, string> = {
    login: 'Welcome back',
    register: 'Create your account',
    forgot: 'Reset your password',
    update: 'New password',
    account: 'Your account',
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>SWATCHWELL ACCOUNT</Text>
      <Text style={styles.title}>{title[mode]}</Text>
      <Text style={styles.subtitle}>
        Your personal style, wardrobe and outfits in one place.
      </Text>

      {!supabase ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            Authentication is not configured yet. Connect your Supabase project
            to activate accounts.
          </Text>
        </View>
      ) : session && mode === 'account' ? (
        <View style={styles.card}>
          <Text style={styles.label}>SIGNED IN AS</Text>
          <Text style={styles.email}>{session.user.email}</Text>

          <View style={styles.separator} />

          <Text style={styles.label}>ACCOUNT TYPE</Text>
          <Text style={styles.body}>
            {profile?.role === 'admin' ? 'Administrator' : 'Personal account'}
          </Text>

          <Text style={styles.label}>PLAN</Text>
          <Text style={styles.body}>
            {profile?.is_premium ? 'Premium' : 'Free'}
          </Text>

          {profile?.role !== 'admin' && (
            <Pressable style={styles.secondaryButton} onPress={() => void openSubscriptionAction()} disabled={busy}>
              <Text style={styles.secondaryText}>{profile?.is_premium ? 'Manage subscription and invoices' : 'Subscribe to Premium · €2.99/month'}</Text>
            </Pressable>
          )}

          {profile?.role === 'admin' && (
            <Text style={styles.success}>
              Administrator access is active.
            </Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={styles.primaryButton}
            onPress={() => changeMode('update')}
          >
            <Text style={styles.primaryText}>Change password</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {mode !== 'update' && (
            <>
              {mode === 'register' && (
                <>
                  <Text style={styles.label}>FIRST NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor="#A4A196"
                    autoCapitalize="words"
                    autoComplete="given-name"
                  />
                  <Text style={styles.label}>SURNAME</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Surname"
                    placeholderTextColor="#A4A196"
                    autoCapitalize="words"
                    autoComplete="family-name"
                  />
                </>
              )}
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#A4A196"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </>
          )}

          {mode !== 'forgot' && (
            <>
              <Text style={styles.label}>
                {mode === 'update' ? 'NEW PASSWORD' : 'PASSWORD'}
              </Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#A4A196"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <Pressable
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'register' ? 'Create account' :
                  mode === 'forgot' ? 'Send reset link' :
                  mode === 'update' ? 'Update password' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          <View style={styles.links}>
            {mode !== 'login' && (
              <Text style={styles.link} onPress={() => changeMode('login')}>
                Sign in
              </Text>
            )}
            {mode !== 'register' && (
              <Text style={styles.link} onPress={() => changeMode('register')}>
                Create account
              </Text>
            )}
            {mode !== 'forgot' && mode !== 'update' && (
              <Text style={styles.link} onPress={() => changeMode('forgot')}>
                Forgot password?
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F6F1',
    paddingHorizontal: 23,
    paddingTop: 66,
    paddingBottom: 36,
    gap: 12,
  },
  eyebrow: {
    color: '#8B887D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  title: {
    color: '#243B53',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: '#77776F',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFEFA',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ECE9E1',
    gap: 13,
  },
  label: {
    color: '#8B887D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2DFD6',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: '#243B53',
    fontSize: 14,
  },
  email: {
    color: '#243B53',
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: '#77776F',
    fontSize: 13,
    lineHeight: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#ECE9E1',
    marginVertical: 5,
  },
  primaryButton: {
    backgroundColor: '#243B53',
    borderRadius: 9,
    padding: 15,
    alignItems: 'center',
    marginTop: 5,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#243B53',
    borderRadius: 9,
    padding: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 5,
  },
  link: {
    color: '#596D7E',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  error: {
    color: '#A33B35',
    fontSize: 13,
    lineHeight: 19,
  },
  success: {
    color: '#55745D',
    fontSize: 13,
    lineHeight: 19,
  },
  disabled: {
    opacity: 0.55,
  },
})
