import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
  Music2,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import {
  LANGUAGE_METADATA,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  detectDeviceLanguage,
  type LanguageCode
} from '../../i18n/locales';
import { uiText } from '../../i18n/ui';
import {
  firebaseConfigured,
  loginWithEmail,
  loginWithGoogle,
  logoutFirebase,
  registerWithEmail,
  resetEmailPassword,
  watchFirebaseUser
} from '../../lib/firebaseClient';

type AuthMode = 'login' | 'register' | 'reset';

const LANGUAGE_KEY = 'sonara.language';
const GUEST_KEY = 'sonara.guest.session';

function brandSonara(value: unknown): string {
  return String(value ?? '')
    .replace(/ACE[- ]?Step(?:\s*1\.5)?\s*(?:\/|·)?\s*Modal(?:\s+NVIDIA)?\s+L4/gi, 'SONARA')
    .replace(/ACE[- ]?Step(?:\s*1\.5)?/gi, 'SONARA')
    .replace(/Modal(?:\s+NVIDIA)?\s+L4/gi, 'SONARA')
    .replace(/\bModal\b/gi, 'SONARA')
    .replace(/SONARA(?:\s*[·/]\s*SONARA)+/gi, 'SONARA');
}

function initialLanguage(): LanguageCode {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_KEY) : null;
  if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) return saved as LanguageCode;
  return detectDeviceLanguage();
}

export default function BootAuth({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(initialLanguage);
  const [booting, setBooting] = useState(true);
  const [allowed, setAllowed] = useState(() => sessionStorage.getItem(GUEST_KEY) === '1');
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const t = useMemo(() => (key: Parameters<typeof uiText>[1]) => brandSonara(uiText(language, key)), [language]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
    localStorage.setItem(LANGUAGE_KEY, language);
    window.dispatchEvent(new CustomEvent('sonara:language', { detail: language }));
  }, [language]);

  useEffect(() => {
    const unsubscribe = watchFirebaseUser(user => {
      if (user) setAllowed(true);
    });

    const logoutHandler = async () => {
      sessionStorage.removeItem(GUEST_KEY);
      try { await logoutFirebase(); } catch {}
      setAllowed(false);
      setMode('login');
      setMessage('');
    };

    window.addEventListener('sonara:logout', logoutHandler);
    return () => {
      unsubscribe();
      window.removeEventListener('sonara:logout', logoutHandler);
    };
  }, []);

  const changeLanguage = (value: string) => {
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(value)) setLanguage(value as LanguageCode);
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (!firebaseConfigured) {
      setMessage(t('authConfigMissing'));
      return;
    }
    if (!email.trim()) {
      setMessage('Email required.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        await resetEmailPassword(email);
        setMessage('Password reset email sent.');
        setMode('login');
        return;
      }
      if (password.length < 6) {
        setMessage('Password must contain at least 6 characters.');
        return;
      }
      if (mode === 'register') await registerWithEmail(email, password);
      else await loginWithEmail(email, password);
      setAllowed(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setMessage('');
    if (!firebaseConfigured) {
      setMessage(t('authConfigMissing'));
      return;
    }
    setBusy(true);
    try {
      await loginWithGoogle();
      setAllowed(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const guest = () => {
    sessionStorage.setItem(GUEST_KEY, '1');
    setAllowed(true);
  };

  if (booting) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030611] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.18),transparent_42%)]" />
        <div className="absolute h-80 w-80 animate-pulse rounded-full border border-purple-500/10" />
        <div className="absolute h-56 w-56 animate-ping rounded-full border border-cyan-400/10 [animation-duration:2.2s]" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-8 h-24 w-24 rounded-[30px] shadow-2xl shadow-purple-950/70">
            <img
              src="/sonara-ai-icon.png"
              alt="SONARA AI"
              width={96}
              height={96}
              className="h-24 w-24 rounded-[30px] object-cover"
              loading="eager"
              decoding="sync"
            />
            <span className="absolute -inset-3 animate-pulse rounded-[38px] border border-purple-400/25" />
          </div>
          <div className="text-3xl font-black tracking-[0.24em]">SONARA</div>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.34em] text-purple-300">ENTERPRISE</div>
          <div className="mt-10 h-1 w-64 overflow-hidden rounded-full bg-white/5">
            <div className="h-full animate-[sonaraBoot_1.8s_ease-in-out_forwards] rounded-full bg-gradient-to-r from-purple-500 via-cyan-400 to-purple-500" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold tracking-[0.15em] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('bootInitializing')}
          </div>
          <div className="mt-2 text-[10px] font-black tracking-[0.2em] text-emerald-400">SONARA</div>
        </div>
        <style>{`@keyframes sonaraBoot{from{width:0}to{width:100%}}`}</style>
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050914] px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.17),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(6,182,212,0.10),transparent_35%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0f1c]/95 shadow-2xl shadow-black/50 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden min-h-[650px] flex-col justify-between border-r border-white/10 bg-gradient-to-br from-purple-950/60 via-[#080d19] to-cyan-950/30 p-12 lg:flex">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-950/60">
                <Music2 className="h-7 w-7" />
              </div>
              <h1 className="mt-8 text-4xl font-black tracking-tight">SONARA ENTERPRISE</h1>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-400">{t('signInSubtitle')}</p>
            </div>
            <div className="space-y-3 text-xs text-slate-400">
              <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-purple-400" /> SONARA generative music</div>
              <div className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Enterprise creative workspace</div>
              <div className="flex items-center gap-3"><Globe2 className="h-4 w-4 text-cyan-400" /> Global genres · multilingual interface</div>
            </div>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-black">{t('welcome')}</div>
                <div className="mt-1 text-xs text-slate-500">{mode === 'register' ? t('createAccount') : mode === 'reset' ? t('resetPassword') : t('signInSubtitle')}</div>
              </div>
              <select
                aria-label={t('language')}
                value={language}
                onChange={event => changeLanguage(event.target.value)}
                className="max-w-[190px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-300 outline-none focus:border-purple-500"
              >
                {SUPPORTED_LANGUAGES.map(code => (
                  <option key={code} value={code}>{LANGUAGE_METADATA[code].nativeName}</option>
                ))}
              </select>
            </div>

            <form onSubmit={submitEmail} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-400">
                {t('email')}
                <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-slate-950 px-3 focus-within:border-purple-500">
                  <Mail className="h-4 w-4 text-slate-600" />
                  <input type="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full bg-transparent px-3 py-3 text-sm outline-none" placeholder="name@example.com" />
                </div>
              </label>

              {mode !== 'reset' && (
                <label className="block text-xs font-semibold text-slate-400">
                  {t('password')}
                  <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-slate-950 px-3 focus-within:border-purple-500">
                    <LockKeyhole className="h-4 w-4 text-slate-600" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} className="w-full bg-transparent px-3 py-3 text-sm outline-none" />
                    <button type="button" onClick={() => setShowPassword(value => !value)} className="text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </label>
              )}

              {message && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-200">{message}</div>}

              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-sm font-bold disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'register' ? t('register') : mode === 'reset' ? t('resetPassword') : t('signIn')}
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {mode === 'login' && (
              <button onClick={() => setMode('reset')} className="mt-3 text-xs text-purple-300 hover:text-purple-200">{t('forgotPassword')}</button>
            )}

            <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-600"><span className="h-px flex-1 bg-white/10" />{t('or')}<span className="h-px flex-1 bg-white/10" /></div>

            <button type="button" onClick={google} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold transition hover:bg-white/[0.07]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-black text-slate-900">G</span>
              {t('continueGoogle')}
            </button>

            <button type="button" onClick={guest} className="mt-3 w-full rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10">{t('guest')}</button>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs">
              {mode === 'login' ? (
                <button onClick={() => { setMode('register'); setMessage(''); }} className="text-slate-400 hover:text-white">{t('createAccount')}</button>
              ) : (
                <button onClick={() => { setMode('login'); setMessage(''); }} className="text-slate-400 hover:text-white">{t('backToLogin')}</button>
              )}
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${firebaseConfigured ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                {firebaseConfigured ? 'Firebase Auth Ready' : 'Firebase config pending'}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
