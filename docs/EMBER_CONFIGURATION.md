# Ember API configuration

Ember uses the OpenAI Responses API for the assistant and the OpenAI Speech API for her voice. The API key is read only by the Node backend and is never returned to the browser.

Required backend environment variables:

- `OPENAI_API_KEY`: server-side OpenAI project key.
- `SONARA_FIREBASE_PROJECT_ID`: Firebase project used to verify signed-in users.

Optional backend environment variables:

- `EMBER_VOICE_ENABLED`: defaults to enabled; set to `false` to disable speech.
- `EMBER_OPENAI_MODEL`: defaults to `gpt-4.1-mini`.
- `EMBER_TTS_MODEL`: defaults to `gpt-4o-mini-tts`.
- `EMBER_TTS_VOICE`: defaults to `alloy`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service account JSON when Application Default Credentials are unavailable.

The browser sends the authenticated user's Firebase ID token with every Ember request. Chat and speech endpoints enforce independent per-user rate limits.
