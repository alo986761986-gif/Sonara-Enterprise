import { SonaraAuthStore as BaseSonaraAuthStore } from './sonara-native-auth.mjs';

function safeMessage(error) {
  const name = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'Error';
  const raw = String(error?.message || error || 'unknown').replace(/[\r\n\t]+/g, ' ').slice(0, 180);
  return `${name}: ${raw}`;
}

export class SonaraAuthStore extends BaseSonaraAuthStore {
  async fetch(request) {
    try {
      return await super.fetch(request);
    } catch (error) {
      console.error('[SONARA AUTH] Durable Object request failed', error);
      return Response.json(
        {
          ok: false,
          code: 'AUTH_INTERNAL_ERROR',
          message: 'Errore interno autenticazione SONARA.',
          diagnostic: safeMessage(error)
        },
        {
          status: 500,
          headers: {
            'cache-control': 'no-store, max-age=0',
            'x-sonara-auth': 'sonara-native-auth-v1'
          }
        }
      );
    }
  }
}
