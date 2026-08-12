import express from 'express';

const router = express.Router();

const OLLAMA_URL = (process.env.SONARA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.SONARA_OLLAMA_MODEL?.trim() || '';

const EMBER_SYSTEM_PROMPT = `Sei Ember, la Creative Intelligence Director di Sonara Enterprise.
Parla in italiano naturale, diretto e conversazionale. Sei specializzata in produzione musicale, prompt musicali, genere e sottogenere, arrangiamento, BPM, sound design, EQ, mix e mastering.
Mantieni il genere scelto dall'utente come vincolo primario e non introdurre generi diversi senza richiesta esplicita.
Rispondi in modo utile e concreto, normalmente in 2-5 frasi, adatto anche a una conversazione vocale.
Non fingere di conoscere lo stato interno di Sonara o della traccia se l'utente non te lo ha detto.
Non usare né richiedere servizi a pagamento: questa modalità deve funzionare solo con un modello Ollama installato localmente sul computer dell'utente.`;

type OllamaTag = {
  name?: string;
  model?: string;
};

type OllamaTagsResponse = {
  models?: OllamaTag[];
};

type EmberMessage = {
  role: 'user' | 'assistant';
  content: string;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getInstalledModels(): Promise<string[]> {
  const response = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`, {}, 2500);
  if (!response.ok) return [];

  const payload = await response.json() as OllamaTagsResponse;
  return (payload.models || [])
    .map(item => item.name || item.model || '')
    .map(name => name.trim())
    .filter(Boolean);
}

function pickModel(models: string[]): string | null {
  if (OLLAMA_MODEL && models.includes(OLLAMA_MODEL)) return OLLAMA_MODEL;
  if (OLLAMA_MODEL && models.length > 0) return OLLAMA_MODEL;
  return models[0] || null;
}

router.get('/status', async (_req, res) => {
  try {
    const models = await getInstalledModels();
    const model = pickModel(models);
    res.json({
      ok: true,
      provider: 'ollama-local',
      available: Boolean(model),
      model,
      models,
      paidApi: false
    });
  } catch {
    res.json({
      ok: true,
      provider: 'ollama-local',
      available: false,
      model: null,
      models: [],
      paidApi: false
    });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages: EmberMessage[] = rawMessages
      .filter((item: unknown): item is EmberMessage => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<EmberMessage>;
        return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string';
      })
      .map(item => ({ role: item.role, content: item.content.trim() }))
      .filter(item => item.content.length > 0)
      .slice(-16);

    if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
      return res.status(400).json({ ok: false, error: 'A user message is required.' });
    }

    const models = await getInstalledModels();
    const model = pickModel(models);

    if (!model) {
      return res.status(503).json({
        ok: false,
        code: 'LOCAL_MODEL_UNAVAILABLE',
        error: 'No local Ollama model is available.'
      });
    }

    const response = await fetchWithTimeout(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: EMBER_SYSTEM_PROMPT },
          ...messages
        ],
        options: {
          temperature: 0.72,
          num_ctx: 4096
        }
      })
    }, 90000);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return res.status(503).json({
        ok: false,
        code: 'LOCAL_MODEL_ERROR',
        error: detail || `Ollama returned HTTP ${response.status}.`
      });
    }

    const payload = await response.json() as {
      message?: { content?: string };
      response?: string;
    };
    const reply = (payload.message?.content || payload.response || '').trim();

    if (!reply) {
      return res.status(503).json({
        ok: false,
        code: 'EMPTY_LOCAL_RESPONSE',
        error: 'The local model returned an empty response.'
      });
    }

    return res.json({
      ok: true,
      provider: 'ollama-local',
      model,
      paidApi: false,
      reply
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(503).json({
      ok: false,
      code: 'LOCAL_MODEL_UNAVAILABLE',
      error: message
    });
  }
});

export default router;
