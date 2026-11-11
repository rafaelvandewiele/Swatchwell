import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const messages = {
  en: { reminderSubject: "Your Swatchwell Premium payment needs attention", reminder: "We could not collect your latest Swatchwell Premium payment. Your access remains active for now. Please update your payment method in account settings. We will retry daily; access ends if payment remains outstanding for five days.", cancelledSubject: "Your Swatchwell Premium subscription was cancelled", cancelled: "Your payment remained outstanding for five days, so your Swatchwell Premium subscription has been cancelled and premium access has ended." },
  nl: { reminderSubject: "Je Swatchwell Premium-betaling vereist aandacht", reminder: "We konden je meest recente betaling voor Swatchwell Premium niet innen. Je toegang blijft voorlopig actief. Werk je betaalmethode bij via je accountinstellingen. We sturen dagelijks een herinnering; na vijf dagen zonder betaling wordt je abonnement stopgezet.", cancelledSubject: "Je Swatchwell Premium-abonnement is stopgezet", cancelled: "Je betaling bleef vijf dagen openstaan. Daarom is je Swatchwell Premium-abonnement stopgezet en is je Premium-toegang beëindigd." },
  fr: { reminderSubject: "Votre paiement Swatchwell Premium nécessite votre attention", reminder: "Nous n’avons pas pu traiter votre dernier paiement Swatchwell Premium. Votre accès reste temporairement actif. Mettez à jour votre moyen de paiement dans les paramètres du compte. Nous enverrons un rappel quotidien ; après cinq jours sans paiement, l’abonnement sera résilié.", cancelledSubject: "Votre abonnement Swatchwell Premium a été résilié", cancelled: "Votre paiement est resté impayé pendant cinq jours. Votre abonnement Swatchwell Premium a donc été résilié et votre accès Premium a pris fin." },
  de: { reminderSubject: "Deine Swatchwell-Premium-Zahlung erfordert Aufmerksamkeit", reminder: "Deine letzte Zahlung für Swatchwell Premium konnte nicht eingezogen werden. Dein Zugang bleibt vorerst aktiv. Aktualisiere deine Zahlungsmethode in den Kontoeinstellungen. Wir senden täglich eine Erinnerung; nach fünf Tagen ohne Zahlung wird das Abonnement beendet.", cancelledSubject: "Dein Swatchwell-Premium-Abonnement wurde beendet", cancelled: "Deine Zahlung war fünf Tage lang offen. Deshalb wurde dein Swatchwell-Premium-Abonnement beendet und dein Premium-Zugang deaktiviert." },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = Deno.env.get("BILLING_CRON_SECRET");
  if (!expected || req.headers.get("Authorization") !== "Bearer " + expected) return new Response("Unauthorized", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), stripeKey = Deno.env.get("STRIPE_SECRET_KEY"), resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !service || !stripeKey || !resendKey) return new Response("Billing automation is not configured.", { status: 503 });
  const admin = createClient(url, service);
  const { data: rows, error } = await admin.from("billing_subscriptions").select("user_id,stripe_subscription_id,status,failed_at,last_dunning_email_at").not("failed_at", "is", null).in("status", ["past_due", "unpaid"]);
  if (error) return new Response("Could not load overdue subscriptions.", { status: 500 });
  const now = Date.now();
  let reminders = 0, cancelled = 0;
  for (const row of rows ?? []) {
    const failedAt = new Date(row.failed_at).getTime();
    const daysOverdue = Math.floor((now - failedAt) / 86400000);
    const { data: profile } = await admin.from("profiles").select("email,language,role").eq("id", row.user_id).maybeSingle();
    if (!profile || profile.role === "admin") continue;
    const language = profile.language in messages ? profile.language as keyof typeof messages : "en";
    const copy = messages[language];
    if (daysOverdue >= 5) {
      const cancelResponse = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(row.stripe_subscription_id), { method: "DELETE", headers: { Authorization: "Bearer " + stripeKey } });
      if (!cancelResponse.ok) continue;
      await admin.from("billing_subscriptions").update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq("user_id", row.user_id);
      await admin.from("profiles").update({ premium_source: "none", updated_at: new Date().toISOString() }).eq("id", row.user_id);
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Swatchwell <swatchwell@veyca.dev>", to: [profile.email], subject: copy.cancelledSubject, text: copy.cancelled }) });
      if (response.ok) cancelled++;
      continue;
    }
    const lastSent = row.last_dunning_email_at ? new Date(row.last_dunning_email_at).getTime() : 0;
    if (lastSent && now - lastSent < 23 * 3600000) continue;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Swatchwell <swatchwell@veyca.dev>", to: [profile.email], subject: copy.reminderSubject, text: copy.reminder + "\n\nhttps://swatchwell.veyca.dev/settings" }) });
    if (response.ok) {
      await admin.from("billing_subscriptions").update({ last_dunning_email_at: new Date().toISOString() }).eq("user_id", row.user_id);
      reminders++;
    }
  }
  return new Response(JSON.stringify({ reminders, cancelled }), { headers: { "Content-Type": "application/json" } });
});
