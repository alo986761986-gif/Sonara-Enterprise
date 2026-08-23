function currentGeneratorSelections() {
  const textarea = document.getElementById('sonara-prompt');
  const panel = textarea?.closest('section');
  const selects = panel ? Array.from(panel.querySelectorAll('select')) as HTMLSelectElement[] : [];

  return {
    family: selects[0]?.value || '',
    genre: selects[1]?.value || '',
    subgenre: selects[2]?.value || '',
    mood: selects[3]?.value || '',
    key: selects[4]?.value || '',
    prompt: textarea instanceof HTMLTextAreaElement ? textarea.value.trim() : ''
  };
}

function exactGenreFromPayload(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.split('·')[0]?.trim() || text;
}

function buildStyleLockedPayload(payload: Record<string, any>) {
  const current = currentGeneratorSelections();
  const family = current.family || String(payload.genreFamily || '').trim() || 'Music';
  const genre = current.genre || exactGenreFromPayload(payload.genre) || 'Music';
  const subgenre = current.subgenre || String(payload.subgenre || '').trim() || genre;
  const mood = current.mood || String(payload.mood || '').trim();
  const key = current.key || String(payload.key || '').trim();
  const bpm = Number(payload.bpm);
  const creativeBrief = current.prompt || String(payload.prompt || '').trim();

  const styleLock = [
    `STRICT STYLE LOCK: music family ${family}`,
    `main genre ${genre}`,
    `exact subgenre ${subgenre}`,
    `the entire track must be unmistakably ${subgenre} within ${genre}`,
    `use authentic ${subgenre} rhythm, groove, instrumentation, harmony, sound palette and production conventions`,
    `do not switch, blend or drift into unrelated genres or subgenres`,
    mood ? `mood ${mood}` : '',
    key ? `key ${key}` : '',
    Number.isFinite(bpm) ? `${Math.round(bpm)} BPM` : '',
    creativeBrief ? `professional production details only, without changing the selected style: ${creativeBrief}` : '',
    `professional arrangement, mix and master while preserving ${genre} / ${subgenre} from start to finish`
  ].filter(Boolean).join(', ');

  return {
    ...payload,
    genreFamily: family,
    genre,
    subgenre,
    mood: mood || payload.mood,
    key: key || payload.key,
    prompt: styleLock
  };
}

export function installGenerationStyleGuard() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(rawUrl, window.location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

      if (url.pathname === '/api/engine/generate' && method === 'POST') {
        let bodyText = typeof init?.body === 'string' ? init.body : '';
        if (!bodyText && input instanceof Request) bodyText = await input.clone().text();

        if (bodyText) {
          const payload = JSON.parse(bodyText) as Record<string, any>;
          const locked = buildStyleLockedPayload(payload);
          const nextInit: RequestInit = {
            ...(init || {}),
            method: 'POST',
            headers: init?.headers || (input instanceof Request ? input.headers : undefined),
            body: JSON.stringify(locked)
          };
          return nativeFetch(rawUrl, nextInit);
        }
      }
    } catch {
      // Never block generation if the guard cannot inspect a request.
    }

    return nativeFetch(input, init);
  };
}
