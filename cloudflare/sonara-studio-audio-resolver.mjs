// SONARA Studio audio resolution. Keep this independent of the studio router
// so signed Cloudflare R2 reads can be tested without importing unrelated UI.
import relayRuntime from './sonara-r2-https-relay.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const MAX_UPLOAD_BYTES = 160 * 1024 * 1024;
const AUDIO_TIMEOUT = 120_000;
const ALLOWED_AUDIO_HOSTS = new Set([
  'sonaraenterprise.com', 'www.sonaraenterprise.com',
  'api.sonaraenterprise.com', 'molab.sonaraenterprise.com'
]);
const clean = value => String(value ?? '').trim();

export async function fetchAllowedAudio(value, env, ctx) {
  const text = clean(value);
  if (!text) return null;
  let url;
  try { url = new URL(text, PUBLIC_API_ORIGIN); }
  catch { throw new Error('URL audio non valido.'); }
  if (!ALLOWED_AUDIO_HOSTS.has(url.hostname)) throw new Error('Per sicurezza SONARA Studio accetta URL audio solo dai domini SONARA/MoLab. Carica il file per altre sorgenti.');
  const relaySignedAudio = /^\/api\/sonara-relay\/job\/sr2_[0-9a-f-]{36}\/audio\/[01]$/.test(url.pathname)
    && url.hostname === 'api.sonaraenterprise.com';
  // The user receives an expiring, signed audio URL. Resolve it directly through
  // the same private R2 relay code in this Worker, not via a second public DNS
  // hop that may return Cloudflare 523. Relay code verifies HMAC and expiration.
  let response;
  if (relaySignedAudio) {
    response = await relayRuntime.fetch(new Request(url.toString(), {
      method:'GET', headers:{Accept:'audio/wav'}
    }), env, ctx);
    if (!response || !response.ok) {
      throw new Error('Audio SONARA R2 non disponibile o link scaduto. Apri il brano dalla libreria o carica il WAV/MP3 originale.');
    }
  } else {
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' },
        signal: AbortSignal.timeout(AUDIO_TIMEOUT)
      });
    } catch {
      throw new Error('Sorgente audio remota non raggiungibile. Carica direttamente il file WAV/MP3 in Remix o Studio AI.');
    }
    if (!response.ok) {
      if ([520,521,522,523,524,530].includes(response.status))
        throw new Error('Il vecchio indirizzo audio MoLab non è raggiungibile (HTTP '+response.status+'). Seleziona una copia salvata nella libreria oppure carica il file audio originale.');
      throw new Error(`Impossibile leggere l'audio sorgente (HTTP ${response.status}).`);
    }
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new Error('Audio troppo grande per SONARA Studio.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('Audio sorgente vuoto.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Audio troppo grande per SONARA Studio.');
  const extension = /mpeg|mp3/i.test(blob.type) ? 'mp3' : /flac/i.test(blob.type) ? 'flac' : /ogg/i.test(blob.type) ? 'ogg' : 'wav';
  return { blob, filename: `sonara-source.${extension}`, type: blob.type || 'audio/wav' };
}

