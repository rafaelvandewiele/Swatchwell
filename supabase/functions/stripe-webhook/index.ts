/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function validSignature(payload: string, header: string, secret: string) {
  const fields = header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0
      ? ["", ""]
      : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  });
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  const timestampNumber = Number(timestamp);

  if (
    !timestamp ||
    !Number.isInteger(timestampNumber) ||
    !signatures.length ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + "." + payload),
  )));

  return signatures.some((signature) => constantTimeHexEqual(expected, signature));
}

function throwIfError(error: { message?: string } | null, operation: string): void {
  if (error) throw new Error(operation + ": " + (error.message ?? "database operation failed"));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !url || !service || !stripeKey) {
    return new Response("Billing webhook is not configured.", { status: 503 });
  }

  const payload = await req.text();
  if (!await validSignature(payload, req.headers.get("Stripe-Signature") ?? "", secret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, any> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const admin = createClient(url, service);
    const object = event.data?.object ?? {};

    if (event.type === "checkout.session.completed" && object.mode === "subscription") {
      if (!object.customer || !object.client_reference_id) {
        throw new Error("Completed subscription checkout is missing its customer or user reference.");
      }

      const { error } = await admin.from("billing_customers").upsert({
        user_id: object.client_reference_id,
        stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer.id,
      }, { onConflict: "user_id" });
      throwIfError(error, "Could not save the Stripe customer mapping");
    }

    if (event.type?.startsWith("customer.subscription.") && object.id) {
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
      if (!customerId) throw new Error("Subscription event is missing its Stripe customer.");

      const { data: customer, error: customerError } = await admin
        .from("billing_customers")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      throwIfError(customerError, "Could not resolve the Stripe customer");
      // Stripe does not guarantee delivery order. Returning 500 here asks Stripe
      // to retry if checkout.session.completed has not stored this mapping yet.
      if (!customer?.user_id) throw new Error("Stripe customer mapping is not available yet.");

      const { data: previous, error: previousError } = await admin
        .from("billing_subscriptions")
        .select("stripe_subscription_id,status,failed_at,last_dunning_email_at")
        .eq("user_id", customer.user_id)
        .maybeSingle();
      throwIfError(previousError, "Could not read the previous subscription state");

      // A customer may replace a cancelled subscription. Ignore delayed events
      // for an older subscription once a different current subscription exists.
      if (
        previous?.stripe_subscription_id &&
        previous.stripe_subscription_id !== object.id &&
        !["canceled", "incomplete_expired"].includes(previous.status)
      ) {
        console.warn("Ignoring an event for a superseded Stripe subscription", object.id);
      } else {
        let currentSubscription = object;
        if (event.type !== "customer.subscription.deleted") {
          const stripeResponse = await fetch(
            "https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(object.id),
            { headers: { Authorization: "Bearer " + stripeKey } },
          );
          // This endpoint requires the Stripe API secret, not the webhook
          // signing secret. Use the configured STRIPE_SECRET_KEY below.
          const fetchedSubscription = await stripeResponse.json();
          if (!stripeResponse.ok) throw new Error("Could not verify the current Stripe subscription status.");
          currentSubscription = fetchedSubscription;
        } else {
          currentSubscription = { ...object, status: "canceled" };
        }

        const failedAt = currentSubscription.status === "past_due" || currentSubscription.status === "unpaid"
          ? previous?.failed_at ?? new Date().toISOString()
          : null;

        const { error: saveError } = await admin.from("billing_subscriptions").upsert({
          user_id: customer.user_id,
          stripe_subscription_id: currentSubscription.id,
          stripe_price_id: currentSubscription.items?.data?.[0]?.price?.id ?? null,
          status: currentSubscription.status,
          current_period_start: currentSubscription.current_period_start
            ? new Date(currentSubscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: currentSubscription.current_period_end
            ? new Date(currentSubscription.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: Boolean(currentSubscription.cancel_at_period_end),
          failed_at: failedAt,
          last_dunning_email_at: failedAt ? previous?.last_dunning_email_at ?? null : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        throwIfError(saveError, "Could not save the subscription state");

        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("role")
          .eq("id", customer.user_id)
          .maybeSingle();
        throwIfError(profileError, "Could not read the account role");
        if (!profile) throw new Error("The subscription account profile does not exist.");

        const entitled = ["active", "trialing", "past_due", "unpaid"].includes(currentSubscription.status)
          && (!failedAt || Date.now() - new Date(failedAt).getTime() < 5 * 86400000);

        if (profile.role !== "admin") {
          const { error } = await admin.from("profiles")
            .update({
              premium_source: entitled ? "subscription" : "none",
              updated_at: new Date().toISOString(),
            })
            .eq("id", customer.user_id);
          throwIfError(error, "Could not synchronize Premium access");
        }
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
      if (subscriptionId) {
        const { data: sub, error: subError } = await admin
          .from("billing_subscriptions")
          .select("user_id,failed_at,last_dunning_email_at")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        throwIfError(subError, "Could not resolve the paid subscription");
        if (!sub?.user_id) throw new Error("Paid subscription mapping is not available yet.");

        // Invoice events can be delayed or delivered out of order. Retrieve the
        // current Stripe subscription instead of assuming that a paid invoice
        // means the subscription itself is still active.
        const stripeResponse = await fetch(
          "https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscriptionId),
          { headers: { Authorization: "Bearer " + stripeKey } },
        );
        const currentSubscription = await stripeResponse.json();
        if (!stripeResponse.ok) throw new Error("Could not verify the current Stripe subscription status.");
        const currentlyEntitled = ["active", "trialing"].includes(currentSubscription.status);

        const { error: subscriptionUpdateError } = await admin.from("billing_subscriptions")
          .update({
            status: currentSubscription.status,
            current_period_start: currentSubscription.current_period_start
              ? new Date(currentSubscription.current_period_start * 1000).toISOString()
              : null,
            current_period_end: currentSubscription.current_period_end
              ? new Date(currentSubscription.current_period_end * 1000).toISOString()
              : null,
            cancel_at_period_end: Boolean(currentSubscription.cancel_at_period_end),
            failed_at: currentlyEntitled ? null : sub.failed_at,
            last_dunning_email_at: currentlyEntitled ? null : sub.last_dunning_email_at,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", sub.user_id);
        throwIfError(subscriptionUpdateError, "Could not synchronize the paid subscription");

        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("role")
          .eq("id", sub.user_id)
          .maybeSingle();
        throwIfError(profileError, "Could not read the paid account role");
        if (!profile) throw new Error("The paid subscription account profile does not exist.");

        if (profile.role !== "admin") {
          const { error } = await admin.from("profiles")
            .update({
              premium_source: currentlyEntitled ? "subscription" : "none",
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.user_id);
          throwIfError(error, "Could not synchronize Premium access after payment");
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
      if (subscriptionId) {
        const { data: sub, error: subError } = await admin
          .from("billing_subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        throwIfError(subError, "Could not resolve the failed subscription");
        if (!sub?.user_id) throw new Error("Failed subscription mapping is not available yet.");

        const { data: previous, error: previousError } = await admin
          .from("billing_subscriptions")
          .select("failed_at,last_dunning_email_at")
          .eq("user_id", sub.user_id)
          .maybeSingle();
        throwIfError(previousError, "Could not read the previous failed-payment state");

        const failedAt = previous?.failed_at ?? new Date().toISOString();
        const { error: subscriptionUpdateError } = await admin.from("billing_subscriptions")
          .update({
            status: "past_due",
            failed_at: failedAt,
            last_dunning_email_at: previous?.last_dunning_email_at ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", sub.user_id);
        throwIfError(subscriptionUpdateError, "Could not save the failed-payment state");

        const { data: profile, error: profileError } = await admin
          .from("profiles")
          .select("role")
          .eq("id", sub.user_id)
          .maybeSingle();
        throwIfError(profileError, "Could not read the failed-payment account role");
        if (!profile) throw new Error("The failed-payment account profile does not exist.");

        const withinGracePeriod = Date.now() - new Date(failedAt).getTime() < 5 * 86400000;
        if (profile.role !== "admin") {
          const { error } = await admin.from("profiles")
            .update({
              premium_source: withinGracePeriod ? "subscription" : "none",
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.user_id);
          throwIfError(error, "Could not synchronize Premium access after failed payment");
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // A non-2xx response makes Stripe retry transient database or event-ordering
    // failures instead of permanently acknowledging an event we did not apply.
    console.error("Stripe webhook processing failed:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
