import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n, type Language } from '../../lib/i18n'
import './SettingsPage.css'

const copy = {
  en: { title:'Settings', intro:'Manage your personal details and account.', profile:'Personal details', first:'First name', last:'Surname', language:'Preferred language', save:'Save changes', saving:'Saving…', saved:'Your settings have been saved.', deleteTitle:'Delete account', deleteText:'Request a confirmation email to permanently delete your account and associated personal data. This cannot be undone.', deleteButton:'Send confirmation email', sent:'If your account is eligible, a confirmation email has been sent to your account address.', confirmTitle:'Confirm account deletion', confirmText:'This will permanently delete your account and its associated data.', confirmButton:'Permanently delete my account', done:'Your account has been deleted.', error:'Something went wrong. Please try again.', signIn:'Sign in to manage your settings.' },
  nl: { title:'Instellingen', intro:'Beheer je persoonlijke gegevens en account.', profile:'Persoonlijke gegevens', first:'Voornaam', last:'Achternaam', language:'Voorkeurstaal', save:'Wijzigingen opslaan', saving:'Opslaan…', saved:'Je instellingen zijn opgeslagen.', deleteTitle:'Account verwijderen', deleteText:'Vraag een bevestigingsmail aan om je account en bijbehorende persoonsgegevens definitief te verwijderen. Dit kan niet ongedaan worden gemaakt.', deleteButton:'Bevestigingsmail versturen', sent:'Als je account hiervoor in aanmerking komt, is een bevestigingsmail naar je accountadres verstuurd.', confirmTitle:'Accountverwijdering bevestigen', confirmText:'Je account en bijbehorende gegevens worden definitief verwijderd.', confirmButton:'Mijn account definitief verwijderen', done:'Je account is verwijderd.', error:'Er is iets misgegaan. Probeer het opnieuw.', signIn:'Meld je aan om je instellingen te beheren.' },
  fr: { title:'Paramètres', intro:'Gérez vos informations personnelles et votre compte.', profile:'Informations personnelles', first:'Prénom', last:'Nom', language:'Langue préférée', save:'Enregistrer', saving:'Enregistrement…', saved:'Vos paramètres ont été enregistrés.', deleteTitle:'Supprimer le compte', deleteText:'Demandez un e-mail de confirmation pour supprimer définitivement votre compte et les données personnelles associées. Cette action est irréversible.', deleteButton:'Envoyer l’e-mail de confirmation', sent:'Si votre compte est éligible, un e-mail de confirmation a été envoyé à votre adresse.', confirmTitle:'Confirmer la suppression', confirmText:'Votre compte et les données associées seront définitivement supprimés.', confirmButton:'Supprimer définitivement mon compte', done:'Votre compte a été supprimé.', error:'Une erreur est survenue. Veuillez réessayer.', signIn:'Connectez-vous pour gérer vos paramètres.' },
  de: { title:'Einstellungen', intro:'Verwalte deine persönlichen Daten und dein Konto.', profile:'Persönliche Daten', first:'Vorname', last:'Nachname', language:'Bevorzugte Sprache', save:'Änderungen speichern', saving:'Speichern…', saved:'Deine Einstellungen wurden gespeichert.', deleteTitle:'Konto löschen', deleteText:'Fordere eine Bestätigungs-E-Mail an, um dein Konto und die zugehörigen personenbezogenen Daten dauerhaft zu löschen. Dieser Vorgang kann nicht rückgängig gemacht werden.', deleteButton:'Bestätigungs-E-Mail senden', sent:'Falls dein Konto dafür infrage kommt, wurde eine Bestätigungs-E-Mail an deine Konto-Adresse gesendet.', confirmTitle:'Kontolöschung bestätigen', confirmText:'Dein Konto und die zugehörigen Daten werden dauerhaft gelöscht.', confirmButton:'Mein Konto endgültig löschen', done:'Dein Konto wurde gelöscht.', error:'Etwas ist schiefgelaufen. Bitte versuche es erneut.', signIn:'Melde dich an, um deine Einstellungen zu verwalten.' },
} satisfies Record<Language, Record<string,string>>

export default function SettingsPage({ confirmDeletion = false }: { confirmDeletion?: boolean }) {
  const { language, setLanguage } = useI18n()
  const c = copy[language]
  const [firstName,setFirstName] = useState('')
  const [lastName,setLastName] = useState('')
  const [email,setEmail] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const [signedIn,setSignedIn] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getUser().then(async ({data}) => {
      if (!active || !data.user) return
      setSignedIn(true)
      setEmail(data.user.email ?? '')
      const {data: profile} = await supabase.from('profiles').select('first_name,last_name,language').eq('id',data.user.id).maybeSingle()
      if (!active || !profile) return
      setFirstName(profile.first_name ?? '')
      setLastName(profile.last_name ?? '')
      if (['nl','en','fr','de'].includes(profile.language)) setLanguage(profile.language as Language)
    })
    return () => { active = false }
  }, [setLanguage])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const {error: saveError} = await supabase.rpc('update_my_profile', {p_first_name:firstName.trim(),p_last_name:lastName.trim(),p_language:language})
    if (saveError) setError(c.error)
    else setMessage(c.saved)
    setBusy(false)
  }

  async function requestDeletion() {
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const {error: invokeError} = await supabase.functions.invoke('account-deletion', {body:{action:'request'}})
    if (invokeError) setError(c.error)
    else setMessage(c.sent)
    setBusy(false)
  }

  async function confirm() {
    if (!supabase) return
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setError(c.error); return }
    setBusy(true); setError(''); setMessage('')
    const {data,error: invokeError} = await supabase.functions.invoke('account-deletion', {body:{action:'confirm',token}})
    if (invokeError || !data?.success) setError(c.error)
    else { setMessage(c.done); await supabase.auth.signOut({scope:'local'}); window.history.replaceState({},'', '/') }
    setBusy(false)
  }

  return <div className="settings-page page-content">
    <div className="eyebrow">SWATCHWELL</div>
    <h1>{confirmDeletion ? c.confirmTitle : c.title}</h1>
    <p className="settings-intro">{confirmDeletion ? c.confirmText : c.intro}</p>
    {!signedIn && !confirmDeletion ? <p>{c.signIn}</p> : confirmDeletion ? <section className="settings-card settings-danger"><p>{email}</p><button className="settings-danger-button" disabled={busy} onClick={confirm}>{busy ? '…' : c.confirmButton}</button></section> : <>
      <form className="settings-card" onSubmit={save}>
        <h2>{c.profile}</h2>
        <label>{c.first}<input value={firstName} maxLength={80} required onChange={e=>setFirstName(e.target.value)} /></label>
        <label>{c.last}<input value={lastName} maxLength={80} required onChange={e=>setLastName(e.target.value)} /></label>
        <label>{c.language}<select value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="nl">Nederlands</option><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option></select></label>
        <button className="settings-primary" disabled={busy}>{busy ? c.saving : c.save}</button>
      </form>
      <section className="settings-card settings-danger">
        <h2>{c.deleteTitle}</h2><p>{c.deleteText}</p><p className="settings-email">{email}</p>
        <button type="button" className="settings-danger-button" disabled={busy} onClick={requestDeletion}>{busy ? '…' : c.deleteButton}</button>
      </section>
    </>}
    {message && <p className="settings-success" role="status">{message}</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>
}
