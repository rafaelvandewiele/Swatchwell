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
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: "Authentication required." }, 401, origin);
  const admin = createClient(url, service);
  const { data: customer } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!customer?.stripe_customer_id) return json({ error: "No billing profile exists for this account." }, 404, origin);
  const body = new URLSearchParams({ customer: customer.stripe_customer_id, return_url: "https://swatchwell.veyca.dev/settings" });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", headers: { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const session = await response.json();
  if (!response.ok || !session.url) return json({ error: "Could not open billing settings." }, 502, origin);
  return json({ url: session.url }, 200, origin);
});
