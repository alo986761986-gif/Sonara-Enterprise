# Ember Voice Architecture

## V1 Status

Ember Voice is an output-only text-to-speech layer. It is disabled by default and V1 has no microphone, speech-to-text, Realtime session, WebRTC transport, persistent audio storage, generation trigger, or Music Brain/DNA/EQ mutation.

## Voice Identity

Ember is an adult feminine Italian voice with a warm, slightly low register. Her delivery is calm, confident, clear, relaxed, and premium music-studio oriented. Technical production explanations are more direct; conversational delivery is slightly softer. The voice avoids childish, hyper-enthusiastic, call-center, synthetic, and theatrical delivery. The provisional built-in provider voice is `alloy`; final selection requires listening tests.

## Architecture

The text agent remains in `EmberAgentService`. The separate `EmberVoiceService` receives only assistant-visible final text and, when enabled, uses server-side native `fetch` to call the TTS provider. `emberVoice` exposes a safe config endpoint and a browser-compatible MP3 speech endpoint. The browser hook owns playback, object URLs, stop behavior, and its non-persistent replay cache.

## Configuration

- `EMBER_VOICE_ENABLED`: Voice is enabled only when exactly `true`; otherwise it is off.
- `EMBER_TTS_MODEL`: Defaults to `gpt-4o-mini-tts`.
- `EMBER_TTS_VOICE`: Defaults to `alloy` pending listening tests.

The provider key remains server-side and is never included in config or browser responses.

## Cost and Security Safeguards

- Disabled speech returns `EMBER_VOICE_DISABLED` before any provider request.
- Auto Speak defaults off and only observes newly completed assistant messages.
- One explicit or automatic action makes at most one synthesis request; there are no retries or pre-generation.
- Replay uses only the current in-memory audio blob; Stop immediately ends local playback.
- The endpoint accepts validated plain text up to 3,000 characters, derives identity from the authenticated Sonara session, rejects cross-site requests, and applies a per-user limit.
- Upstream bodies and secrets are not exposed or logged. The feature is read-only relative to Sonara.

## Future V2

A future Realtime/WebRTC layer can add microphone permission, speech-to-speech, interruption, and barge-in behind a new transport without replacing `EmberAgentService` or Ember's text intelligence.