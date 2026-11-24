/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findReusableSubscriptionCheckoutUrl } from "../_shared/checkout-session.ts";

const originAllowed = (origin: string) =>
  origin === "https://swatchwell.veyca.dev" ||
  /^https:\/\/[a-z0-9-]+\.swatchwell\.pages\.dev$/.test(origin) ||
  /^http:\/\/localhost:\d+$/.test(origin);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": originAllowed(origin) ? origin : "https://swatchwell.veyca.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !anonKey || !serviceKey || !stripeKey) return json({ error: "Billing is not configured." }, 503, origin);

  const authorization = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || !user.email_confirmed_at) return json({ error: "Authentication required." }, 401, origin);

  const admin = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await admin.from("profiles").select("role, language, premium_source").eq("id", user.id).maybeSingle();
  if (profileError) return json({ error: "Could not verify the account profile." }, 500, origin);
  if (!profile) return json({ error: "Account profile not found." }, 404, origin);
  if (profile.role === "admin" || profile.premium_source === "admin") return json({ error: "This account already has Premium access." }, 409, origin);

  const { data: currentSubscription, error: subscriptionError } = await admin
    .from("billing_subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subscriptionError) return json({ error: "Could not verify the existing subscription." }, 500, origin);
  if (currentSubscription && ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(currentSubscription.status)) {
    return json({ error: "A subscription already exists for this account. Manage it in billing settings." }, 409, origin);
  }

  const { data: existing, error: customerError } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (customerError) return json({ error: "Could not load the billing customer." }, 500, origin);
  let customerId = existing?.stripe_customer_id as string | undefined;
  const stripeHeaders = { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" };

  if (!customerId) {
    const customerBody = new URLSearchParams();
    customerBody.set("email", user.email ?? "");
    customerBody.set("metadata[user_id]", user.id);
    customerBody.set("preferred_locales[0]", profile.language === "nl" ? "nl" : profile.language === "fr" ? "fr" : profile.language === "de" ? "de" : "en");
    const customerResponse = await fetch("https://api.stripe.com/v1/customers", { method: "POST", headers: { ...stripeHeaders, "Idempotency-Key": "swatchwell-customer-" + user.id }, body: customerBody });
    const customer = await customerResponse.json();
    if (!customerResponse.ok) return json({ error: "Could not create the billing customer." }, 502, origin);
    customerId = customer.id;
    const { error: saveError } = await admin.from("billing_customers").upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
    if (saveError) return json({ error: "Could not save the billing customer." }, 500, origin);
  }
  if (!customerId) return json({ error: "Could not resolve the billing customer." }, 500, origin);

  // The local webhook projection can briefly lag behind Stripe. Check Stripe
  // directly as well so a delayed webhook cannot open a duplicate subscription.
  const subscriptionsResponse = await fetch(
    "https://api.stripe.com/v1/subscriptions?customer=" + encodeURIComponent(customerId) + "&status=all&limit=100",
    { headers: { Authorization: "Bearer " + stripeKey } },
  );
  const subscriptionsResult = await subscriptionsResponse.json();
  if (!subscriptionsResponse.ok) return json({ error: "Could not verify existing Stripe subscriptions." }, 502, origin);
  const existingStripeSubscription = (subscriptionsResult.data ?? []).find((subscription: { status?: string }) =>
    ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(subscription.status ?? "")
  );
  if (existingStripeSubscription) {
    return json({ error: "A subscription already exists for this account. Manage it in billing settings." }, 409, origin);
  }

  // Reuse an existing in-progress subscription checkout even when the
  // customer returns after the short Stripe idempotency-key window.
  const openSessionsResponse = await fetch(
    "https://api.stripe.com/v1/checkout/sessions?customer=" +
      encodeURIComponent(customerId) + "&status=open&limit=100",
    { headers: { Authorization: "Bearer " + stripeKey } },
  );
  const openSessionsResult = await openSessionsResponse.json();
  if (!openSessionsResponse.ok) {
    return json({ error: "Could not verify open checkout sessions." }, 502, origin);
  }
  const reusableCheckoutUrl = findReusableSubscriptionCheckoutUrl(
    openSessionsResult.data,
    user.id,
    customerId,
  );
  if (reusableCheckoutUrl) return json({ url: reusableCheckoutUrl }, 200, origin);

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("customer", customerId);
  form.set("client_reference_id", user.id);
  form.set("metadata[user_id]", user.id);
  form.set("line_items[0][price_data][currency]", "eur");
  form.set("line_items[0][price_data][unit_amount]", "299");
  form.set("line_items[0][price_data][recurring][interval]", "month");
  form.set("line_items[0][price_data][product_data][name]", "Swatchwell Premium");
  form.set("line_items[0][price_data][product_data][description]", "Access to premium colour combinations and upcoming premium features.");
  form.set("line_items[0][quantity]", "1");
  form.set("subscription_data[metadata][user_id]", user.id);
  form.set("success_url", "https://swatchwell.veyca.dev/settings?billing=success");
  form.set("cancel_url", "https://swatchwell.veyca.dev/settings?billing=cancelled");
  form.set("billing_address_collection", "auto");
  form.set("allow_promotion_codes", "true");

  // Repeated clicks or network retries in the same short window must
  // resolve to one Checkout Session rather than create parallel sessions.
  const checkoutAttempt = Math.floor(Date.now() / (10 * 60 * 1000));
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      ...stripeHeaders,
      "Idempotency-Key": "swatchwell-checkout-" + user.id + "-" + checkoutAttempt,
    },
    body: form,
  });
  const session = await response.json();
  if (!response.ok || !session.url) return json({ error: "Could not start checkout." }, 502, origin);
  return json({ url: session.url }, 200, origin);
});
