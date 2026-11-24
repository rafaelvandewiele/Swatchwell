import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'

type Subscription = {
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

type AdminUser = {
  id: string
  email: string
  role: string
  is_premium: boolean
  premium_source: string
}
type AdminSubscription = { status: string; cancel_at_period_end: boolean }

const copy = {
  en: { title:'Swatchwell Premium', intro:'Unlock guided colour combinations and upcoming premium features.', free:'Free plan', premium:'Premium', price:'€2.99 / month', subscribe:'Subscribe', manage:'Manage subscription and invoices', admin:'Administrator access is always Premium.', cancelAt:'Renews are cancelled. Access remains available until', loading:'Loading billing details…', signIn:'Sign in to manage your subscription.', error:'Billing could not be completed. Please try again.', grantSuccess:'Premium access updated successfully.', grantFailure:'Premium access could not be updated: ', migrationMissing:'The Premium admin database function is not installed. Apply the Stripe subscriptions migration in Supabase, then try again.', users:'User access management', grant:'Grant Premium', revoke:'Revoke Premium', source:'Access source', active:'Active', pastDue:'Payment overdue', cancelled:'Cancelled', noSubscription:'No active subscription.', cancelNow:'Cancel immediately', cancelEnd:'Cancel at period end', resume:'Resume renewal' },
  nl: { title:'Swatchwell Premium', intro:'Ontgrendel begeleide kleurencombinaties en toekomstige premiumfuncties.', free:'Gratis abonnement', premium:'Premium', price:'€2,99 / maand', subscribe:'Abonneren', manage:'Abonnement en facturen beheren', admin:'Administrator-toegang heeft altijd Premium.', cancelAt:'De verlenging is stopgezet. Je behoudt toegang tot', loading:'Betalingsgegevens laden…', signIn:'Meld je aan om je abonnement te beheren.', error:'De betaling kon niet worden gestart. Probeer opnieuw.', grantSuccess:'Premium-toegang is bijgewerkt.', grantFailure:'Premium-toegang kon niet worden bijgewerkt: ', migrationMissing:'De databasefunctie voor Premium-beheer is niet geïnstalleerd. Voer de Stripe-subscriptions-migratie uit in Supabase en probeer opnieuw.', users:'Gebruikerstoegang beheren', grant:'Premium toekennen', revoke:'Premium intrekken', source:'Toegangsbron', active:'Actief', pastDue:'Betaling achterstallig', cancelled:'Stopgezet', noSubscription:'Geen actief abonnement.', cancelNow:'Onmiddellijk stopzetten', cancelEnd:'Stopzetten op einddatum', resume:'Verlenging hervatten' },
  fr: { title:'Swatchwell Premium', intro:'Débloquez les combinaisons de couleurs guidées et les prochaines fonctionnalités Premium.', free:'Offre gratuite', premium:'Premium', price:'2,99 € / mois', subscribe:'S’abonner', manage:'Gérer l’abonnement et les factures', admin:'L’accès administrateur inclut toujours Premium.', cancelAt:'Le renouvellement est désactivé. Votre accès reste actif jusqu’au', loading:'Chargement des informations de facturation…', signIn:'Connectez-vous pour gérer votre abonnement.', error:'Le paiement n’a pas pu démarrer. Veuillez réessayer.', grantSuccess:'L’accès Premium a été mis à jour.', grantFailure:'Impossible de mettre à jour l’accès Premium : ', migrationMissing:'La fonction de gestion Premium n’est pas installée dans la base de données. Appliquez la migration Stripe dans Supabase, puis réessayez.', users:'Gérer les accès utilisateurs', grant:'Accorder Premium', revoke:'Retirer Premium', source:'Source d’accès', active:'Actif', pastDue:'Paiement en retard', cancelled:'Résilié', noSubscription:'Aucun abonnement actif.', cancelNow:'Résilier immédiatement', cancelEnd:'Résilier à la fin de la période', resume:'Reprendre le renouvellement' },
  de: { title:'Swatchwell Premium', intro:'Schalte geführte Farbkombinationen und kommende Premium-Funktionen frei.', free:'Kostenloser Tarif', premium:'Premium', price:'2,99 € / Monat', subscribe:'Abonnieren', manage:'Abonnement und Rechnungen verwalten', admin:'Administratorzugriff beinhaltet immer Premium.', cancelAt:'Die Verlängerung wurde deaktiviert. Dein Zugang bleibt bis zum', loading:'Abrechnungsdaten werden geladen…', signIn:'Melde dich an, um dein Abonnement zu verwalten.', error:'Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.', grantSuccess:'Der Premium-Zugang wurde aktualisiert.', grantFailure:'Der Premium-Zugang konnte nicht aktualisiert werden: ', migrationMissing:'Die Premium-Admin-Datenbankfunktion ist nicht installiert. Wende die Stripe-Migration in Supabase an und versuche es erneut.', users:'Benutzerzugriff verwalten', grant:'Premium gewähren', revoke:'Premium entziehen', source:'Zugriffsquelle', active:'Aktiv', pastDue:'Zahlung überfällig', cancelled:'Gekündigt', noSubscription:'Kein aktives Abonnement.', cancelNow:'Sofort kündigen', cancelEnd:'Zum Periodenende kündigen', resume:'Verlängerung fortsetzen' },
} as const

export default function BillingSettings() {
  const { language } = useI18n()
  const c = copy[language]
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [role, setRole] = useState('user')
  const [premium, setPremium] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [subscriptions, setSubscriptions] = useState<Record<string, AdminSubscription>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeUserIdRef = useRef<string | null>(null)
  const loadGeneration = useRef(0)

  function clearAccountState() {
    setSignedIn(false)
    setRole('user')
    setPremium(false)
    setSubscription(null)
    setUsers([])
    setSubscriptions({})
    setError('')
    setNotice('')
    setBusy(false)
  }

  async function refresh(expectedUserId?: string) {
    if (!supabase) { setLoading(false); return }
    const request = ++loadGeneration.current
    setLoading(true)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (request !== loadGeneration.current) return
      if (!user?.email_confirmed_at) {
        if (expectedUserId && activeUserIdRef.current !== expectedUserId) return
        activeUserIdRef.current = null
        clearAccountState()
        return
      }
      if (expectedUserId && (user.id !== expectedUserId || activeUserIdRef.current !== expectedUserId)) return
      if (activeUserIdRef.current !== user.id) {
        activeUserIdRef.current = user.id
        clearAccountState()
      }

      const [profileResult, subscriptionResult] = await Promise.all([
        supabase.from('profiles').select('role,is_premium').eq('id', user.id).maybeSingle(),
        supabase.from('billing_subscriptions').select('status,current_period_end,cancel_at_period_end').eq('user_id', user.id).maybeSingle(),
      ])
      if (request !== loadGeneration.current || activeUserIdRef.current !== user.id) return
      if (profileResult.error) throw profileResult.error
      if (subscriptionResult.error) throw subscriptionResult.error

      const profile = profileResult.data
      setSignedIn(true)
      setRole(profile?.role ?? 'user')
      setPremium(Boolean(profile?.is_premium))
      setSubscription(subscriptionResult.data)

      if (profile?.role === 'admin') {
        const [rowsResult, subscriptionsResult] = await Promise.all([
          supabase.from('profiles').select('id,email,role,is_premium,premium_source').order('created_at', { ascending: false }),
          supabase.from('billing_subscriptions').select('user_id,status,cancel_at_period_end'),
        ])
        if (request !== loadGeneration.current || activeUserIdRef.current !== user.id) return
        if (rowsResult.error) throw rowsResult.error
        if (subscriptionsResult.error) throw subscriptionsResult.error
        setUsers((rowsResult.data ?? []) as AdminUser[])
        setSubscriptions(Object.fromEntries((subscriptionsResult.data ?? []).map(row => [
          row.user_id,
          { status: row.status, cancel_at_period_end: row.cancel_at_period_end },
        ])))
      } else {
        setUsers([])
        setSubscriptions({})
      }
    } catch {
      if (request === loadGeneration.current && (!expectedUserId || activeUserIdRef.current === expectedUserId)) setError(c.error)
    } finally {
      if (request === loadGeneration.current && (!expectedUserId || activeUserIdRef.current === expectedUserId)) setLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    void refresh()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.email_confirmed_at ? session.user.id : null
      if (nextUserId === activeUserIdRef.current) return
      loadGeneration.current++
      activeUserIdRef.current = nextUserId
      clearAccountState()
      setLoading(Boolean(nextUserId))
      queueMicrotask(() => { void refresh(nextUserId ?? undefined) })
    })
    return () => {
      loadGeneration.current++
      listener.subscription.unsubscribe()
    }
  }, [])

  async function openCheckout() {
    const expectedUserId = activeUserIdRef.current
    if (!supabase || !expectedUserId) return
    setBusy(true); setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-checkout-session', { body: {} })
      if (activeUserIdRef.current !== expectedUserId) return
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (authData.user?.id !== expectedUserId) return
      if (invokeError || !data?.url) throw new Error(c.error)
      window.location.assign(data.url)
    } catch {
      if (activeUserIdRef.current === expectedUserId) setError(c.error)
    } finally {
      if (activeUserIdRef.current === expectedUserId) setBusy(false)
    }
  }

  async function openPortal() {
    const expectedUserId = activeUserIdRef.current
    if (!supabase || !expectedUserId) return
    setBusy(true); setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-billing-portal', { body: {} })
      if (activeUserIdRef.current !== expectedUserId) return
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (authData.user?.id !== expectedUserId) return
      if (invokeError || !data?.url) throw new Error(c.error)
      window.location.assign(data.url)
    } catch {
      if (activeUserIdRef.current === expectedUserId) setError(c.error)
    } finally {
      if (activeUserIdRef.current === expectedUserId) setBusy(false)
    }
  }

  async function setUserPremium(userId: string, enabled: boolean) {
    const expectedAdminId = activeUserIdRef.current
    if (!supabase || !expectedAdminId) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (authData.user?.id !== expectedAdminId || activeUserIdRef.current !== expectedAdminId) return
      const { error: rpcError } = await supabase.rpc('admin_set_premium', { p_user_id: userId, p_enabled: enabled })
      if (activeUserIdRef.current !== expectedAdminId) return
      if (rpcError) {
        const missingFunction = rpcError.code === 'PGRST202' || rpcError.message.toLowerCase().includes('admin_set_premium')
        setError(missingFunction ? c.migrationMissing : c.grantFailure + rpcError.message)
      } else {
        setNotice(c.grantSuccess)
      }
      await refresh(expectedAdminId)
    } catch {
      if (activeUserIdRef.current === expectedAdminId) setError(c.error)
    } finally {
      if (activeUserIdRef.current === expectedAdminId) setBusy(false)
    }
  }

  async function updateSubscription(userId: string, action: 'cancel_now' | 'cancel_at_period_end' | 'resume') {
    const expectedAdminId = activeUserIdRef.current
    if (!supabase || !expectedAdminId) return
    if (action === 'cancel_now' && !window.confirm('Cancel this Stripe subscription immediately?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (authData.user?.id !== expectedAdminId || activeUserIdRef.current !== expectedAdminId) return
      const { error: invokeError } = await supabase.functions.invoke('admin-update-subscription', { body: { userId, action } })
      if (activeUserIdRef.current !== expectedAdminId) return
      if (invokeError) setError(c.error)
      await refresh(expectedAdminId)
    } catch {
      if (activeUserIdRef.current === expectedAdminId) setError(c.error)
    } finally {
      if (activeUserIdRef.current === expectedAdminId) setBusy(false)
    }
  }

  if (loading) return <section className="settings-card"><p>{c.loading}</p></section>
  if (!signedIn) return <section className="settings-card"><h2>{c.title}</h2><p>{c.signIn}</p></section>

  return <section className="settings-card billing-settings">
    <h2>{c.title}</h2>
    <p>{c.intro}</p>
    <div className="billing-plan">
      <div><strong>{role === 'admin' || premium ? c.premium : c.free}</strong><p>{role === 'admin' ? c.admin : c.price}</p></div>
      {role !== 'admin' && !premium && <button type="button" className="settings-primary" disabled={busy} onClick={() => void openCheckout()}>{c.subscribe}</button>}
      {role !== 'admin' && premium && <button type="button" className="settings-primary" disabled={busy} onClick={() => void openPortal()}>{c.manage}</button>}
    </div>
    {subscription && <div className="billing-status">
      <p>{subscription.status === 'active' ? c.active : subscription.status === 'past_due' ? c.pastDue : subscription.status === 'canceled' ? c.cancelled : subscription.status}</p>
      {subscription.cancel_at_period_end && subscription.current_period_end && <p>{c.cancelAt} {new Date(subscription.current_period_end).toLocaleDateString(language)}</p>}
      {role !== 'admin' && <button type="button" className="settings-secondary" disabled={busy} onClick={() => void openPortal()}>{c.manage}</button>}
    </div>}
    {error && <p className="settings-error" role="alert">{error}</p>}
    {notice && <p className="settings-success" role="status">{notice}</p>}
    {role === 'admin' && <div className="billing-admin">
      <h3>{c.users}</h3>
      {users.filter(user => user.role !== 'admin').map(user => <div className="billing-user" key={user.id}>
        <div><strong>{user.email}</strong><small>{c.source}: {user.premium_source}</small></div>
        <div className="billing-user-actions">
          <button type="button" className="settings-secondary" disabled={busy} onClick={() => void setUserPremium(user.id, user.premium_source !== 'admin')}>{user.premium_source === 'admin' ? c.revoke : c.grant}</button>
          {subscriptions[user.id] && subscriptions[user.id].status !== 'canceled' && <>
            {subscriptions[user.id].cancel_at_period_end
              ? <button type="button" className="settings-secondary" disabled={busy} onClick={() => void updateSubscription(user.id, 'resume')}>{c.resume}</button>
              : <button type="button" className="settings-secondary" disabled={busy} onClick={() => void updateSubscription(user.id, 'cancel_at_period_end')}>{c.cancelEnd}</button>}
            <button type="button" className="settings-danger-button" disabled={busy} onClick={() => void updateSubscription(user.id, 'cancel_now')}>{c.cancelNow}</button>
          </>}
        </div>
      </div>)}
    </div>}
  </section>
}
