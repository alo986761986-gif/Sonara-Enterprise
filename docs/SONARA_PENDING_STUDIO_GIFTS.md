# SONARA Pending Studio Gifts

Owner-issued Studio gifts are bound to the normalized email address.

If the target account already exists, Studio activates immediately for the requested month count.
If the target email is not registered yet, SONARA stores a pending gift without starting the subscription clock. On registration with the same email:
- native Studio entitlement activates for the full gift duration;
- Vercel/Firestore billing claims the same email-bound gift on the user's first authenticated billing request;
- no Stripe subscription is created;
- auto-renew remains disabled.

Pending gift records store an email SHA-256 identifier, not a plaintext recipient email in Firestore.
