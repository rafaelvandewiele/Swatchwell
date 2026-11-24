/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dunningCancellationIdempotencyKey,
  dunningReminderIdempotencyKey,
  normalizeDunningLanguage,
} from "../_shared/billing-dunning.ts";

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
  const { data: rows, error } = await admin.from("billing_subscriptions").select("user_id,stripe_subscription_id,status,failed_at,last_dunning_email_at").not("failed_at", "is", null).in("status", ["past_due", "unpaid", "canceled"]);
  if (error) return new Response("Could not load overdue subscriptions.", { status: 500 });
  const now = Date.now();
  let reminders = 0, cancelled = 0;
  for (const row of rows ?? []) {
    const failedAt = new Date(row.failed_at).getTime();
    const daysOverdue = Math.floor((now - failedAt) / 86400000);
    if (!Number.isFinite(failedAt)) {
      console.error("Invalid failed_at timestamp for subscription", row.stripe_subscription_id);
      return new Response("Invalid subscription failure timestamp.", { status: 500 });
    }
    const { data: profile, error: profileError } = await admin.from("profiles").select("email,language,role").eq("id", row.user_id).maybeSingle();
    if (profileError) return new Response("Could not load an overdue subscription profile.", { status: 500 });
    if (!profile || profile.role === "admin" || !profile.email) continue;

    // The local subscription row can lag behind Stripe if a webhook was
    // delayed. Never cancel or remind based only on a stale database status.
    const stripeStateResponse = await fetch(
      "https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(row.stripe_subscription_id),
      { headers: { Authorization: "Bearer " + stripeKey } },
    );
    if (!stripeStateResponse.ok) {
      console.error("Could not verify the current Stripe subscription", row.stripe_subscription_id);
      return new Response("Could not verify an overdue Stripe subscription.", { status: 502 });
    }
    const currentSubscription = await stripeStateResponse.json();
    if (["active", "trialing"].includes(currentSubscription.status)) {
      const { error: subscriptionSyncError } = await admin.from("billing_subscriptions")
        .update({
          status: currentSubscription.status,
          failed_at: null,
          last_dunning_email_at: null,
          current_period_start: currentSubscription.current_period_start
            ? new Date(currentSubscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: currentSubscription.current_period_end
            ? new Date(currentSubscription.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: Boolean(currentSubscription.cancel_at_period_end),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id);
      if (subscriptionSyncError) return new Response("Could not synchronize a recovered subscription.", { status: 500 });
      const { error: profileSyncError } = await admin.from("profiles")
        .update({ premium_source: "subscription", updated_at: new Date().toISOString() })
        .eq("id", row.user_id);
      if (profileSyncError) return new Response("Could not restore Premium access for a recovered subscription.", { status: 500 });
      continue;
    }

    if (!["past_due", "unpaid"].includes(currentSubscription.status)) {
      const { error: subscriptionSyncError } = await admin.from("billing_subscriptions")
        .update({
          status: currentSubscription.status,
          failed_at: currentSubscription.status === "canceled" ? row.failed_at : null,
          last_dunning_email_at: null,
          cancel_at_period_end: Boolean(currentSubscription.cancel_at_period_end),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id);
      if (subscriptionSyncError) return new Response("Could not synchronize a non-overdue subscription.", { status: 500 });
      const { error: profileSyncError } = await admin.from("profiles")
        .update({ premium_source: "none", updated_at: new Date().toISOString() })
        .eq("id", row.user_id);
      if (profileSyncError) return new Response("Could not revoke access for a non-active subscription.", { status: 500 });
      continue;
    }

    const language = normalizeDunningLanguage(profile.language);
    const copy = messages[language];

    // A cancelled row with a pending notification is retried on the next
    // scheduler run. last_dunning_email_at is cleared when cancellation is
    // persisted and set only after Resend accepts the notification.
    if (row.status === "canceled") {
      if (row.last_dunning_email_at) continue;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": dunningCancellationIdempotencyKey(row.stripe_subscription_id),
        },
        body: JSON.stringify({
          from: "Swatchwell <swatchwell@veyca.dev>",
          to: [profile.email],
          subject: copy.cancelledSubject,
          text: copy.cancelled,
        }),
      });
      if (!response.ok) {
        console.error("Could not send subscription cancellation email", row.stripe_subscription_id);
        return new Response("Could not send a subscription cancellation notification.", { status: 502 });
      }
      const { error: notificationUpdateError } = await admin.from("billing_subscriptions")
        .update({ last_dunning_email_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (notificationUpdateError) return new Response("Could not persist the cancellation notification timestamp.", { status: 500 });
      cancelled++;
      continue;
    }

    if (daysOverdue >= 5) {
      const cancelResponse = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(row.stripe_subscription_id), { method: "DELETE", headers: { Authorization: "Bearer " + stripeKey } });
      if (!cancelResponse.ok) {
        console.error("Could not cancel overdue Stripe subscription", row.stripe_subscription_id);
        return new Response("Could not cancel an overdue Stripe subscription.", { status: 502 });
      }
      // Revoke access first. If the subscription-row update then fails, the
      // overdue row remains eligible for retry and this update is idempotent.
      const { error: profileUpdateError } = await admin.from("profiles")
        .update({ premium_source: "none", updated_at: new Date().toISOString() })
        .eq("id", row.user_id);
      if (profileUpdateError) return new Response("Could not revoke overdue Premium access.", { status: 500 });

      const { error: subscriptionUpdateError } = await admin.from("billing_subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false, last_dunning_email_at: null, updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (subscriptionUpdateError) return new Response("Could not persist the cancelled subscription.", { status: 500 });

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": dunningCancellationIdempotencyKey(row.stripe_subscription_id),
        },
        body: JSON.stringify({
          from: "Swatchwell <swatchwell@veyca.dev>",
          to: [profile.email],
          subject: copy.cancelledSubject,
          text: copy.cancelled,
        }),
      });
      if (!response.ok) {
        console.error("Could not send subscription cancellation email", row.stripe_subscription_id);
        return new Response("Could not send a subscription cancellation notification.", { status: 502 });
      }
      const { error: notificationUpdateError } = await admin.from("billing_subscriptions")
        .update({ last_dunning_email_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (notificationUpdateError) return new Response("Could not persist the cancellation notification timestamp.", { status: 500 });
      cancelled++;
      continue;
    }
    const lastSent = row.last_dunning_email_at ? new Date(row.last_dunning_email_at).getTime() : 0;
    if (lastSent && now - lastSent < 23 * 3600000) continue;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json", "Idempotency-Key": dunningReminderIdempotencyKey(row.stripe_subscription_id, new Date(now)) }, body: JSON.stringify({ from: "Swatchwell <swatchwell@veyca.dev>", to: [profile.email], subject: copy.reminderSubject, text: copy.reminder + "\n\nhttps://swatchwell.veyca.dev/settings" }) });
    if (response.ok) {
      const { error: reminderUpdateError } = await admin.from("billing_subscriptions")
        .update({ last_dunning_email_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (reminderUpdateError) return new Response("Could not persist the payment reminder timestamp.", { status: 500 });
      reminders++;
    } else {
      console.error("Could not send payment reminder", row.stripe_subscription_id);
    }
  }
  return new Response(JSON.stringify({ reminders, cancelled }), { headers: { "Content-Type": "application/json" } });
});
