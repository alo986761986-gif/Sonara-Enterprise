# SONARA Studio Owner Gift Grant

SONARA supports an owner-issued Studio gift without creating a Stripe subscription.

- Native account entitlement and Vercel/Firestore billing are updated together.
- Gift cadence is monthly and the entitlement expires automatically.
- auto-renew is false and no Stripe customer/subscription is created.
- Admin grant endpoints require the existing SONARA_INTERNAL_PROXY_SECRET.
- If a paid Stripe subscription is already active, the Firestore grant is a no-op to avoid overwriting paid billing state.
- Native Studio checks accept both monthly gift and yearly restoration entitlements.
