# SONARA gateway authentication without copying a secret through the dashboard

Status: staged. Public relay remains explicitly OFF in wrangler.jsonc.

The site keeps SONARA_INTERNAL_PROXY_SECRET only in its server-side Vercel environment. The Worker configuration contains its SHA-256 fingerprint (SONARA_GATEWAY_SHA256), not the credential. A request must supply the ORIGINAL private key; sending the public fingerprint is rejected. Use a high-entropy machine-generated key, never a human password, with this method.

The new entrypoint wraps the existing runtime. Non-relay site/auth/billing routes and the disabled legacy engine path are forwarded unchanged. The relay namespace and enabled sr2 generation/job routes validate the gateway request, then use a per-request virtual internal key derived via HMAC-SHA256 from the existing SONARA_RELAY_TOKEN with a dedicated domain-separation label. The public fingerprint is never used to sign audio. Untrusted internal headers are stripped before forwarding. Agent-token authentication remains separate. Expiring audio signatures keep working across subsequent requests with the same relay root.

GET /api/sonara-relay/gateway-auth is a read-only gateway-key check; it does not submit or claim jobs. The Vercel GET /api/billing/job?relayReadiness=1 endpoint calls it with its server-side key and returns only booleans/status, not secrets. It reuses the existing function to stay within the current Hobby function limit. Authentication ready does not mean the music pipeline is running.

No Cloudflare account API token, account password, MoLab token, or gateway secret is committed. No administrative authentication controls or dashboard challenges are bypassed: deployment uses the repository's existing code deployment integration.

Activation remains gated on reviewing the complete relay, verifying deployment identity, confirming the live MoLab agent, ensuring per-user job ownership and audio access, and controlled provider switching. Do not enable public generation merely because the gateway-auth endpoint returns 200. The R2 queue MVP still needs review of retention, leases, retries and pagination before an unrestricted release.
