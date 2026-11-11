import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
async function validSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + payload))));
  return digest === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !service) return new Response("Billing webhook is not configured.", { status: 503 });
  const payload = await req.text();
  if (!await validSignature(payload, req.headers.get("Stripe-Signature") ?? "", secret)) return new Response("Invalid signature", { status: 400 });
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const admin = createClient(url, service);
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed" && object.customer && object.client_reference_id) {
    await admin.from("billing_customers").upsert({ user_id: object.client_reference_id, stripe_customer_id: object.customer }, { onConflict: "user_id" });
  }

  if (event.type.startsWith("customer.subscription.") && object.id) {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const { data: customer } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (customer?.user_id) {
      const { data: previous } = await admin.from("billing_subscriptions").select("failed_at,last_dunning_email_at").eq("user_id", customer.user_id).maybeSingle();
      const failedAt = object.status === "past_due" || object.status === "unpaid" ? (previous?.failed_at ?? new Date().toISOString()) : null;
      const { error: saveError } = await admin.from("billing_subscriptions").upsert({
        user_id: customer.user_id,
        stripe_subscription_id: object.id,
        stripe_price_id: object.items?.data?.[0]?.price?.id ?? null,
        status: object.status,
        current_period_start: object.current_period_start ? new Date(object.current_period_start * 1000).toISOString() : null,
        current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(object.cancel_at_period_end),
        failed_at: failedAt,
        last_dunning_email_at: failedAt ? previous?.last_dunning_email_at ?? null : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (!saveError) {
        const { data: profile } = await admin.from("profiles").select("role").eq("id", customer.user_id).maybeSingle();
        const entitled = ["active", "trialing", "past_due", "unpaid"].includes(object.status) && (!failedAt || Date.now() - new Date(failedAt).getTime() < 5 * 86400000);
        if (profile?.role !== "admin") await admin.from("profiles").update({ premium_source: entitled ? "subscription" : "none", updated_at: new Date().toISOString() }).eq("id", customer.user_id);
      }
    }
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
    if (subscriptionId) {
      const { data: sub } = await admin.from("billing_subscriptions").select("user_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
      if (sub?.user_id) {
        await admin.from("billing_subscriptions").update({ failed_at: null, last_dunning_email_at: null, status: "active", updated_at: new Date().toISOString() }).eq("user_id", sub.user_id);
        const { data: profile } = await admin.from("profiles").select("role").eq("id", sub.user_id).maybeSingle();
        if (profile?.role !== "admin") await admin.from("profiles").update({ premium_source: "subscription", updated_at: new Date().toISOString() }).eq("id", sub.user_id);
      }
    }
  }

  if (event.type === "invoice.payment_failed") {
    const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
    if (subscriptionId) {
      const { data: sub } = await admin.from("billing_subscriptions").select("user_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
      if (sub?.user_id) {
        const { data: previous } = await admin.from("billing_subscriptions").select("failed_at").eq("user_id", sub.user_id).maybeSingle();
        await admin.from("billing_subscriptions").update({ status: "past_due", failed_at: previous?.failed_at ?? new Date().toISOString(), last_dunning_email_at: null, updated_at: new Date().toISOString() }).eq("user_id", sub.user_id);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
