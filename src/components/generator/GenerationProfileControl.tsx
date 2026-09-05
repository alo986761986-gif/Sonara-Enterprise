import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Sparkles, Zap } from 'lucide-react';

export type GenerationProfileV3 = 'fast' | 'quality' | 'ultra';

const PROFILE_KEY = 'sonara.generation.profile.v3';
const HOST_ID = 'sonara-generation-profile-native-host';
const CONTROL_ID = 'sonara-generation-profile-v3';
const PROFILES: Array<{
  id: GenerationProfileV3;
  label: string;
  subtitle: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'fast',
    label: 'FAST',
    subtitle: 'Anteprima veloce',
    detail: '2 candidati · target qualità 82',
    icon: Zap
  },
  {
    id: 'quality',
    label: 'QUALITY',
    subtitle: 'Produzione consigliata',
    detail: '2 brani · 1 batch RTX · target 88',
    icon: Sparkles
  },
  {
    id: 'ultra',
    label: 'ULTRA',
    subtitle: 'Massima qualità',
    detail: '4 candidati · target 92+ · rescue adattivo',
    icon: ShieldCheck
  }
];

function readProfile(): GenerationProfileV3 {
  if (typeof window === 'undefined') return 'quality';
  const value = window.localStorage.getItem(PROFILE_KEY);
  return value === 'fast' || value === 'ultra' || value === 'quality' ? value : 'quality';
}

function ensureHost(): HTMLElement | null {
  const prompt = document.getElementById('sonara-prompt');
  const promptBlock = prompt?.parentElement;
  if (!prompt || !promptBlock || !promptBlock.parentElement) return null;

  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.sonaraNativeProfileHost = 'true';
    promptBlock.insertAdjacentElement('afterend', host);
  }
  return host;
}

function unwrapJobPayload(value: any): any {
  if (!value || typeof value !== 'object') return value;
  return value.job || value.data || value;
}

function emitDirectorResult(value: any) {
  const current = unwrapJobPayload(value);
  const metadata = current?.metadata || {};
  const status = String(current?.status || '').toUpperCase();
  if (status !== 'COMPLETED' || metadata?.sonaraMusicDirector !== 'sonara-music-director-v3') return;
  const candidates = Array.isArray(current?.candidates)
    ? current.candidates
    : Array.isArray(current?.outputs)
      ? current.outputs
      : [];
  window.dispatchEvent(new CustomEvent('sonara:director-result-v3', {
    detail: {
      jobId: current?.jobId || current?.job_id || '',
      metadata,
      candidates,
      qualityDirector: current?.sonaraQualityDirector || null
    }
  }));
}

function installNativeFetchBridge() {
  if (typeof window === 'undefined') return;
  const runtime = window as typeof window & {
    __sonaraNativeGenerationProfileV3?: boolean;
    __sonaraNativeGenerationProfileFetchV3?: boolean;
  };
  runtime.__sonaraNativeGenerationProfileV3 = true;
  document.documentElement.dataset.sonaraGenerationProfileUi = 'react-v1';

  if (runtime.__sonaraNativeGenerationProfileFetchV3) return;
  runtime.__sonaraNativeGenerationProfileFetchV3 = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let raw = '';
    let url: URL | null = null;
    let method = 'GET';
    try {
      raw = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      url = new URL(raw, window.location.href);
      method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const isGeneration = method === 'POST' && ['/api/billing/generate', '/api/engine/generate'].includes(url.pathname);

      if (isGeneration) {
        let body: Record<string, unknown> | null = null;
        if (typeof init.body === 'string') {
          try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { body = null; }
        } else if (input instanceof Request) {
          try { body = await input.clone().json() as Record<string, unknown>; } catch { body = null; }
        }

        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const profile = readProfile();
          body.generationProfileV3 = profile;
          body.renderProfile = profile;
          body.sonaraMusicDirectorV3 = 'sonara-music-director-v3';
          body.sonaraDirectorBypass = false;
          body.sonaraGenerationProfileSource = 'react-native-ui';

          const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          headers.set('content-type', 'application/json');
          headers.set('x-sonara-generation-profile', profile);

          return originalFetch(raw, {
            ...init,
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          });
        }
      }
    } catch {
      // Keep the original request path if profile enrichment cannot be applied.
    }

    const response = await originalFetch(input, init);
    try {
      if (url && method === 'GET' && /^\/api\/music\/job\//.test(url.pathname) && response.ok) {
        const data = await response.clone().json();
        emitDirectorResult(data);
      }
    } catch {
      // Result telemetry is passive and must never alter generation polling.
    }
    return response;
  };
}

export default function GenerationProfileControl() {
  const [profile, setProfile] = useState<GenerationProfileV3>(readProfile);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const active = useMemo(() => PROFILES.find(item => item.id === profile) || PROFILES[1], [profile]);

  useEffect(() => {
    installNativeFetchBridge();
    const connect = () => {
      const next = ensureHost();
      if (next) setHost(current => current === next ? current : next);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const choose = (next: GenerationProfileV3) => {
    window.localStorage.setItem(PROFILE_KEY, next);
    setProfile(next);
    window.dispatchEvent(new CustomEvent('sonara:generation-profile-v3', { detail: next }));
  };

  return (
    <>
      <style>{`#sonara-director-v3{display:none!important}`}</style>
      {host ? createPortal(
        <section
          id={CONTROL_ID}
          data-sonara-generation-profile={profile}
          className="mt-4 overflow-hidden rounded-2xl border border-violet-400/20 bg-[linear-gradient(120deg,rgba(76,29,149,.18),rgba(88,28,135,.10),rgba(37,99,235,.12))] p-4 shadow-[0_18px_45px_rgba(49,46,129,.16)]"
          aria-label="Qualità generazione SONARA"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />SONARA AI QUALITY
              </div>
              <div className="mt-1 text-xs font-bold text-white">{active.subtitle}</div>
              <div className="mt-1 text-[10px] text-slate-400">FAST e QUALITY usano un solo batch RTX; ULTRA mantiene ranking e rifinitura avanzata.</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/45 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-violet-200">
              {profile === 'ultra' ? '92+ RELEASE TARGET' : profile === 'quality' ? '88+ RELEASE TARGET' : 'FAST PREVIEW'}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {PROFILES.map(item => {
              const Icon = item.icon;
              const selected = item.id === profile;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={false}
                  onClick={() => choose(item.id)}
                  data-profile={item.id}
                  data-active={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  className={`group rounded-xl border p-3 text-left transition ${selected
                    ? 'border-violet-300/60 bg-gradient-to-br from-fuchsia-600/55 via-violet-600/55 to-blue-600/55 text-white shadow-lg shadow-violet-950/30'
                    : 'border-white/10 bg-slate-950/55 text-slate-300 hover:border-violet-400/35 hover:bg-violet-500/10'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`rounded-lg border p-1.5 ${selected ? 'border-white/20 bg-white/10' : 'border-slate-700 bg-slate-900'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[11px] font-black tracking-wider">{item.label}</span>
                  </span>
                  <span className="mt-2 block text-[10px] font-bold">{item.subtitle}</span>
                  <span className={`mt-1 block text-[9px] leading-4 ${selected ? 'text-violet-100' : 'text-slate-500'}`}>{item.detail}</span>
                </button>
              );
            })}
          </div>
        </section>,
        host
      ) : null}
    </>
  );
}
