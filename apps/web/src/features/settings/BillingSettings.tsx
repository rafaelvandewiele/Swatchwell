import { useEffect, useState } from 'react'
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

const copy = {
  en: { title:'Swatchwell Premium', intro:'Unlock guided colour combinations and upcoming premium features.', free:'Free plan', premium:'Premium', price:'€2.99 / month', subscribe:'Subscribe', manage:'Manage subscription and invoices', admin:'Administrator access is always Premium.', cancelAt:'Renews are cancelled. Access remains available until', loading:'Loading billing details…', signIn:'Sign in to manage your subscription.', error:'Billing could not be completed. Please try again.', users:'User access management', grant:'Grant Premium', revoke:'Revoke Premium', source:'Access source', active:'Active', pastDue:'Payment overdue', cancelled:'Cancelled', noSubscription:'No active subscription.' },
  nl: { title:'Swatchwell Premium', intro:'Ontgrendel begeleide kleurencombinaties en toekomstige premiumfuncties.', free:'Gratis abonnement', premium:'Premium', price:'€2,99 / maand', subscribe:'Abonneren', manage:'Abonnement en facturen beheren', admin:'Administrator-toegang heeft altijd Premium.', cancelAt:'De verlenging is stopgezet. Je behoudt toegang tot', loading:'Betalingsgegevens laden…', signIn:'Meld je aan om je abonnement te beheren.', error:'De betaling kon niet worden gestart. Probeer opnieuw.', users:'Gebruikerstoegang beheren', grant:'Premium toekennen', revoke:'Premium intrekken', source:'Toegangsbron', active:'Actief', pastDue:'Betaling achterstallig', cancelled:'Stopgezet', noSubscription:'Geen actief abonnement.' },
  fr: { title:'Swatchwell Premium', intro:'Débloquez les combinaisons de couleurs guidées et les prochaines fonctionnalités Premium.', free:'Offre gratuite', premium:'Premium', price:'2,99 € / mois', subscribe:'S’abonner', manage:'Gérer l’abonnement et les factures', admin:'L’accès administrateur inclut toujours Premium.', cancelAt:'Le renouvellement est désactivé. Votre accès reste actif jusqu’au', loading:'Chargement des informations de facturation…', signIn:'Connectez-vous pour gérer votre abonnement.', error:'Le paiement n’a pas pu démarrer. Veuillez réessayer.', users:'Gérer les accès utilisateurs', grant:'Accorder Premium', revoke:'Retirer Premium', source:'Source d’accès', active:'Actif', pastDue:'Paiement en retard', cancelled:'Résilié', noSubscription:'Aucun abonnement actif.' },
  de: { title:'Swatchwell Premium', intro:'Schalte geführte Farbkombinationen und kommende Premium-Funktionen frei.', free:'Kostenloser Tarif', premium:'Premium', price:'2,99 € / Monat', subscribe:'Abonnieren', manage:'Abonnement und Rechnungen verwalten', admin:'Administratorzugriff beinhaltet immer Premium.', cancelAt:'Die Verlängerung wurde deaktiviert. Dein Zugang bleibt bis zum', loading:'Abrechnungsdaten werden geladen…', signIn:'Melde dich an, um dein Abonnement zu verwalten.', error:'Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.', users:'Benutzerzugriff verwalten', grant:'Premium gewähren', revoke:'Premium entziehen', source:'Zugriffsquelle', active:'Aktiv', pastDue:'Zahlung überfällig', cancelled:'Gekündigt', noSubscription:'Kein aktives Abonnement.' },
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
  const [error, setError] = useState('')

  async function refresh() {
    if (!supabase) { setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSignedIn(false); setLoading(false); return }
    setSignedIn(true)
    const { data: profile } = await supabase.from('profiles').select('role,is_premium').eq('id', user.id).maybeSingle()
    setRole(profile?.role ?? 'user')
    setPremium(Boolean(profile?.is_premium))
    const { data: sub } = await supabase.from('billing_subscriptions').select('status,current_period_end,cancel_at_period_end').eq('user_id', user.id).maybeSingle()
    setSubscription(sub)
    if (profile?.role === 'admin') {
      const { data: rows } = await supabase.from('profiles').select('id,email,role,is_premium,premium_source').order('created_at', { ascending: false })
      setUsers((rows ?? []) as AdminUser[])
    }
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  async function openCheckout() {
    if (!supabase) return
    setBusy(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('create-checkout-session', { body: {} })
    if (invokeError || !data?.url) { setError(c.error); setBusy(false); return }
    window.location.assign(data.url)
  }

  async function openPortal() {
    if (!supabase) return
    setBusy(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('create-billing-portal', { body: {} })
    if (invokeError || !data?.url) { setError(c.error); setBusy(false); return }
    window.location.assign(data.url)
  }

  async function setUserPremium(userId: string, enabled: boolean) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('admin_set_premium', { p_user_id: userId, p_enabled: enabled })
    if (rpcError) setError(c.error)
    await refresh()
    setBusy(false)
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
    {role === 'admin' && <div className="billing-admin">
      <h3>{c.users}</h3>
      {users.filter(user => user.role !== 'admin').map(user => <div className="billing-user" key={user.id}>
        <div><strong>{user.email}</strong><small>{c.source}: {user.premium_source}</small></div>
        <button type="button" className="settings-secondary" disabled={busy} onClick={() => void setUserPremium(user.id, user.premium_source !== 'admin')}>{user.premium_source === 'admin' ? c.revoke : c.grant}</button>
      </div>)}
    </div>}
  </section>
}
