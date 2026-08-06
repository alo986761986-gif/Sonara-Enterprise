# Sonara authentication setup

Sonara uses a server-signed, `HttpOnly`, `SameSite=Lax` session cookie. Google,
Apple and Facebook authenticate through Firebase Authentication. Spotify uses
OAuth Authorization Code with PKCE, state validation and a server callback.

## Required server configuration

Set these values in the RunPod environment. Never commit their real values.

```text
SONARA_AUTH_SECRET=<at-least-32-random-bytes>
SONARA_REQUIRE_AUTH=false
SONARA_ALLOW_GUEST=true

SONARA_FIREBASE_API_KEY=<firebase-web-api-key>
SONARA_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
SONARA_FIREBASE_PROJECT_ID=<firebase-project-id>
SONARA_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
SONARA_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
SONARA_FIREBASE_APP_ID=<web-app-id>

SONARA_AUTH_GOOGLE_ENABLED=true
SONARA_AUTH_APPLE_ENABLED=true
SONARA_AUTH_FACEBOOK_ENABLED=true

SPOTIFY_CLIENT_ID=<spotify-client-id>
SPOTIFY_CLIENT_SECRET=<spotify-client-secret-if-used>
SPOTIFY_REDIRECT_URI=https://<public-sonara-domain>/api/auth/spotify/callback
```

For Firebase Admin token verification, configure Application Default
Credentials or provide the service account JSON only through the secret
environment variable:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=<single-line-json>
```

## Provider consoles

1. Add the public Sonara hostname to Firebase Authentication **Authorized domains**.
2. Enable Google, Facebook and Apple in Firebase Authentication **Sign-in method**.
3. Complete the Facebook App and Apple Services ID configuration requested by Firebase.
4. Add the exact `SPOTIFY_REDIRECT_URI` to the Spotify application redirect allowlist.
5. Use HTTPS publicly. Sonara automatically marks cookies `Secure` behind the RunPod proxy.

## Production lock

Keep guest mode while validating the provider configuration. After all providers
work, switch to:

```text
SONARA_REQUIRE_AUTH=true
SONARA_ALLOW_GUEST=false
```

Restart the Node server after changing server variables. The Firebase web
configuration is obtained at runtime from `/api/auth/config`; it is not baked
into the frontend bundle.
