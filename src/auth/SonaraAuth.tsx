import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { initializeApp, getApps, FirebaseOptions } from 'firebase/app';
import {
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { CheckCircle2, Loader2, LockKeyhole, Music, ShieldCheck } from 'lucide-react';

export type AuthProviderName = 'google' | 'apple' | 'facebook' | 'spotify' | 'guest';

export interface SonaraUser {
  id: string;
  email?: string;
  displayName: string;
  photoUrl?: string;
  provider: AuthProviderName | 'firebase';
}

interface AuthConfig {
  authRequired: boolean;
  guestAllowed: boolean;
  firebaseConfig: FirebaseOptions | null;
  providers: Record<'google' | 'apple' | 'facebook' | 'spotify', boolean>;
}

interface AuthContextValue {
  user: SonaraUser | null;
  config: AuthConfig | null;
  loading: boolean;
  authenticating: AuthProviderName | null;
  error: string;
  signIn: (provider: Exclude<AuthProviderName, 'guest'>) => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_SESSION_KEY = 'sonara_guest_session';

const readJson = async (response: Response) => {
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  return data;
};

const errorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('auth/popup-closed-by-user')) return 'The sign-in window was closed before completion.';
  if (raw.includes('auth/account-exists-with-different-credential')) return 'This email already uses another sign-in provider.';
  if (raw.includes('auth/unauthorized-domain')) return 'This domain is not authorized in Firebase Authentication.';
  if (raw.includes('auth/operation-not-allowed')) return 'This provider is not enabled in Firebase Authentication.';
  return raw;
};

export const SonaraAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<SonaraUser | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState<AuthProviderName | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const callbackError = new URLSearchParams(window.location.search).get('auth_error');
        if (callbackError) {
          setError(callbackError === 'spotify_state_validation_failed'
            ? 'Spotify rejected the callback state. Please start the sign-in again.'
            : 'Spotify authentication could not be completed.');
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
        const [configResponse, sessionResponse] = await Promise.all([
          fetch('/api/auth/config', { cache: 'no-store', credentials: 'include' }),
          fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
        ]);
        const configData = await readJson(configResponse);
        const sessionData = await readJson(sessionResponse);
        if (cancelled) return;
        setConfig({
          authRequired: Boolean(configData.authRequired),
          guestAllowed: Boolean(configData.guestAllowed),
          firebaseConfig: configData.firebaseConfig || null,
          providers: {
            google: Boolean(configData.providers?.google),
            apple: Boolean(configData.providers?.apple),
            facebook: Boolean(configData.providers?.facebook),
            spotify: Boolean(configData.providers?.spotify)
          }
        });
        if (sessionData.authenticated && sessionData.user) {
          setUser(sessionData.user);
        } else if (sessionStorage.getItem(GUEST_SESSION_KEY) === 'active' && configData.guestAllowed) {
          setUser({ id: 'local-operator', displayName: 'Studio Operator', provider: 'guest' });
        }
      } catch (initializationError) {
        if (!cancelled) setError(errorMessage(initializationError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const signIn = async (providerName: Exclude<AuthProviderName, 'guest'>) => {
    if (!config?.providers[providerName]) {
      setError(`${providerName} authentication is not configured yet.`);
      return;
    }
    setError('');
    setAuthenticating(providerName);

    try {
      if (providerName === 'spotify') {
        window.location.assign('/api/auth/spotify/start?returnTo=/');
        return;
      }
      if (!config.firebaseConfig) throw new Error('Firebase web configuration is missing.');

      const app = getApps()[0] || initializeApp(config.firebaseConfig);
      const auth = getAuth(app);
      let provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider;
      if (providerName === 'google') {
        const google = new GoogleAuthProvider();
        google.setCustomParameters({ prompt: 'select_account' });
        provider = google;
      } else if (providerName === 'facebook') {
        const facebook = new FacebookAuthProvider();
        facebook.addScope('email');
        provider = facebook;
      } else {
        const apple = new OAuthProvider('apple.com');
        apple.addScope('email');
        apple.addScope('name');
        provider = apple;
      }

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken(true);
      const response = await fetch('/api/auth/firebase/session', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const sessionData = await readJson(response);
      if (!sessionData.authenticated || !sessionData.user) {
        throw new Error('The server did not create an authenticated session.');
      }
      sessionStorage.removeItem(GUEST_SESSION_KEY);
      setUser(sessionData.user);
    } catch (signInError) {
      setError(errorMessage(signInError));
    } finally {
      if (providerName !== 'spotify') setAuthenticating(null);
    }
  };

  const continueAsGuest = () => {
    if (!config?.guestAllowed) return;
    sessionStorage.setItem(GUEST_SESSION_KEY, 'active');
    setError('');
    setUser({ id: 'local-operator', displayName: 'Studio Operator', provider: 'guest' });
  };

  const signOut = async () => {
    setAuthenticating(null);
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    try {
      if (getApps()[0]) await firebaseSignOut(getAuth(getApps()[0]));
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setUser(null);
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    config,
    loading,
    authenticating,
    error,
    signIn,
    continueAsGuest,
    signOut
  }), [user, config, loading, authenticating, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useSonaraAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useSonaraAuth must be used inside SonaraAuthProvider.');
  return context;
}

const BootAnimation: React.FC = () => (
  <div className="sonara-auth-surface" role="status" aria-live="polite" aria-label="Sonara is starting">
    <style>{authStyles}</style>
    <div className="sonara-boot-orbit" aria-hidden="true">
      <span className="sonara-orbit sonara-orbit-one" />
      <span className="sonara-orbit sonara-orbit-two" />
      <span className="sonara-boot-core"><Music size={30} /></span>
    </div>
    <div className="sonara-wordmark">SONARA <span>AI</span></div>
    <p className="sonara-boot-copy">Initializing Creative Intelligence</p>
    <div className="sonara-boot-progress"><span /></div>
  </div>
);

const ProviderButton: React.FC<{
  name: Exclude<AuthProviderName, 'guest'>;
  label: string;
  available: boolean;
  active: boolean;
  onClick: () => void;
}> = ({ name, label, available, active, onClick }) => (
  <button
    type="button"
    className={`sonara-provider sonara-provider-${name}`}
    onClick={onClick}
    disabled={!available || active}
    aria-label={available ? `Continue with ${label}` : `${label} is not configured`}
  >
    <span className="sonara-provider-mark" aria-hidden="true">
      {name === 'google' ? 'G' : name === 'apple' ? '●' : name === 'facebook' ? 'f' : '◉'}
    </span>
    <span>Continue with {label}</span>
    {active ? <Loader2 className="sonara-provider-spinner" size={17} /> : available ? <CheckCircle2 size={16} /> : <LockKeyhole size={15} />}
  </button>
);

const AuthSplash: React.FC = () => {
  const { config, authenticating, error, signIn, continueAsGuest } = useSonaraAuth();
  const providers = config?.providers || { google: false, apple: false, facebook: false, spotify: false };
  const configuredCount = Object.values(providers).filter(Boolean).length;

  return (
    <div className="sonara-auth-surface sonara-splash">
      <style>{authStyles}</style>
      <main className="sonara-login-card">
        <section className="sonara-login-visual">
          <div className="sonara-login-logo"><Music size={27} /></div>
          <div>
            <div className="sonara-wordmark sonara-wordmark-small">SONARA <span>AI</span></div>
            <p>Creative Operating System</p>
          </div>
          <div className="sonara-waveform" aria-hidden="true">
            {Array.from({ length: 36 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 68)}%` }} />)}
          </div>
          <div className="sonara-visual-message">
            <p>One identity. Your complete music workflow.</p>
            <span>Neural generation · Music Brain · Real DSP · GPU stems</span>
          </div>
        </section>

        <section className="sonara-login-panel">
          <div className="sonara-security-label"><ShieldCheck size={16} /> Secure artist access</div>
          <h1>Welcome to Sonara</h1>
          <p className="sonara-login-description">Sign in to protect your productions, identity and Music DNA across sessions.</p>

          <div className="sonara-provider-list">
            <ProviderButton name="google" label="Google" available={providers.google} active={authenticating === 'google'} onClick={() => void signIn('google')} />
            <ProviderButton name="apple" label="Apple" available={providers.apple} active={authenticating === 'apple'} onClick={() => void signIn('apple')} />
            <ProviderButton name="facebook" label="Facebook" available={providers.facebook} active={authenticating === 'facebook'} onClick={() => void signIn('facebook')} />
            <ProviderButton name="spotify" label="Spotify" available={providers.spotify} active={authenticating === 'spotify'} onClick={() => void signIn('spotify')} />
          </div>

          {error && <div className="sonara-auth-error" role="alert">{error}</div>}

          {config?.guestAllowed && (
            <>
              <div className="sonara-divider"><span>or</span></div>
              <button type="button" className="sonara-guest-button" onClick={continueAsGuest}>Enter local production studio</button>
              <p className="sonara-guest-note">Local operator mode does not create a cloud identity.</p>
            </>
          )}

          {configuredCount === 0 && (
            <div className="sonara-config-notice"><LockKeyhole size={16} /><span>Social providers are safely disabled until their environment configuration is complete.</span></div>
          )}

          <p className="sonara-legal">Authentication uses provider-hosted consent screens. Sonara never receives or stores your provider password.</p>
        </section>
      </main>
    </div>
  );
};

export const SonaraAuthGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, loading } = useSonaraAuth();
  const [bootComplete, setBootComplete] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setBootComplete(true), reducedMotion ? 350 : 1800);
    return () => window.clearTimeout(timer);
  }, []);

  if (!bootComplete || loading) return <BootAnimation />;
  if (!user) return <AuthSplash />;
  return <>{children}</>;
};

const authStyles = `
  .sonara-auth-surface{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;color:#f8fafc;background:radial-gradient(circle at 20% 20%,rgba(124,58,237,.22),transparent 34%),radial-gradient(circle at 82% 78%,rgba(6,182,212,.16),transparent 36%),#060912;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden;position:relative}
  .sonara-auth-surface:before{content:"";position:absolute;inset:0;opacity:.22;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,black,transparent)}
  .sonara-boot-orbit{position:relative;width:142px;height:142px;display:grid;place-items:center}
  .sonara-orbit{position:absolute;inset:0;border:1px solid rgba(167,139,250,.5);border-radius:50%;animation:sonara-spin 2.8s linear infinite}
  .sonara-orbit:after{content:"";position:absolute;top:7px;left:50%;width:10px;height:10px;border-radius:50%;background:#a78bfa;box-shadow:0 0 24px #8b5cf6}
  .sonara-orbit-two{inset:17px;border-color:rgba(34,211,238,.38);animation-direction:reverse;animation-duration:2s}
  .sonara-orbit-two:after{background:#22d3ee;box-shadow:0 0 20px #06b6d4}
  .sonara-boot-core{width:66px;height:66px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(145deg,#7c3aed,#4f46e5 52%,#0891b2);box-shadow:0 20px 60px rgba(76,29,149,.65);animation:sonara-pulse 1.7s ease-in-out infinite}
  .sonara-wordmark{position:absolute;margin-top:230px;font-size:23px;letter-spacing:.24em;font-weight:900}.sonara-wordmark span{color:#a78bfa}
  .sonara-boot-copy{position:absolute;margin-top:292px;color:#94a3b8;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
  .sonara-boot-progress{position:absolute;margin-top:348px;width:190px;height:2px;background:#1e293b;overflow:hidden;border-radius:999px}.sonara-boot-progress span{display:block;width:45%;height:100%;background:linear-gradient(90deg,#7c3aed,#22d3ee);animation:sonara-load 1.2s ease-in-out infinite}
  .sonara-login-card{position:relative;z-index:1;width:min(1040px,100%);min-height:650px;display:grid;grid-template-columns:1.05fr .95fr;border:1px solid rgba(71,85,105,.62);border-radius:32px;overflow:hidden;background:rgba(10,15,28,.92);box-shadow:0 36px 120px rgba(0,0,0,.55)}
  .sonara-login-visual{position:relative;padding:52px;display:flex;align-items:flex-start;gap:16px;overflow:hidden;background:linear-gradient(145deg,rgba(76,29,149,.72),rgba(15,23,42,.92) 55%,rgba(8,145,178,.35))}
  .sonara-login-visual:after{content:"";position:absolute;width:420px;height:420px;border:1px solid rgba(255,255,255,.09);border-radius:50%;right:-170px;top:-120px;box-shadow:0 0 0 54px rgba(255,255,255,.025),0 0 0 108px rgba(255,255,255,.018)}
  .sonara-login-logo{width:56px;height:56px;border-radius:19px;display:grid;place-items:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(12px)}
  .sonara-wordmark-small{position:static;margin:4px 0 0;font-size:20px}.sonara-login-visual p{margin:4px 0;color:#cbd5e1;font-size:12px}
  .sonara-waveform{position:absolute;left:52px;right:52px;top:245px;height:150px;display:flex;align-items:center;gap:5px;opacity:.84}.sonara-waveform i{display:block;flex:1;min-width:3px;border-radius:999px;background:linear-gradient(to top,#22d3ee,#a78bfa);animation:sonara-wave 2.4s ease-in-out infinite}.sonara-waveform i:nth-child(3n){animation-delay:-.7s}.sonara-waveform i:nth-child(4n){animation-delay:-1.2s}
  .sonara-visual-message{position:absolute;left:52px;right:52px;bottom:54px}.sonara-visual-message p{font-size:24px;font-weight:850;letter-spacing:-.03em;color:white;max-width:390px;line-height:1.15}.sonara-visual-message span{display:block;margin-top:12px;font-size:11px;letter-spacing:.08em;color:#c4b5fd}
  .sonara-login-panel{padding:56px 52px;background:rgba(7,10,18,.82)}.sonara-security-label{display:flex;align-items:center;gap:7px;color:#6ee7b7;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.sonara-login-panel h1{font-size:31px;letter-spacing:-.04em;margin:18px 0 8px}.sonara-login-description{font-size:13px;line-height:1.65;color:#94a3b8;margin:0 0 26px}.sonara-provider-list{display:grid;gap:10px}
  .sonara-provider{width:100%;height:49px;border:1px solid #334155;border-radius:14px;background:#111827;color:#f8fafc;display:grid;grid-template-columns:28px 1fr 18px;align-items:center;gap:10px;padding:0 16px;font-size:13px;font-weight:750;text-align:left;transition:.2s}.sonara-provider:not(:disabled):hover{transform:translateY(-1px);border-color:#8b5cf6;background:#151c2e}.sonara-provider:disabled{cursor:not-allowed;opacity:.42}.sonara-provider-mark{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#fff;color:#111827;font-weight:900;font-size:15px}.sonara-provider-facebook .sonara-provider-mark{background:#1877f2;color:#fff}.sonara-provider-spotify .sonara-provider-mark{background:#1ed760;color:#07120a}.sonara-provider-apple .sonara-provider-mark{background:#f8fafc;color:#020617}.sonara-provider-spinner{animation:sonara-spin 1s linear infinite}
  .sonara-divider{height:36px;display:flex;align-items:center;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.sonara-divider:before,.sonara-divider:after{content:"";height:1px;background:#1e293b;flex:1}.sonara-divider span{padding:0 12px}.sonara-guest-button{width:100%;height:45px;border:1px solid rgba(139,92,246,.55);border-radius:13px;background:rgba(76,29,149,.22);color:#ddd6fe;font-weight:800;cursor:pointer}.sonara-guest-button:hover{background:rgba(76,29,149,.36)}.sonara-guest-note{text-align:center!important;color:#64748b!important;font-size:10px!important}.sonara-config-notice,.sonara-auth-error{margin-top:18px;border-radius:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:9px;font-size:10px;line-height:1.5}.sonara-config-notice{border:1px solid #334155;background:#0f172a;color:#94a3b8}.sonara-auth-error{border:1px solid #7f1d1d;background:rgba(69,10,10,.5);color:#fca5a5}.sonara-legal{margin-top:18px!important;font-size:9px!important;line-height:1.5!important;color:#475569!important;text-align:center}
  @keyframes sonara-spin{to{transform:rotate(360deg)}}@keyframes sonara-pulse{50%{transform:scale(1.06);filter:brightness(1.2)}}@keyframes sonara-load{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}@keyframes sonara-wave{50%{transform:scaleY(.58);filter:brightness(1.35)}}
  @media(max-width:780px){.sonara-auth-surface{padding:12px}.sonara-login-card{grid-template-columns:1fr;min-height:auto}.sonara-login-visual{min-height:210px;padding:28px}.sonara-waveform{display:none}.sonara-visual-message{left:28px;bottom:26px}.sonara-visual-message p{font-size:19px}.sonara-visual-message span{display:none}.sonara-login-panel{padding:32px 25px}.sonara-login-visual:after{width:260px;height:260px}}
  @media(prefers-reduced-motion:reduce){.sonara-orbit,.sonara-boot-core,.sonara-boot-progress span,.sonara-waveform i,.sonara-provider-spinner{animation:none!important}.sonara-provider{transition:none}}
`;
