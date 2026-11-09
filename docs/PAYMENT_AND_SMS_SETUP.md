# FOMO Store — Payment & SMS OTP Setup (owner action required)

Nothing below has been configured by the application code. The storefront currently
offers **Cash on Delivery** and **Email + Password** sign-in. Phone OTP and online
payments stay clearly labelled "pending" until you complete these steps.

## 1. Phone OTP (SMS) for Indian numbers

The app already implements real OTP request/verify (Supabase Auth), 60 s resend
cooldown, 5-attempt limit, Create-Account vs Sign-In modes, and an honest fallback
notice. It cannot send SMS until Supabase has an SMS provider.

1. Supabase Dashboard → **Authentication → Providers → Phone** → enable.
2. Choose a provider supported by Supabase (Twilio, Twilio Verify, MessageBird,
   Vonage, or Textlocal) and paste the provider credentials there (never in the repo).
3. **India (DLT)**: Indian SMS requires DLT registration (Principal Entity ID, a
   registered sender header and an approved OTP template). Use a provider that supports
   DLT (e.g. Twilio with DLT, Textlocal, MSG91-style routes) and register the template
   with your telecom operator. Without DLT, messages to Indian numbers are blocked.
4. Authentication → Rate limits: keep SMS limits conservative (e.g. 5 per hour per phone).
5. Test with your own number: request OTP on the live site, confirm an SMS arrives and
   verifies. Only then is OTP "live".

## 2. Online payment (UPI / cards) — not enabled

Server-side flow to implement once a merchant account exists (Razorpay or Cashfree):

1. Merchant account KYC approved; obtain **Key ID + Key Secret** (and webhook secret).
2. Store the secrets ONLY as Supabase Edge Function secrets
   (`supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...`).
   The Key Secret must never reach browser code or `.env` files committed to Git.
3. Edge Function `create-payment`: authenticated customer → reads the *server-side* order
   total → creates the gateway order → returns only the public order id.
4. Edge Function `payment-webhook`: verifies the gateway signature (HMAC) over the raw
   body, then calls a service-role-only SQL function that sets
   `orders.payment_status='paid'` exactly once (idempotent on gateway payment id).
5. Webhook URL to register in the gateway dashboard:
   `https://<project-ref>.supabase.co/functions/v1/payment-webhook`
   Events: payment captured/failed (Razorpay: `payment.captured`, `payment.failed`).
6. Flip `ONLINE_PAYMENT_ENABLED` in `src/lib/checkoutFlow.ts` and allow `'upi'` in
   `place_order()` only after steps 1-5 are tested in the gateway's test mode on staging.

Database groundwork already in migration 005: `orders.payment_status`
(`unpaid | pending | paid | failed | refunded`), protected from customer edits, and
`place_order()` rejects every payment method except `cod` today.
