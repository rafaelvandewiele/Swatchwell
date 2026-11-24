/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowed = (origin: string) => origin === "https://swatchwell.veyca.dev" || /^https:\/\/[a-z0-9-]+\.swatchwell\.pages\.dev$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
const cors = (origin: string) => ({ "Access-Control-Allow-Origin": allowed(origin) ? origin : "https://swatchwell.veyca.dev", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !anon || !service || !stripeKey) return json({ error: "Billing is not configured." }, 503, origin);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || !user.email_confirmed_at) return json({ error: "Authentication required." }, 401, origin);
  const admin = createClient(url, service);
  const { data: actor, error: actorError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (actorError) return json({ error: "Could not verify administrator access." }, 500, origin);
  if (actor?.role !== "admin") return json({ error: "Administrator access required." }, 403, origin);
  let body: { userId?: string; action?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400, origin); }
  if (!body.userId || !["cancel_now", "cancel_at_period_end", "resume"].includes(body.action ?? "")) return json({ error: "Invalid subscription action." }, 400, origin);
  const { data: target, error: targetError } = await admin.from("billing_subscriptions").select("stripe_subscription_id").eq("user_id", body.userId).maybeSingle();
  if (targetError) return json({ error: "Could not load the target subscription." }, 500, origin);
  if (!target?.stripe_subscription_id) return json({ error: "No subscription found for this user." }, 404, origin);

  let response: Response;
  if (body.action === "cancel_now") {
    response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(target.stripe_subscription_id), { method: "DELETE", headers: { Authorization: "Bearer " + stripeKey } });
  } else {
    const form = new URLSearchParams({ cancel_at_period_end: body.action === "cancel_at_period_end" ? "true" : "false" });
    response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(target.stripe_subscription_id), { method: "POST", headers: { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  }
  const result = await response.json();
  if (!response.ok) return json({ error: "Stripe could not update this subscription." }, 502, origin);
  if (body.action === "cancel_now") {
    const { error: subscriptionUpdateError } = await admin.from("billing_subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false, failed_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", body.userId);
    if (subscriptionUpdateError) return json({ error: "Stripe cancelled the subscription, but its local status could not be updated. The webhook will retry synchronization." }, 500, origin);

    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", body.userId).maybeSingle();
    if (profileError) return json({ error: "Stripe cancelled the subscription, but account access could not be verified." }, 500, origin);
    if (!profile) return json({ error: "Stripe cancelled the subscription, but the account profile could not be found." }, 500, origin);
    if (profile.role !== "admin") {
      const { error: premiumUpdateError } = await admin.from("profiles")
        .update({ premium_source: "none", updated_at: new Date().toISOString() })
        .eq("id", body.userId);
      if (premiumUpdateError) return json({ error: "Stripe cancelled the subscription, but Premium access could not be synchronized." }, 500, origin);
    }
  } else {
    const { error: subscriptionUpdateError } = await admin.from("billing_subscriptions")
      .update({
        cancel_at_period_end: Boolean(result.cancel_at_period_end),
        current_period_end: result.current_period_end ? new Date(result.current_period_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", body.userId);
    if (subscriptionUpdateError) return json({ error: "Stripe updated the subscription, but its local status could not be synchronized." }, 500, origin);
  }
  return json({ success: true, status: result.status, cancel_at_period_end: Boolean(result.cancel_at_period_end) }, 200, origin);
});
