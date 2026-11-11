# Stripe setup for Swatchwell Premium

This integration uses Stripe Checkout, Stripe Billing Portal, Supabase Edge Functions and Resend. The application code does not contain live credentials.

## Before going live

Stripe requires the account owner or authorised representative to meet its age and legal-capacity requirements. A minor must not open or operate a Stripe account independently. An eligible parent/guardian or legally authorised adult business representative must own and verify the Stripe account, accept Stripe's terms, complete identity/business verification and manage payouts, tax and customer-support obligations.

Use Stripe test mode first. Do not paste secret keys into GitHub, source files, chat, or a client-side environment variable.

## 1. Create the product and recurring price

1. Sign in to the Swatchwell Stripe account in test mode.
2. Open Product catalogue → Add product.
3. Name it Swatchwell Premium.
4. Add a recurring price of €2.99 every month.
5. Save the product. The Checkout function currently creates the same monthly price inline, so a Stripe Price ID is not required by the code.
6. In Settings → Billing → Customer portal, enable subscription cancellation at the end of the current billing period, payment-method updates and invoice history. Do not configure immediate cancellation for normal customer-requested cancellations.

## 2. Configure Stripe invoice emails and PDFs

1. In Stripe Billing settings, enable customer emails for successful payments and payment failures as appropriate.
2. Enable invoice finalisation and automatic collection for the subscription.
3. Confirm that invoice PDFs are generated and that the customer portal exposes invoice history and PDF downloads.
4. The Checkout function sets the Stripe customer's preferred locale from the Swatchwell profile (en, nl, fr or de). Verify the resulting invoice/email locale in test mode. Stripe controls the invoice PDF layout and tax fields.
5. Add the correct legal business name, address, VAT/tax details and support contact in Stripe before accepting live payments.

## 3. Configure webhook

Deploy stripe-webhook with JWT verification disabled. In Stripe Developers → Webhooks, add this endpoint:

https://uafuoobiouxscsqkkcep.supabase.co/functions/v1/stripe-webhook

Subscribe to:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_succeeded
- invoice.payment_failed

Copy the endpoint's signing secret. Store it as the Supabase Edge Function secret STRIPE_WEBHOOK_SECRET.

## 4. Configure Supabase secrets

Set these secrets in the Supabase project (never in Vite or Expo public environment variables):

- STRIPE_SECRET_KEY — Stripe test secret key for test mode; replace with the live secret only at launch.
- STRIPE_WEBHOOK_SECRET — webhook endpoint signing secret.
- RESEND_API_KEY — existing verified Resend key used for Swatchwell email.
- BILLING_CRON_SECRET — a newly generated long random secret used only by the scheduled dunning function.

Supabase already supplies SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to Edge Functions.

## 5. Deploy functions and migration

1. Apply supabase/migrations/20261111000100_stripe_subscriptions.sql.
2. Deploy create-checkout-session and create-billing-portal with normal JWT verification.
3. Deploy stripe-webhook with --no-verify-jwt.
4. Deploy billing-dunning with --no-verify-jwt.
5. Schedule billing-dunning once per day using Supabase Cron / pg_cron or an external scheduler. Send POST with Authorization: Bearer BILLING_CRON_SECRET. Never expose this secret to the browser.

## 6. Test before live mode

Use Stripe test cards and verify:
- A new customer can subscribe for €2.99/month.
- The webhook creates a billing_subscriptions row and sets profiles.premium_source = subscription.
- Admin accounts retain Premium regardless of Stripe state.
- Cancelling in the customer portal sets cancel_at_period_end; access remains until the paid-through date.
- A successful invoice clears the failed-payment timer.
- Failed invoices trigger daily localised reminders; after five days the subscription is cancelled and Premium access is revoked.
- The customer portal shows invoices and allows PDF downloads.
- Admin manual Premium grants and revocations update profiles.is_premium immediately.

## 7. Go-live checklist

Switch Stripe to live mode, replace the test secret and webhook signing secret in Supabase, create a live-mode webhook with the same event list, verify the legal business/tax details, test one real low-risk transaction, then enable public checkout. Keep test and live secrets separate.
