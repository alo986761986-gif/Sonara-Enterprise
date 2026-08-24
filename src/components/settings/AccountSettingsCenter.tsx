import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CreditCard,
  Download,
  Eye,
  Globe2,
  HardDrive,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  Palette,
  RefreshCw,
  Save,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  deleteCurrentFirebaseAccount,
  linkCurrentUserWithGoogle,
  requestFirebaseEmailChange,
  resetEmailPassword,
  sendCurrentUserVerification,
  updateFirebaseUserProfile,
  uploadFirebaseAvatar,
  watchFirebaseUser
} from '../../lib/firebaseClient';
import { LANGUAGE_METADATA, SUPPORTED_LANGUAGES, type LanguageCode } from '../../i18n/locales';
import { clearGeneratedProjects, listGeneratedProjects } from '../../services/generatedAssetVault';
import PricingAndUsage from '../billing/PricingAndUsage';

type SettingsTab = 'profile' | 'account' | 'preferences' | 'privacy' | 'notifications' | 'plan' | 'security';

interface CreatorProfile {
  displayName: string;
  handle: string;
  bio: string;
  location: string;
  website: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  spotify: string;
  avatarUrl: string;
}

interface SonaraPreferences {
  outputFormat: 'wav' | 'flac' | 'mp3';
  audioQuality: 'standard' | 'high' | 'lossless';
  autoplay: boolean;
  normalizePlayback: boolean;
  showExplicitContent: boolean;
  myTaste: boolean;
  styleAugmentation: boolean;
  favoriteGenres: string;
  favoriteMoods: string;
  defaultVisibility: 'link-only' | 'private' | 'public';
  allowComments: boolean;
  allowRemixes: boolean;
  profileDiscoverable: boolean;
  showActivity: boolean;
  usageAnalytics: boolean;
  modelImprovement: boolean;
  notifyGeneration: boolean;
  notifyComments: boolean;
  notifyLikes: boolean;
  notifyFollowers: boolean;
  notifyCollaboration: boolean;
  notifyProduct: boolean;
  notifySecurity: boolean;
  emailDigest: 'never' | 'daily' | 'weekly';
}

interface AccountSettingsCenterProps {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  durationSec: number;
  onDurationChange: (duration: number) => void;
  durationOptions: number[];
  bpm: number;
  onBpmChange: (bpm: number) => void;
}

const PROFILE_KEY = 'sonara.creatorProfile';
const PREFERENCES_KEY = 'sonara.accountPreferences';

const EMPTY_PROFILE: CreatorProfile = {
  displayName: '',
  handle: '',
  bio: '',
  location: '',
  website: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  spotify: '',
  avatarUrl: ''
};

const DEFAULT_PREFERENCES: SonaraPreferences = {
  outputFormat: 'wav',
  audioQuality: 'lossless',
  autoplay: true,
  normalizePlayback: true,
  showExplicitContent: true,
  myTaste: true,
  styleAugmentation: true,
  favoriteGenres: '',
  favoriteMoods: '',
  defaultVisibility: 'link-only',
  allowComments: true,
  allowRemixes: true,
  profileDiscoverable: true,
  showActivity: true,
  usageAnalytics: true,
  modelImprovement: false,
  notifyGeneration: true,
  notifyComments: true,
  notifyLikes: true,
  notifyFollowers: true,
  notifyCollaboration: true,
  notifyProduct: false,
  notifySecurity: true,
  emailDigest: 'weekly'
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/requires-recent-login/i.test(message)) return 'Per sicurezza, esci e accedi di nuovo prima di completare questa operazione.';
  if (/credential-already-in-use|email-already-in-use/i.test(message)) return 'Questo account Google o indirizzo email è già collegato a un altro profilo.';
  if (/popup-closed-by-user/i.test(message)) return 'Collegamento annullato prima del completamento.';
  if (/storage\/unauthorized/i.test(message)) return 'Firebase Storage non consente ancora il caricamento dell’avatar per questo account.';
  return message;
}

function formatBytes(value: number): string {
  if (!value) return '0 MB';
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function resizeAvatar(file: Blob): Promise<{ blob: Blob; dataUrl: string }> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Immagine non leggibile.'));
      element.src = sourceUrl;
    });
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas non disponibile.');
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Conversione avatar non riuscita.')), 'image/webp', 0.88);
    });
    return { blob, dataUrl: canvas.toDataURL('image/webp', 0.88) };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function createGeneratedAvatar(prompt: string, initials: string): Promise<{ blob: Blob; dataUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Generatore avatar non disponibile.');
  const seed = [...(prompt || initials || 'SONARA')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (hueA + 75 + seed % 80) % 360;
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, `hsl(${hueA} 88% 48%)`);
  gradient.addColorStop(1, `hsl(${hueB} 92% 40%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.globalAlpha = 0.22;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 10;
  for (let row = 0; row < 5; row += 1) {
    context.beginPath();
    for (let x = -20; x <= 532; x += 8) {
      const y = 118 + row * 66 + Math.sin((x + seed + row * 34) / 34) * (18 + row * 3);
      if (x === -20) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
  context.fillStyle = '#ffffff';
  context.font = '900 138px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0,0,0,.25)';
  context.shadowBlur = 24;
  context.fillText((initials || 'SA').slice(0, 2).toUpperCase(), 256, 256);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Generazione avatar non riuscita.')), 'image/webp', 0.9);
  });
  return { blob, dataUrl: canvas.toDataURL('image/webp', 0.9) };
}

const Toggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
    <span><span className="block text-sm font-bold text-slate-100">{label}</span><span className="mt-1 block text-[11px] leading-5 text-slate-500">{description}</span></span>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="peer sr-only" />
    <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-700 transition peer-checked:bg-purple-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
  </label>
);

const Field = ({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) => (
  <label className="block text-xs font-semibold text-slate-400">
    {label}
    <span className="mt-2 block">{children}</span>
    {help && <span className="mt-1 block text-[10px] font-normal text-slate-600">{help}</span>}
  </label>
);

export default function AccountSettingsCenter({
  language,
  onLanguageChange,
  durationSec,
  onDurationChange,
  durationOptions,
  bpm,
  onBpmChange
}: AccountSettingsCenterProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<CreatorProfile>(() => loadStored(PROFILE_KEY, EMPTY_PROFILE));
  const [preferences, setPreferences] = useState<SonaraPreferences>(() => loadStored(PREFERENCES_KEY, DEFAULT_PREFERENCES));
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [avatarPrompt, setAvatarPrompt] = useState('artista elettronico futuristico, onde sonore viola e ciano');
  const [newEmail, setNewEmail] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, persisted: false });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => watchFirebaseUser(user => {
    setFirebaseUser(user);
    setNewEmail(user?.email || '');
    setProfile(previous => ({
      ...previous,
      displayName: previous.displayName || user?.displayName || user?.email?.split('@')[0] || '',
      handle: previous.handle || sanitizeHandle(user?.displayName || user?.email?.split('@')[0] || ''),
      avatarUrl: previous.avatarUrl || user?.photoURL || ''
    }));
  }), []);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new CustomEvent('sonara:preferences-updated', { detail: preferences }));
  }, [preferences]);

  useEffect(() => {
    const readStorage = async () => {
      const estimate = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorageInfo({ usage: estimate?.usage || 0, quota: estimate?.quota || 0, persisted: Boolean(persisted) });
    };
    void readStorage();
  }, []);

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'profile', label: 'Profilo', icon: User },
    { id: 'account', label: 'Account', icon: Mail },
    { id: 'preferences', label: 'Preferenze', icon: SlidersHorizontal },
    { id: 'privacy', label: 'Privacy', icon: Eye },
    { id: 'notifications', label: 'Notifiche', icon: Bell },
    { id: 'plan', label: 'Piano e utilizzo', icon: CreditCard },
    { id: 'security', label: 'Sicurezza e dati', icon: Shield }
  ];

  const providers = useMemo(() => firebaseUser?.providerData.map(provider => provider.providerId) || [], [firebaseUser]);
  const initials = (profile.displayName || profile.handle || firebaseUser?.email || 'SA').split(/\s|@/).filter(Boolean).slice(0, 2).map(value => value[0]).join('');
  const inputClass = 'w-full rounded-xl border border-slate-700 bg-[#060a12] px-3 py-2.5 text-sm text-white outline-none transition focus:border-purple-500';
  const updatePreference = <K extends keyof SonaraPreferences>(key: K, value: SonaraPreferences[K]) => setPreferences(previous => ({ ...previous, [key]: value }));
  const showSuccess = (text: string) => setNotice({ type: 'success', text });
  const showError = (error: unknown) => setNotice({ type: 'error', text: friendlyError(error) });

  const saveProfile = async () => {
    if (profile.handle.length < 3) {
      setNotice({ type: 'error', text: 'L’handle deve contenere almeno 3 caratteri.' });
      return;
    }
    setBusyAction('profile');
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      if (firebaseUser) {
        const remotePhoto = /^https?:/i.test(profile.avatarUrl) ? profile.avatarUrl : undefined;
        await updateFirebaseUserProfile(profile.displayName, remotePhoto);
      }
      window.dispatchEvent(new CustomEvent('sonara:profile-updated', { detail: profile }));
      showSuccess('Profilo SONARA salvato correttamente.');
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction('');
    }
  };

  const storeAvatar = async (blob: Blob, dataUrl: string) => {
    if (firebaseUser) {
      try {
        const photoURL = await uploadFirebaseAvatar(blob);
        setProfile(previous => ({ ...previous, avatarUrl: photoURL }));
        return;
      } catch (error) {
        showError(error);
      }
    }
    setProfile(previous => ({ ...previous, avatarUrl: dataUrl }));
  };

  const handleAvatarFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return showError(new Error('Seleziona un file immagine.'));
    if (file.size > 10 * 1024 * 1024) return showError(new Error('L’avatar non può superare 10 MB.'));
    setBusyAction('avatar');
    try {
      const resized = await resizeAvatar(file);
      await storeAvatar(resized.blob, resized.dataUrl);
      showSuccess('Avatar aggiornato. Premi Salva profilo per confermare tutti i dati.');
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction('');
    }
  };

  const generateAvatar = async () => {
    setBusyAction('avatar');
    try {
      const generated = await createGeneratedAvatar(avatarPrompt, initials);
      await storeAvatar(generated.blob, generated.dataUrl);
      showSuccess('Nuovo avatar SONARA generato dal prompt.');
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction('');
    }
  };

  const runAccountAction = async (action: string, operation: () => Promise<void>, success: string) => {
    setBusyAction(action);
    try {
      await operation();
      showSuccess(success);
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction('');
    }
  };

  const exportAccountData = async () => {
    setBusyAction('export');
    try {
      const projects = await listGeneratedProjects();
      const payload = {
        exportedAt: new Date().toISOString(),
        account: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, providers } : { guest: true },
        profile,
        preferences,
        generatorDefaults: { language, durationSec, bpm },
        projects: projects.map(project => ({ ...project, assets: project.assets.map(({ blob: _blob, ...asset }) => asset) }))
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sonara-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSuccess('Esportazione account completata.');
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction('');
    }
  };

  const deleteAccount = async () => {
    if (deletePhrase !== 'ELIMINA SONARA') return;
    await runAccountAction('delete', async () => {
      await deleteCurrentFirebaseAccount();
      await clearGeneratedProjects();
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(PREFERENCES_KEY);
      window.dispatchEvent(new Event('sonara:logout'));
    }, 'Account eliminato.');
  };

  const tabHeader = tabs.find(tab => tab.id === activeTab)!;
  const TabIcon = tabHeader.icon;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 text-purple-300"><Palette className="h-5 w-5" /></div>
            <div><h2 className="text-xl font-black text-white">Impostazioni SONARA</h2><p className="mt-1 text-xs text-slate-400">Profilo creator, account, personalizzazione, privacy, notifiche e sicurezza.</p></div>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-[10px] font-bold ${firebaseUser ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            <span className={`h-2 w-2 rounded-full ${firebaseUser ? 'bg-emerald-400' : 'bg-amber-400'}`} />{firebaseUser ? 'ACCOUNT CONNESSO' : 'MODALITÀ OSPITE'}
          </div>
        </div>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${notice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : notice.type === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}`}>
          <span className="flex items-center gap-2">{notice.type === 'success' && <Check className="h-4 w-4" />}{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-current opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-2 lg:block lg:space-y-1 lg:self-start">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition lg:w-full ${activeTab === tab.id ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon className="h-4 w-4" />{tab.label}</button>;
          })}
        </nav>

        <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3 border-b border-slate-800 pb-4"><TabIcon className="h-5 w-5 text-purple-400" /><h3 className="text-lg font-black text-white">{tabHeader.label}</h3></div>

          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                <div className="space-y-5">
                  <div className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-purple-500/50 bg-gradient-to-br from-purple-600 to-indigo-700 text-2xl font-black text-white">
                      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Avatar profilo" className="h-full w-full object-cover" /> : initials.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-white">Avatar del creator</div>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">Carica JPG, PNG o WebP fino a 10 MB. SONARA ottimizza automaticamente l’immagine a 512×512.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void handleAvatarFile(event.target.files?.[0])} />
                        <button type="button" disabled={busyAction === 'avatar'} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"><Upload className="h-4 w-4" />Carica immagine</button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
                    <div className="flex items-center gap-2 text-sm font-black text-purple-200"><Sparkles className="h-4 w-4" />Genera avatar SONARA</div>
                    <p className="mt-1 text-[11px] text-slate-500">Descrivi lo stile: SONARA crea un’identità grafica musicale unica con colori, onde e iniziali.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={avatarPrompt} onChange={event => setAvatarPrompt(event.target.value)} maxLength={180} className={inputClass} /><button type="button" disabled={busyAction === 'avatar'} onClick={() => void generateAvatar()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busyAction === 'avatar' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Genera</button></div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome visualizzato"><input value={profile.displayName} maxLength={60} onChange={event => setProfile(previous => ({ ...previous, displayName: event.target.value }))} className={inputClass} placeholder="Nome artista o producer" /></Field>
                    <Field label="Handle" help="Solo lettere minuscole, numeri e underscore."><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">@</span><input value={profile.handle} minLength={3} maxLength={30} onChange={event => setProfile(previous => ({ ...previous, handle: sanitizeHandle(event.target.value) }))} className={`${inputClass} pl-7`} placeholder="nome_creator" /></div></Field>
                  </div>
                  <Field label="Biografia" help={`${profile.bio.length}/160 caratteri`}><textarea value={profile.bio} maxLength={160} rows={4} onChange={event => setProfile(previous => ({ ...previous, bio: event.target.value }))} className={inputClass} placeholder="Racconta il tuo suono, il tuo ruolo e il tuo progetto." /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Località"><input value={profile.location} maxLength={80} onChange={event => setProfile(previous => ({ ...previous, location: event.target.value }))} className={inputClass} placeholder="Roma, Italia" /></Field>
                    <Field label="Sito web"><input value={profile.website} onChange={event => setProfile(previous => ({ ...previous, website: event.target.value }))} className={inputClass} placeholder="https://..." /></Field>
                    <Field label="Instagram"><input value={profile.instagram} onChange={event => setProfile(previous => ({ ...previous, instagram: event.target.value }))} className={inputClass} placeholder="@username" /></Field>
                    <Field label="TikTok"><input value={profile.tiktok} onChange={event => setProfile(previous => ({ ...previous, tiktok: event.target.value }))} className={inputClass} placeholder="@username" /></Field>
                    <Field label="YouTube"><input value={profile.youtube} onChange={event => setProfile(previous => ({ ...previous, youtube: event.target.value }))} className={inputClass} placeholder="URL canale" /></Field>
                    <Field label="Spotify"><input value={profile.spotify} onChange={event => setProfile(previous => ({ ...previous, spotify: event.target.value }))} className={inputClass} placeholder="URL artista" /></Field>
                  </div>
                  <button type="button" disabled={busyAction === 'profile'} onClick={() => void saveProfile()} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busyAction === 'profile' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salva profilo</button>
                </div>

                <aside className="self-start rounded-2xl border border-slate-800 bg-[#060a12] p-5">
                  <div className="mb-4 text-[10px] font-black uppercase tracking-wider text-slate-500">Anteprima profilo pubblico</div>
                  <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 text-2xl font-black text-white">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials.toUpperCase()}</div>
                  <div className="mt-4 text-center"><div className="font-black text-white">{profile.displayName || 'Creator SONARA'}</div><div className="text-xs text-purple-300">@{profile.handle || 'creator'}</div></div>
                  <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">{profile.bio || 'La tua biografia apparirà qui.'}</p>
                  {profile.location && <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-600"><Globe2 className="h-3 w-3" />{profile.location}</div>}
                </aside>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="text-sm font-black text-white">Account SONARA</div><div className="mt-1 text-xs text-slate-500">{firebaseUser ? firebaseUser.email : 'Stai utilizzando SONARA come ospite.'}</div></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${firebaseUser?.emailVerified ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>{firebaseUser?.emailVerified ? 'EMAIL VERIFICATA' : 'EMAIL DA VERIFICARE'}</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{providers.map(provider => <span key={provider} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">{provider === 'google.com' ? 'Google' : 'Email e password'}</span>)}</div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center gap-2 font-bold text-white"><Mail className="h-4 w-4 text-purple-400" />Indirizzo email</div><div className="mt-4 space-y-3"><input type="email" value={newEmail} disabled={!firebaseUser} onChange={event => setNewEmail(event.target.value)} className={inputClass} /><button type="button" disabled={!firebaseUser || !newEmail || newEmail === firebaseUser.email || busyAction === 'email'} onClick={() => void runAccountAction('email', () => requestFirebaseEmailChange(newEmail), 'Controlla la nuova casella email per confermare la modifica.')} className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200 disabled:opacity-40">Cambia email</button></div></div>
                <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center gap-2 font-bold text-white"><Link2 className="h-4 w-4 text-cyan-400" />Metodi di accesso</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Collega Google per avere un secondo metodo di accesso sicuro.</p><button type="button" disabled={!firebaseUser || providers.includes('google.com') || busyAction === 'google'} onClick={() => void runAccountAction('google', async () => { await linkCurrentUserWithGoogle(); }, 'Account Google collegato correttamente.')} className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{providers.includes('google.com') ? 'Google collegato' : 'Collega Google'}</button></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!firebaseUser || firebaseUser.emailVerified || busyAction === 'verify'} onClick={() => void runAccountAction('verify', sendCurrentUserVerification, 'Email di verifica inviata.')} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">Invia verifica email</button>
                <button type="button" disabled={!firebaseUser?.email || busyAction === 'reset'} onClick={() => void runAccountAction('reset', () => resetEmailPassword(firebaseUser!.email!), 'Email per il recupero password inviata.')} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">Reimposta password</button>
                <button type="button" onClick={() => window.dispatchEvent(new Event('sonara:logout'))} className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300"><LogOut className="h-4 w-4" />Esci</button>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Lingua interfaccia"><select value={language} onChange={event => onLanguageChange(event.target.value as LanguageCode)} className={inputClass}>{SUPPORTED_LANGUAGES.map(code => <option key={code} value={code}>{LANGUAGE_METADATA[code].nativeName}</option>)}</select></Field>
                <Field label="Durata predefinita"><select value={durationSec} onChange={event => onDurationChange(Number(event.target.value))} className={inputClass}>{durationOptions.map(value => <option key={value} value={value}>{value < 60 ? `${value} secondi` : `${value / 60} minuti`}</option>)}</select></Field>
                <Field label="BPM preferiti"><input type="number" min={40} max={220} value={bpm} onChange={event => onBpmChange(Number(event.target.value))} className={inputClass} /></Field>
                <Field label="Formato download"><select value={preferences.outputFormat} onChange={event => updatePreference('outputFormat', event.target.value as SonaraPreferences['outputFormat'])} className={inputClass}><option value="wav">WAV</option><option value="flac">FLAC</option><option value="mp3">MP3</option></select></Field>
                <Field label="Qualità audio"><select value={preferences.audioQuality} onChange={event => updatePreference('audioQuality', event.target.value as SonaraPreferences['audioQuality'])} className={inputClass}><option value="standard">Standard</option><option value="high">Alta</option><option value="lossless">Lossless</option></select></Field>
                <Field label="Riepilogo email"><select value={preferences.emailDigest} onChange={event => updatePreference('emailDigest', event.target.value as SonaraPreferences['emailDigest'])} className={inputClass}><option value="never">Mai</option><option value="daily">Giornaliero</option><option value="weekly">Settimanale</option></select></Field>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <Toggle checked={preferences.autoplay} onChange={value => updatePreference('autoplay', value)} label="Riproduzione automatica" description="Avvia automaticamente il brano selezionato nella libreria." />
                <Toggle checked={preferences.normalizePlayback} onChange={value => updatePreference('normalizePlayback', value)} label="Normalizzazione riproduzione" description="Mantiene un volume coerente durante l’ascolto." />
                <Toggle checked={preferences.showExplicitContent} onChange={value => updatePreference('showExplicitContent', value)} label="Contenuti espliciti" description="Mostra e consente testi contrassegnati come espliciti." />
                <Toggle checked={preferences.myTaste} onChange={value => updatePreference('myTaste', value)} label="Il mio gusto" description="Personalizza suggerimenti e stili in base alle tue scelte musicali." />
                <Toggle checked={preferences.styleAugmentation} onChange={value => updatePreference('styleAugmentation', value)} label="Potenziamento stile" description="Usa il tuo gusto per arricchire le indicazioni creative del generatore." />
              </div>
              {preferences.myTaste && <div className="grid gap-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 sm:grid-cols-2"><Field label="Generi preferiti"><input value={preferences.favoriteGenres} onChange={event => updatePreference('favoriteGenres', event.target.value)} className={inputClass} placeholder="House, R&B, Pop..." /></Field><Field label="Atmosfere preferite"><input value={preferences.favoriteMoods} onChange={event => updatePreference('favoriteMoods', event.target.value)} className={inputClass} placeholder="Energetica, profonda, romantica..." /></Field></div>}
              <button type="button" onClick={() => showSuccess('Preferenze salvate automaticamente e applicate a SONARA.')} className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white"><Save className="h-4 w-4" />Conferma preferenze</button>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><div className="flex items-center gap-2 font-black text-white"><Lock className="h-4 w-4 text-purple-400" />Visibilità predefinita delle nuove creazioni</div><div className="mt-4 grid gap-2 sm:grid-cols-3">{[['link-only', 'Solo link', 'Visibile soltanto a chi possiede il link'], ['private', 'Privato', 'Accessibile esclusivamente a te'], ['public', 'Pubblico', 'Visibile nel profilo e in Scoperta']].map(([value, label, description]) => <button key={value} type="button" onClick={() => updatePreference('defaultVisibility', value as SonaraPreferences['defaultVisibility'])} className={`rounded-xl border p-4 text-left ${preferences.defaultVisibility === value ? 'border-purple-400 bg-purple-500/15' : 'border-slate-800 bg-slate-950'}`}><span className="block text-xs font-black text-white">{label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span></button>)}</div></div>
              <div className="grid gap-3 xl:grid-cols-2">
                <Toggle checked={preferences.allowComments} onChange={value => updatePreference('allowComments', value)} label="Consenti commenti" description="Permette agli altri creator di commentare le creazioni pubbliche." />
                <Toggle checked={preferences.allowRemixes} onChange={value => updatePreference('allowRemixes', value)} label="Consenti remix e cover" description="Abilita riuso prompt, estensioni, cover e regolazione velocità." />
                <Toggle checked={preferences.profileDiscoverable} onChange={value => updatePreference('profileDiscoverable', value)} label="Profilo individuabile" description="Permette di trovare il profilo tramite ricerca e Scoperta." />
                <Toggle checked={preferences.showActivity} onChange={value => updatePreference('showActivity', value)} label="Mostra attività" description="Mostra like, playlist e creazioni recenti sul profilo." />
                <Toggle checked={preferences.usageAnalytics} onChange={value => updatePreference('usageAnalytics', value)} label="Analisi di utilizzo" description="Condivide dati tecnici aggregati per migliorare stabilità e prestazioni." />
                <Toggle checked={preferences.modelImprovement} onChange={value => updatePreference('modelImprovement', value)} label="Miglioramento dei modelli" description="Consenti l’uso delle tue interazioni per migliorare SONARA. Disattivato per impostazione predefinita." />
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-3">
              <div className="flex flex-col justify-between gap-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 sm:flex-row sm:items-center"><div><div className="font-black text-white">Notifiche del browser</div><p className="mt-1 text-[11px] text-slate-500">Autorizza SONARA ad avvisarti quando una generazione è terminata.</p></div><button type="button" disabled={typeof Notification === 'undefined' || Notification.permission === 'granted'} onClick={() => void Notification.requestPermission().then(permission => permission === 'granted' ? showSuccess('Notifiche browser abilitate.') : setNotice({ type: 'info', text: 'Permesso notifiche non concesso.' }))} className="shrink-0 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-black text-purple-200 disabled:opacity-40">{typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'Notifiche abilitate' : 'Abilita notifiche'}</button></div>
              <Toggle checked={preferences.notifyGeneration} onChange={value => updatePreference('notifyGeneration', value)} label="Generazione completata" description="Avvisa quando un brano o un master è pronto." />
              <Toggle checked={preferences.notifyComments} onChange={value => updatePreference('notifyComments', value)} label="Nuovi commenti" description="Avvisa quando qualcuno commenta una tua creazione." />
              <Toggle checked={preferences.notifyLikes} onChange={value => updatePreference('notifyLikes', value)} label="Like e inserimenti in playlist" description="Ricevi aggiornamenti sull’interazione con la tua musica." />
              <Toggle checked={preferences.notifyFollowers} onChange={value => updatePreference('notifyFollowers', value)} label="Nuovi follower" description="Avvisa quando un nuovo creator segue il tuo profilo." />
              <Toggle checked={preferences.notifyCollaboration} onChange={value => updatePreference('notifyCollaboration', value)} label="Collaborazioni" description="Inviti, revisioni, richieste e aggiornamenti dei progetti condivisi." />
              <Toggle checked={preferences.notifyProduct} onChange={value => updatePreference('notifyProduct', value)} label="Novità SONARA" description="Aggiornamenti su funzionalità, modelli e strumenti creativi." />
              <Toggle checked={preferences.notifySecurity} onChange={value => updatePreference('notifySecurity', value)} label="Sicurezza account" description="Avvisi importanti su accessi, email e modifiche sensibili. Consigliato." />
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="space-y-5">
              <PricingAndUsage compact />
              <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center justify-between gap-4"><div><div className="font-bold text-white">Spazio locale utilizzato</div><div className="mt-1 text-xs text-slate-500">{formatBytes(storageInfo.usage)} di {formatBytes(storageInfo.quota)} disponibili per asset e preferenze.</div></div><HardDrive className="h-6 w-6 text-cyan-400" /></div>{storageInfo.quota > 0 && <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${Math.min(100, storageInfo.usage / storageInfo.quota * 100)}%` }} /></div>}</div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center gap-2 font-black text-white"><KeyRound className="h-4 w-4 text-purple-400" />Password e accesso</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Invia un collegamento sicuro alla tua email per scegliere una nuova password.</p><button type="button" disabled={!firebaseUser?.email || busyAction === 'security-reset'} onClick={() => void runAccountAction('security-reset', () => resetEmailPassword(firebaseUser!.email!), 'Email di recupero password inviata.')} className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Invia reset password</button></div>
                <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center gap-2 font-black text-white"><Download className="h-4 w-4 text-cyan-400" />Esporta i tuoi dati</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Scarica profilo, preferenze, impostazioni e indice dei progetti in formato JSON.</p><button type="button" disabled={busyAction === 'export'} onClick={() => void exportAccountData()} className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><Download className="h-4 w-4" />Scarica archivio dati</button></div>
              </div>

              <div className="rounded-2xl border border-slate-800 p-5"><div className="font-black text-white">Ripristina preferenze</div><p className="mt-1 text-[11px] text-slate-500">Ripristina audio, privacy e notifiche ai valori consigliati senza eliminare i brani archiviati.</p><button type="button" onClick={() => { if (window.confirm('Ripristinare tutte le preferenze SONARA?')) { setPreferences(DEFAULT_PREFERENCES); showSuccess('Preferenze ripristinate.'); } }} className="mt-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200">Ripristina impostazioni</button></div>

              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5"><div className="flex items-center gap-2 font-black text-rose-200"><Trash2 className="h-4 w-4" />Elimina account</div><p className="mt-2 text-[11px] leading-5 text-rose-200/60">Operazione permanente. Per confermare scrivi <b>ELIMINA SONARA</b>. Firebase può richiedere un nuovo accesso recente.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={deletePhrase} onChange={event => setDeletePhrase(event.target.value)} disabled={!firebaseUser} className={`${inputClass} border-rose-500/30`} placeholder="ELIMINA SONARA" /><button type="button" disabled={!firebaseUser || deletePhrase !== 'ELIMINA SONARA' || busyAction === 'delete'} onClick={() => void deleteAccount()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-30"><Trash2 className="h-4 w-4" />Elimina definitivamente</button></div></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
