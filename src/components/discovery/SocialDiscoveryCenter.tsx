import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CircleUserRound, Globe2, Handshake, Heart, MapPin, MessageCircle, Plus, Radio, RefreshCw, Search, Send, ShieldAlert, Sparkles, Upload, Users } from 'lucide-react';
import { getFirebaseIdToken, getCurrentFirebaseUser } from '../../lib/firebaseClient';
import { Card } from '../core/Card';
import { Button } from '../core/Button';

interface Hub { id: string; name: string; country: string; flag: string; latitude: number; longitude: number; }
interface Profile { uid: string; displayName: string; photoURL: string; bio: string; role: string; genres: string[]; languages: string[]; cityId: string | null; city: string; country: string; flag: string; latitude: number | null; longitude: number | null; discoverable: boolean; online: boolean; }
interface Thread { id: string; name: string; isGroup: boolean; participants: Profile[]; lastMessage: string; updatedAt: string | null; }
interface Message { id: string; senderUid: string; text: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string; createdAt?: string | null; }
interface Collaboration { id: string; ownerUid: string; owner?: Profile | null; title: string; description: string; genre: string; roleWanted: string; language: string; bpm: number; createdAt?: string | null; }
interface Match { profile: Profile; score: number; }
interface Room { id: string; name: string; kind: string; genre: string; ownerUid: string; participantCount: number; participantUids: string[]; }

type Tab = 'world' | 'people' | 'chat' | 'collabs' | 'match' | 'live' | 'trending';
const SOCIAL_REQUEST_TIMEOUT_MS = 12_000;

async function socialFetch(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SOCIAL_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const token = await getFirebaseIdToken();
    const response = await fetch(`/api/social/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `SONARA Social HTTP ${response.status}`);
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Scoperta non ha risposto in tempo. Riprova tra qualche secondo.');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

const ROLES = ['Artist', 'Producer', 'DJ', 'Studio', 'Label', 'Songwriter', 'Vocalist', 'Instrumentalist', 'AI Creator'];
const ROOM_KINDS = ['Studio aperto', 'Listening Session', 'Produzione', 'Remix Session', 'Feedback Room'];

export default function SocialDiscoveryCenter() {
  const [tab, setTab] = useState<Tab>('world');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [collabs, setCollabs] = useState<Collaboration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [error, setError] = useState('');
  const [profileDraft, setProfileDraft] = useState<any>({ displayName: '', bio: '', role: 'Artist', genres: '', languages: '', cityId: '', discoverable: false });
  const [collabDraft, setCollabDraft] = useState<any>({ title: '', description: '', genre: '', roleWanted: '', language: '', bpm: '' });
  const [roomDraft, setRoomDraft] = useState<any>({ name: '', kind: 'Studio aperto', genre: '' });
  const loadedTabsRef = useRef(new Set<Tab>());
  const me = getCurrentFirebaseUser();

  const loadCore = useCallback(async () => {
    setLoadingCore(true);
    setError('');
    try {
      const boot = await socialFetch('bootstrap', { method: 'POST', body: JSON.stringify({ displayName: me?.displayName || '', photoURL: me?.photoURL || '' }) });
      setProfile(boot.profile);
      setHubs(boot.hubs || []);
      setProfileDraft({
        displayName: boot.profile.displayName || '',
        bio: boot.profile.bio || '',
        role: boot.profile.role || 'Artist',
        genres: (boot.profile.genres || []).join(', '),
        languages: (boot.profile.languages || []).join(', '),
        cityId: boot.profile.cityId || '',
        discoverable: Boolean(boot.profile.discoverable)
      });
      setLoadingCore(false);

      const [discovered, dashboard] = await Promise.allSettled([
        socialFetch('discover'),
        socialFetch('dashboard')
      ]);
      if (discovered.status === 'fulfilled') setPeople(discovered.value.profiles || []);
      if (dashboard.status === 'fulfilled') setStats(dashboard.value);
      if (discovered.status === 'rejected' && dashboard.status === 'rejected') {
        setError('I dati della community non sono disponibili in questo momento. La pagina resta utilizzabile.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCore(false);
    }
  }, [me?.displayName, me?.photoURL]);

  const loadTabData = useCallback(async (target: Tab, force = false) => {
    if (target === 'world' || target === 'people' || target === 'trending') return;
    if (!force && loadedTabsRef.current.has(target)) return;
    setLoadingTab(target);
    setError('');
    try {
      if (target === 'chat') {
        const data = await socialFetch('threads');
        setThreads(data.threads || []);
      } else if (target === 'collabs') {
        const data = await socialFetch('collaborations');
        setCollabs(data.collaborations || []);
      } else if (target === 'match') {
        const data = await socialFetch('matches');
        setMatches(data.matches || []);
      } else if (target === 'live') {
        const data = await socialFetch('rooms');
        setRooms(data.rooms || []);
      }
      loadedTabsRef.current.add(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTab(current => current === target ? null : current);
    }
  }, []);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { void loadTabData(tab); }, [loadTabData, tab]);
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') {
        void socialFetch('presence', { method: 'POST', body: '{}' }).catch(() => undefined);
      }
    };
    const firstPingId = window.setTimeout(ping, 2_000);
    const intervalId = window.setInterval(ping, 60_000);
    return () => {
      window.clearTimeout(firstPingId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!selectedThread) return;
    let active = true;
    const refresh = async () => {
      try {
        const data = await socialFetch(`messages?threadId=${encodeURIComponent(selectedThread)}`);
        if (active) setMessages(data.messages || []);
      } catch {}
    };
    void refresh();
    const id = window.setInterval(refresh, 2500);
    return () => { active = false; window.clearInterval(id); };
  }, [selectedThread]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p => [p.displayName, p.role, p.city, p.country, ...(p.genres || [])].join(' ').toLowerCase().includes(q));
  }, [people, search]);

  const saveProfile = async () => {
    setBusy(true); setError('');
    try {
      const payload = await socialFetch('profile', { method: 'POST', body: JSON.stringify({ ...profileDraft, genres: String(profileDraft.genres).split(',').map((v: string) => v.trim()).filter(Boolean), languages: String(profileDraft.languages).split(',').map((v: string) => v.trim()).filter(Boolean), photoURL: me?.photoURL || '' }) });
      setProfile(payload.profile);
      await loadCore();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const openChat = async (uid: string) => {
    setBusy(true); setError('');
    try {
      const data = await socialFetch('thread', { method: 'POST', body: JSON.stringify({ participantUids: [uid] }) });
      setSelectedThread(data.threadId);
      startTransition(() => setTab('chat'));
      await loadTabData('chat', true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!selectedThread || !text) return;
    setMessageText('');
    await socialFetch('message', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, text }) });
    const data = await socialFetch(`messages?threadId=${encodeURIComponent(selectedThread)}`);
    setMessages(data.messages || []);
    await loadTabData('chat', true);
  };

  const uploadAttachment = async (file: File) => {
    if (!selectedThread) return;
    if (file.size > 6 * 1024 * 1024) { setError('Dimensione massima allegato: 6 MB.'); return; }
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file);
    });
    const uploaded = await socialFetch('attachment', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, dataBase64, mimeType: file.type, fileName: file.name }) });
    await socialFetch('message', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, attachmentUrl: uploaded.url, attachmentType: uploaded.mimeType, attachmentName: uploaded.fileName }) });
    const data = await socialFetch(`messages?threadId=${encodeURIComponent(selectedThread)}`);
    setMessages(data.messages || []);
  };

  const createCollab = async () => {
    await socialFetch('collaboration', { method: 'POST', body: JSON.stringify(collabDraft) });
    setCollabDraft({ title: '', description: '', genre: '', roleWanted: '', language: '', bpm: '' });
    await loadTabData('collabs', true);
  };

  const createRoom = async () => {
    await socialFetch('room', { method: 'POST', body: JSON.stringify(roomDraft) });
    setRoomDraft({ name: '', kind: 'Studio aperto', genre: '' });
    await loadTabData('live', true);
  };

  const joinRoom = async (roomId: string) => {
    await socialFetch('room/join', { method: 'POST', body: JSON.stringify({ roomId }) });
    await loadTabData('live', true);
  };

  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: 'world', label: 'Mondo', icon: Globe2 }, { id: 'people', label: 'People', icon: Users }, { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'collabs', label: 'Collaborazioni', icon: Handshake }, { id: 'match', label: 'SONARA Match', icon: Sparkles }, { id: 'live', label: 'Live', icon: Radio }, { id: 'trending', label: 'Trending', icon: Bell }
  ];

  return (
    <div className="space-y-5" aria-busy={loadingCore || loadingTab !== null}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Globe2 className="h-4 w-4" />SONARA Social Discovery</div>
            <h2 className="mt-1 text-2xl font-black text-white">Scopri, parla e collabora con creator reali</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Profili opt-in, posizione solo a livello città, chat reale, collaborazioni, matching musicale e stanze LIVE.</p>
            {loadingCore && <div className="mt-3 flex items-center gap-2 text-xs font-bold text-cyan-300"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Connessione alla community...</div>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Creator" value={stats?.stats?.discoverableCreators ?? 0} />
            <Stat label="Online" value={stats?.stats?.onlineCreators ?? 0} />
            <Stat label="Collab" value={stats?.stats?.openCollaborations ?? 0} />
            <Stat label="Live" value={stats?.stats?.activeRooms ?? 0} />
          </div>
        </div>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(item => { const Icon = item.icon; const isLoading = loadingTab === item.id; return <button key={item.id} type="button" onClick={() => startTransition(() => setTab(item.id))} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${tab === item.id ? 'border-purple-400/40 bg-purple-500/15 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'}`} aria-pressed={tab === item.id}>{isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{item.label}</button>; })}
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>}

      {tab === 'world' && <WorldTab profile={profile} draft={profileDraft} setDraft={setProfileDraft} hubs={hubs} people={people} busy={busy} onSave={saveProfile} onChat={openChat} />}
      {tab === 'people' && <PeopleTab people={filteredPeople} search={search} setSearch={setSearch} onChat={openChat} onFollow={async uid => { await socialFetch('follow', { method: 'POST', body: JSON.stringify({ targetUid: uid }) }); }} onBlock={async uid => { await socialFetch('block', { method: 'POST', body: JSON.stringify({ targetUid: uid }) }); await loadCore(); }} />}
      {tab === 'chat' && <ChatTab threads={threads} selectedThread={selectedThread} setSelectedThread={setSelectedThread} messages={messages} meUid={me?.uid || ''} text={messageText} setText={setMessageText} onSend={sendMessage} onUpload={uploadAttachment} />}
      {tab === 'collabs' && <CollabTab collabs={collabs} draft={collabDraft} setDraft={setCollabDraft} onCreate={createCollab} onChat={openChat} />}
      {tab === 'match' && <MatchTab matches={matches} onChat={openChat} />}
      {tab === 'live' && <LiveTab rooms={rooms} draft={roomDraft} setDraft={setRoomDraft} onCreate={createRoom} onJoin={joinRoom} />}
      {tab === 'trending' && <TrendingTab stats={stats} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-center"><div className="text-lg font-black text-white">{value}</div><div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div></div>; }

function WorldTab({ profile, draft, setDraft, hubs, people, busy, onSave, onChat }: any) {
  return <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-black text-white"><CircleUserRound className="h-5 w-5 text-purple-400" />Il tuo profilo pubblico</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">La visibilità è volontaria. SONARA pubblica solo la città scelta, mai coordinate GPS precise del dispositivo.</p>
      <div className="mt-4 space-y-3">
        <input value={draft.displayName} onChange={e => setDraft((v:any)=>({ ...v, displayName:e.target.value }))} placeholder="Nome artista" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm" />
        <textarea value={draft.bio} onChange={e => setDraft((v:any)=>({ ...v, bio:e.target.value }))} placeholder="Bio musicale" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm" rows={3} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={draft.role} onChange={e => setDraft((v:any)=>({ ...v, role:e.target.value }))} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">{ROLES.map(r => <option key={r}>{r}</option>)}</select>
          <select value={draft.cityId} onChange={e => setDraft((v:any)=>({ ...v, cityId:e.target.value }))} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><option value="">Seleziona città</option>{hubs.map((h:Hub)=><option key={h.id} value={h.id}>{h.flag} {h.name} · {h.country}</option>)}</select>
        </div>
        <input value={draft.genres} onChange={e => setDraft((v:any)=>({ ...v, genres:e.target.value }))} placeholder="Generi, separati da virgola" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm" />
        <input value={draft.languages} onChange={e => setDraft((v:any)=>({ ...v, languages:e.target.value }))} placeholder="Lingue, separate da virgola" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm" />
        <label className="flex items-center gap-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3 text-xs text-cyan-200"><input type="checkbox" checked={draft.discoverable} onChange={e => setDraft((v:any)=>({ ...v, discoverable:e.target.checked }))} />Rendimi visibile in Scoperta</label>
        <Button onClick={onSave} disabled={busy}>Salva profilo pubblico</Button>
      </div>
    </Card>
    <Card className="overflow-hidden">
      <div className="border-b border-white/5 p-5"><div className="flex items-center gap-2 font-black text-white"><Globe2 className="h-5 w-5 text-cyan-400" />Mappa creator reali</div><p className="mt-1 text-xs text-slate-500">Ogni punto deriva da un profilo SONARA che ha scelto di essere visibile.</p></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {people.length === 0 ? <div className="col-span-full rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Nessun creator reale ha ancora attivato la visibilità. Non mostriamo profili demo.</div> : people.map((p:Profile)=><ProfileCard key={p.uid} p={p} onChat={onChat} />)}
      </div>
    </Card>
  </div>;
}

function ProfileCard({ p, onChat }: { p: Profile; onChat: (uid:string)=>void }) { return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4" style={{ contentVisibility: 'auto', containIntrinsicSize: '180px' }}><div className="flex items-center gap-3"><div className="relative"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-purple-500/15">{p.photoURL ? <img src={p.photoURL} alt={`Profilo di ${p.displayName}`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <CircleUserRound className="h-6 w-6 text-purple-300" />}</div>{p.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />}</div><div className="min-w-0"><div className="truncate font-bold text-white">{p.displayName}</div><div className="text-[10px] text-slate-500">{p.flag} {p.city} · {p.role}</div></div></div><div className="mt-3 flex flex-wrap gap-1">{(p.genres||[]).slice(0,4).map(g=><span key={g} className="rounded-full bg-purple-500/10 px-2 py-1 text-[9px] text-purple-300">{g}</span>)}</div><button onClick={()=>onChat(p.uid)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-300"><MessageCircle className="h-4 w-4" />Messaggio</button></div>; }

function PeopleTab({ people, search, setSearch, onChat, onFollow, onBlock }: any) { return <Card className="p-5"><div className="relative mb-4"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca creator, città, genere, ruolo..." className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-3 text-sm" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{people.map((p:Profile)=><div key={p.uid} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><ProfileCard p={p} onChat={onChat}/><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={()=>onFollow(p.uid)} className="rounded-lg border border-rose-500/20 px-3 py-2 text-xs text-rose-300"><Heart className="mr-1 inline h-3.5 w-3.5"/>Segui</button><button onClick={()=>onBlock(p.uid)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400"><ShieldAlert className="mr-1 inline h-3.5 w-3.5"/>Blocca</button></div></div>)}</div></Card>; }

function ChatTab({ threads, selectedThread, setSelectedThread, messages, meUid, text, setText, onSend, onUpload }: any) { return <div className="grid min-h-[600px] gap-4 lg:grid-cols-[320px_1fr]"><Card className="p-3"><div className="mb-3 px-2 text-sm font-black text-white">Conversazioni</div><div className="space-y-1">{threads.length===0?<div className="p-4 text-xs text-slate-500">Apri il profilo di un creator e premi Messaggio.</div>:threads.map((t:Thread)=><button key={t.id} onClick={()=>setSelectedThread(t.id)} className={`w-full rounded-xl p-3 text-left ${selectedThread===t.id?'bg-purple-500/15':'hover:bg-white/5'}`}><div className="truncate text-sm font-bold text-white">{t.name}</div><div className="mt-1 truncate text-[10px] text-slate-500">{t.lastMessage||'Nuova conversazione'}</div></button>)}</div></Card><Card className="flex min-h-[600px] flex-col overflow-hidden"><div className="border-b border-white/5 p-4 font-black text-white">Chat SONARA</div><div className="flex-1 space-y-2 overflow-y-auto p-4">{!selectedThread?<div className="flex h-full items-center justify-center text-sm text-slate-500">Seleziona una conversazione</div>:messages.map((m:Message)=><div key={m.id} className={`flex ${m.senderUid===meUid?'justify-end':'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.senderUid===meUid?'bg-purple-600 text-white':'bg-slate-900 text-slate-200'}`}>{m.text&&<div>{m.text}</div>}{m.attachmentUrl&&<a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">{m.attachmentName||'Allegato'}</a>}</div></div>)}</div>{selectedThread&&<div className="flex gap-2 border-t border-white/5 p-3"><label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-700 bg-slate-950"><Upload className="h-4 w-4"/><input type="file" accept="image/*,audio/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) void onUpload(f); e.currentTarget.value='';}}/></label><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void onSend();}} placeholder="Scrivi un messaggio..." className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm"/><button onClick={()=>void onSend()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600"><Send className="h-4 w-4"/></button></div>}</Card></div>; }

function CollabTab({ collabs, draft, setDraft, onCreate, onChat }: any) { return <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><Card className="p-5"><div className="font-black text-white">Pubblica “Cerco collaborazione”</div><div className="mt-4 space-y-3"><input value={draft.title} onChange={e=>setDraft((v:any)=>({...v,title:e.target.value}))} placeholder="Es. Cerco vocalist Pop" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><textarea value={draft.description} onChange={e=>setDraft((v:any)=>({...v,description:e.target.value}))} placeholder="Descrizione" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><input value={draft.genre} onChange={e=>setDraft((v:any)=>({...v,genre:e.target.value}))} placeholder="Genere" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><input value={draft.roleWanted} onChange={e=>setDraft((v:any)=>({...v,roleWanted:e.target.value}))} placeholder="Ruolo cercato" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><div className="grid grid-cols-2 gap-2"><input value={draft.language} onChange={e=>setDraft((v:any)=>({...v,language:e.target.value}))} placeholder="Lingua" className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><input value={draft.bpm} onChange={e=>setDraft((v:any)=>({...v,bpm:e.target.value}))} placeholder="BPM" className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/></div><Button onClick={()=>void onCreate()}><Plus className="mr-2 h-4 w-4"/>Pubblica richiesta</Button></div></Card><Card className="p-5"><div className="grid gap-3 md:grid-cols-2">{collabs.map((c:Collaboration)=><div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="font-bold text-white">{c.title}</div><div className="mt-1 text-[10px] text-slate-500">{c.owner?.displayName||'Creator SONARA'} · {c.genre||'Genere aperto'} · {c.bpm?`${c.bpm} BPM`:''}</div><p className="mt-2 text-xs leading-5 text-slate-400">{c.description}</p>{c.ownerUid&&<button onClick={()=>onChat(c.ownerUid)} className="mt-3 rounded-lg border border-cyan-500/20 px-3 py-2 text-xs text-cyan-300">Contatta</button>}</div>)}</div></Card></div>; }

function MatchTab({ matches, onChat }: any) { return <Card className="p-5"><div className="mb-4"><div className="flex items-center gap-2 font-black text-white"><Sparkles className="h-5 w-5 text-fuchsia-400"/>SONARA Match</div><p className="mt-1 text-xs text-slate-500">Compatibilità calcolata su generi, ruolo, lingue e hub scelto.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{matches.map((m:Match)=><div key={m.profile.uid} className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-4"><div className="text-2xl font-black text-purple-300">{m.score}%</div><div className="mt-1 font-bold text-white">{m.profile.displayName}</div><div className="text-[10px] text-slate-500">{m.profile.role} · {m.profile.flag} {m.profile.city}</div><button onClick={()=>onChat(m.profile.uid)} className="mt-3 w-full rounded-lg border border-purple-500/20 px-3 py-2 text-xs text-purple-200">Avvia collaborazione</button></div>)}</div></Card>; }

function LiveTab({ rooms, draft, setDraft, onCreate, onJoin }: any) { return <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><Card className="p-5"><div className="font-black text-white">Apri una stanza LIVE</div><div className="mt-4 space-y-3"><input value={draft.name} onChange={e=>setDraft((v:any)=>({...v,name:e.target.value}))} placeholder="Nome stanza" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><select value={draft.kind} onChange={e=>setDraft((v:any)=>({...v,kind:e.target.value}))} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">{ROOM_KINDS.map(k=><option key={k}>{k}</option>)}</select><input value={draft.genre} onChange={e=>setDraft((v:any)=>({...v,genre:e.target.value}))} placeholder="Genere" className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"/><Button onClick={()=>void onCreate()}><Radio className="mr-2 h-4 w-4"/>Apri stanza</Button></div></Card><Card className="p-5"><div className="grid gap-3 md:grid-cols-2">{rooms.map((r:Room)=><div key={r.id} className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4"><div className="flex items-center justify-between"><div className="font-bold text-white">{r.name}</div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-300">LIVE</span></div><div className="mt-1 text-[10px] text-slate-500">{r.kind} · {r.genre||'Multi-genere'} · {r.participantCount} partecipanti</div><button onClick={()=>void onJoin(r.id)} className="mt-3 rounded-lg border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">Entra</button></div>)}</div></Card></div>; }

function TrendingTab({ stats }: any) { return <div className="grid gap-5 md:grid-cols-2"><Card className="p-5"><div className="font-black text-white">Generi in Scoperta</div><div className="mt-3 space-y-2">{(stats?.topGenres||[]).map((x:any)=><div key={x.name} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"><span>{x.name}</span><b>{x.count}</b></div>)}</div></Card><Card className="p-5"><div className="font-black text-white">Hub più attivi</div><div className="mt-3 space-y-2">{(stats?.topCities||[]).map((x:any)=><div key={x.name} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"><span><MapPin className="mr-2 inline h-3.5 w-3.5 text-cyan-400"/>{x.name}</span><b>{x.count}</b></div>)}</div></Card></div>; }
