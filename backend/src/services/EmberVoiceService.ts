const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const REQUEST_TIMEOUT_MS = 30_000;

export const EMBER_VOICE_MAX_TEXT_LENGTH = 3_000;

const EMBER_VOICE_INSTRUCTIONS = `Adult feminine voice with a warm, slightly low register. Speak natural Italian with a calm, confident premium music-studio creative-director character. Keep a clear, relaxed rhythm with short intelligent pauses. Be precise and direct for technical production choices, slightly softer in conversation, and never childish, hyper-enthusiastic, call-center-like, synthetic, or theatrical. Pronounce Music DNA, EQ, mastering, stem, and workflow naturally.`;

export class EmberVoiceError extends Error {
  public constructor(
    public readonly code: 'EMBER_VOICE_DISABLED' | 'EMBER_VOICE_NOT_CONFIGURED' | 'EMBER_VOICE_UPSTREAM_ERROR',
    message: string
  ) {
    super(message);
  }
}

export class EmberVoiceService {
  public static isEnabled(): boolean {
    return process.env.EMBER_VOICE_ENABLED === 'true';
  }

  public static isProviderConfigured(): boolean {
    return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  }

  public static async synthesize(text: string): Promise<Buffer> {
    if (!this.isEnabled()) {
      throw new EmberVoiceError('EMBER_VOICE_DISABLED', 'Ember Voice is disabled.');
    }

    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      throw new EmberVoiceError('EMBER_VOICE_NOT_CONFIGURED', 'Ember Voice provider is not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(SPEECH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: String(process.env.EMBER_TTS_MODEL || '').trim() || 'gpt-4o-mini-tts',
          voice: String(process.env.EMBER_TTS_VOICE || '').trim() || 'alloy',
          input: text,
          response_format: 'mp3',
          instructions: EMBER_VOICE_INSTRUCTIONS
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        console.warn(`[EMBER VOICE] Speech API upstream failure: HTTP ${response.status}`);
        throw new EmberVoiceError('EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof EmberVoiceError) throw error;
      const category = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network';
      console.warn(`[EMBER VOICE] Speech API ${category} failure.`);
      throw new EmberVoiceError('EMBER_VOICE_UPSTREAM_ERROR', 'Ember Voice is temporarily unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }
}