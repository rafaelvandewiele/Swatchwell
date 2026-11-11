import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const { data: profile } = await admin.from("profiles").select("role, language, premium_source").eq("id", user.id).maybeSingle();
  if (!profile) return json({ error: "Account profile not found." }, 404, origin);
  if (profile.role === "admin" || profile.premium_source === "admin") return json({ error: "This account already has Premium access." }, 409, origin);

  const { data: existing } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
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

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("customer", customerId);
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

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: stripeHeaders, body: form });
  const session = await response.json();
  if (!response.ok || !session.url) return json({ error: "Could not start checkout." }, 502, origin);
  return json({ url: session.url }, 200, origin);
});
