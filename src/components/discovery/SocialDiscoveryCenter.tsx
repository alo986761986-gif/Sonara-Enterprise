import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Check, CircleUserRound, Globe2, Handshake, Heart, Loader2, MapPin,
  MessageCircle, MoreHorizontal, Paperclip, Plus, Radio, RefreshCw, Search,
  Send, ShieldAlert, Sparkles, Users, Wifi, WifiOff, X
} from 'lucide-react';
import { watchFirebaseUser } from '../../lib/firebaseClient';
import {
  Collaboration, DashboardData, Hub, Match, Message, Profile, Room, Thread,
  formatSocialTime, socialFetch
} from './socialApi';

type Tab = 'world' | 'people' | 'chat' | 'collabs' | 'match' | 'live' | 'trending';
type Toast = { tone: 'ok' | 'error'; text: string } | null;

const ROLES = ['Artist', 'Producer', 'DJ', 'Studio', 'Label', 'Songwriter', 'Vocalist', 'Instrumentalist', 'AI Creator'];
const ROOM_KINDS = ['Studio aperto', 'Listening Session', 'Produzione', 'Remix Session', 'Feedback Room'];
const field = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10';
const panel = 'rounded-2xl border border-white/[0.07] bg-[#0a0e16]/90 shadow-xl shadow-black/20';

export default function SocialDiscoveryCenter() {
  const [tab, setTab] = useState<Tab>('world');
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [collabs, setCollabs] = useState<Collaboration[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [roomText, setRoomText] = useState('');
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [profileDraft, setProfileDraft] = useState<any>({ displayName: '', bio: '', role: 'Artist', genres: '', languages: '', cityId: '', discoverable: false });
  const [collabDraft, setCollabDraft] = useState<any>({ title: '', description: '', genre: '', roleWanted: '', language: '', bpm: '' });
  const [roomDraft, setRoomDraft] = useState<any>({ name: '', kind: 'Studio aperto', genre: '' });
  const endRef = useRef<HTMLDivElement | null>(null);
  const roomEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => watchFirebaseUser(user => { setMe(user); setAuthReady(true); }), []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(id); }, [toast]);

  const fail = useCallback((error: unknown) => setToast({ tone: 'error', text: error instanceof Error ? error.message : String(error) }), []);
  const ok = useCallback((text: string) => setToast({ tone: 'ok', text }), []);

  const bootstrap = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const boot = await socialFetch<{ profile: Profile; hubs: Hub[] }>('bootstrap', { method: 'POST', body: JSON.stringify({ displayName: me.displayName || '', photoURL: me.photoURL || '' }) });
      setProfile(boot.profile); setHubs(boot.hubs || []);
      setProfileDraft({ displayName: boot.profile.displayName || '', bio: boot.profile.bio || '', role: boot.profile.role || 'Artist', genres: (boot.profile.genres || []).join(', '), languages: (boot.profile.languages || []).join(', '), cityId: boot.profile.cityId || '', discoverable: Boolean(boot.profile.discoverable) });
      const [discoverResult, dashResult] = await Promise.allSettled([
        socialFetch<{ profiles: Profile[] }>('discover'), socialFetch<DashboardData>('dashboard')
      ]);
      if (discoverResult.status === 'fulfilled') setPeople(discoverResult.value.profiles || []);
      if (dashResult.status === 'fulfilled') setStats(dashResult.value);
      if (discoverResult.status === 'rejected' && dashResult.status === 'rejected') fail(discoverResult.reason);
    } catch (error) { fail(error); }
    finally { setLoading(false); }
  }, [me, fail]);

  useEffect(() => { if (authReady && me) void bootstrap(); else if (authReady) setLoading(false); }, [authReady, me, bootstrap]);

  const loadThreads = useCallback(async () => {
    const data = await socialFetch<{ threads: Thread[] }>('threads');
    setThreads(data.threads || []);
    setSelectedThread(current => current || data.threads?.[0]?.id || '');
  }, []);
  const loadCollabs = useCallback(async () => setCollabs((await socialFetch<{ collaborations: Collaboration[] }>('collaborations')).collaborations || []), []);
  const loadMatches = useCallback(async () => setMatches((await socialFetch<{ matches: Match[] }>('matches')).matches || []), []);
  const loadRooms = useCallback(async () => setRooms((await socialFetch<{ rooms: Room[] }>('rooms')).rooms || []), []);

  useEffect(() => {
    if (!me) return;
    const run = async () => {
      try {
        if (tab === 'chat') await loadThreads();
        if (tab === 'collabs') await loadCollabs();
        if (tab === 'match') await loadMatches();
        if (tab === 'live') await loadRooms();
      } catch (error) { fail(error); }
    };
    void run();
  }, [tab, me, loadThreads, loadCollabs, loadMatches, loadRooms, fail]);

  useEffect(() => {
    if (!selectedThread || !me) { setMessages([]); return; }
    let active = true;
    const refresh = async () => {
      try {
        const data = await socialFetch<{ messages: Message[] }>(`messages?threadId=${encodeURIComponent(selectedThread)}`);
        if (active) setMessages(data.messages || []);
      } catch (error) { if (active) fail(error); }
    };
    void refresh();
    const id = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(id); };
  }, [selectedThread, me, fail]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, selectedThread]);

  useEffect(() => {
    if (!selectedRoom || !me) { setRoomMessages([]); return; }
    let active = true;
    const refresh = async () => {
      try {
        const data = await socialFetch<{ messages: Message[] }>(`room/messages?roomId=${encodeURIComponent(selectedRoom)}`);
        if (active) setRoomMessages(data.messages || []);
      } catch { /* room may not be joined yet */ }
    };
    void refresh(); const id = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(id); };
  }, [selectedRoom, me]);
  useEffect(() => { roomEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [roomMessages.length]);

  useEffect(() => {
    if (!me) return;
    const ping = () => { if (document.visibilityState === 'visible') void socialFetch('presence', { method: 'POST', body: '{}' }).catch(() => undefined); };
    ping(); const id = window.setInterval(ping, 60_000); return () => window.clearInterval(id);
  }, [me]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return people;
    return people.filter(p => [p.displayName, p.role, p.city, p.country, ...(p.genres || [])].join(' ').toLowerCase().includes(q));
  }, [people, search]);
  const selectedThreadData = threads.find(t => t.id === selectedThread);
  const selectedRoomData = rooms.find(r => r.id === selectedRoom);

  const perform = async (key: string, fn: () => Promise<void>) => {
    if (working) return; setWorking(key);
    try { await fn(); } catch (error) { fail(error); } finally { setWorking(''); }
  };

  const saveProfile = () => perform('profile', async () => {
    const payload = await socialFetch<{ profile: Profile }>('profile', { method: 'POST', body: JSON.stringify({ ...profileDraft, genres: String(profileDraft.genres).split(',').map(v => v.trim()).filter(Boolean), languages: String(profileDraft.languages).split(',').map(v => v.trim()).filter(Boolean), photoURL: me?.photoURL || '' }) });
    setProfile(payload.profile); ok('Profilo Scoperta aggiornato.'); await bootstrap();
  });

  const openChat = (uid: string) => perform(`chat-${uid}`, async () => {
    const data = await socialFetch<{ threadId: string }>('thread', { method: 'POST', body: JSON.stringify({ participantUids: [uid] }) });
    await loadThreads(); setSelectedThread(data.threadId); setTab('chat');
  });

  const sendMessage = () => perform('send-message', async () => {
    const text = messageText.trim(); if (!selectedThread || !text) return;
    const optimistic: Message = { id: `local-${Date.now()}`, senderUid: me?.uid || '', text, createdAt: new Date().toISOString(), optimistic: true };
    setMessageText(''); setMessages(current => [...current, optimistic]);
    try {
      await socialFetch('message', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, text }) });
      const data = await socialFetch<{ messages: Message[] }>(`messages?threadId=${encodeURIComponent(selectedThread)}`); setMessages(data.messages || []); await loadThreads();
    } catch (error) { setMessages(current => current.filter(m => m.id !== optimistic.id)); setMessageText(text); throw error; }
  });

  const uploadAttachment = (file: File) => perform('attachment', async () => {
    if (!selectedThread) return; if (file.size > 6 * 1024 * 1024) throw new Error('Dimensione massima allegato: 6 MB.');
    const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file); });
    const uploaded = await socialFetch<any>('attachment', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, dataBase64, mimeType: file.type, fileName: file.name }) });
    await socialFetch('message', { method: 'POST', body: JSON.stringify({ threadId: selectedThread, attachmentUrl: uploaded.url, attachmentType: uploaded.mimeType, attachmentName: uploaded.fileName }) });
    const data = await socialFetch<{ messages: Message[] }>(`messages?threadId=${encodeURIComponent(selectedThread)}`); setMessages(data.messages || []); await loadThreads();
  });

  const createCollab = () => perform('collab', async () => { await socialFetch('collaboration', { method: 'POST', body: JSON.stringify(collabDraft) }); setCollabDraft({ title: '', description: '', genre: '', roleWanted: '', language: '', bpm: '' }); await loadCollabs(); ok('Richiesta di collaborazione pubblicata.'); });
  const createRoom = () => perform('room-create', async () => { const data = await socialFetch<{ roomId: string }>('room', { method: 'POST', body: JSON.stringify(roomDraft) }); setRoomDraft({ name: '', kind: 'Studio aperto', genre: '' }); await loadRooms(); setSelectedRoom(data.roomId); ok('Stanza LIVE aperta.'); });
  const joinRoom = (roomId: string) => perform(`join-${roomId}`, async () => { await socialFetch('room/join', { method: 'POST', body: JSON.stringify({ roomId }) }); await loadRooms(); setSelectedRoom(roomId); ok('Sei entrato nella stanza LIVE.'); });
  const sendRoomMessage = () => perform('room-send', async () => { const text = roomText.trim(); if (!selectedRoom || !text) return; setRoomText(''); await socialFetch('room/message', { method: 'POST', body: JSON.stringify({ roomId: selectedRoom, text }) }); const data = await socialFetch<{ messages: Message[] }>(`room/messages?roomId=${encodeURIComponent(selectedRoom)}`); setRoomMessages(data.messages || []); });

  const follow = (uid: string) => perform(`follow-${uid}`, async () => { const data = await socialFetch<{ following: boolean }>('follow', { method: 'POST', body: JSON.stringify({ targetUid: uid }) }); ok(data.following ? 'Creator seguito.' : 'Creator rimosso dai seguiti.'); });
  const block = (uid: string) => perform(`block-${uid}`, async () => { await socialFetch('block', { method: 'POST', body: JSON.stringify({ targetUid: uid }) }); setPeople(current => current.filter(p => p.uid !== uid)); ok('Creator bloccato.'); });

  if (!authReady || loading) return <LoadingScreen />;
  if (!me) return <LoginRequired />;

  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: 'world', label: 'Scoperta', icon: Globe2 }, { id: 'people', label: 'Creator', icon: Users }, { id: 'chat', label: 'Messaggi', icon: MessageCircle },
    { id: 'collabs', label: 'Collaborazioni', icon: Handshake }, { id: 'match', label: 'Match', icon: Sparkles }, { id: 'live', label: 'Live', icon: Radio }, { id: 'trending', label: 'Trend', icon: Bell }
  ];

  return <div className="space-y-4 pb-8 text-slate-100">
    {toast && <ToastBar toast={toast} onClose={() => setToast(null)} />}

    <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.10),transparent_35%),radial-gradient(circle_at_left,rgba(168,85,247,.09),transparent_35%),#070b12] p-5 shadow-2xl sm:p-7">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-cyan-300"><Globe2 className="h-4 w-4"/> SONARA DISCOVERY</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Community musicale professionale</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Scopri creator reali, conversa in privato, trova collaborazioni e lavora nelle stanze LIVE con un unico profilo SONARA.</p></div>
        <div className="grid grid-cols-4 gap-2"><Metric value={stats?.stats?.discoverableCreators || 0} label="Creator"/><Metric value={stats?.stats?.onlineCreators || 0} label="Online"/><Metric value={stats?.stats?.openCollaborations || 0} label="Collab"/><Metric value={stats?.stats?.activeRooms || 0} label="Live"/></div>
      </div>
    </section>

    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#080c13] p-1.5">
      {tabs.map(item => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${active ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:bg-white/[0.05] hover:text-white'}`}><Icon className="h-4 w-4"/>{item.label}{item.id === 'chat' && threads.length > 0 && <span className={`rounded-full px-1.5 text-[9px] ${active ? 'bg-slate-900 text-white' : 'bg-cyan-500/10 text-cyan-300'}`}>{threads.length}</span>}</button>; })}
    </nav>

    {tab === 'world' && <World profile={profile} draft={profileDraft} setDraft={setProfileDraft} hubs={hubs} people={people.slice(0, 6)} onSave={saveProfile} onChat={openChat} working={working}/>}
    {tab === 'people' && <People people={filteredPeople} search={search} setSearch={setSearch} onChat={openChat} onFollow={follow} onBlock={block} working={working}/>}
    {tab === 'chat' && <Chat threads={threads} selected={selectedThread} setSelected={setSelectedThread} thread={selectedThreadData} messages={messages} meUid={me.uid} text={messageText} setText={setMessageText} onSend={sendMessage} onUpload={uploadAttachment} working={working} endRef={endRef}/>}
    {tab === 'collabs' && <Collabs items={collabs} draft={collabDraft} setDraft={setCollabDraft} onCreate={createCollab} onChat={openChat} working={working}/>}
    {tab === 'match' && <Matches items={matches} onChat={openChat} working={working}/>}
    {tab === 'live' && <Live rooms={rooms} selected={selectedRoom} setSelected={setSelectedRoom} room={selectedRoomData} messages={roomMessages} meUid={me.uid} text={roomText} setText={setRoomText} draft={roomDraft} setDraft={setRoomDraft} onCreate={createRoom} onJoin={joinRoom} onSend={sendRoomMessage} working={working} endRef={roomEndRef}/>}
    {tab === 'trending' && <Trending stats={stats}/>}
  </div>;
}

function LoadingScreen() { return <div className={`${panel} flex min-h-[420px] flex-col items-center justify-center p-8 text-center`}><Loader2 className="h-8 w-8 animate-spin text-cyan-300"/><div className="mt-4 text-sm font-black text-white">Connessione a SONARA Discovery</div><div className="mt-1 text-xs text-slate-500">Sincronizzazione profilo, community e messaggi...</div></div>; }
function LoginRequired() { return <div className={`${panel} flex min-h-[420px] flex-col items-center justify-center p-8 text-center`}><WifiOff className="h-8 w-8 text-slate-600"/><div className="mt-4 text-lg font-black text-white">Accedi per usare Scoperta</div><div className="mt-2 max-w-md text-sm text-slate-500">Messaggi, profili, collaborazioni e stanze LIVE sono collegati al tuo account SONARA.</div></div>; }
function ToastBar({ toast, onClose }: { toast: NonNullable<Toast>; onClose: () => void }) { return <div className={`fixed right-5 top-5 z-[2147483000] flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${toast.tone === 'ok' ? 'border-emerald-400/25 bg-emerald-950/90 text-emerald-100' : 'border-rose-400/25 bg-rose-950/90 text-rose-100'}`}>{toast.tone === 'ok' ? <Check className="h-4 w-4"/> : <ShieldAlert className="h-4 w-4"/>}<span className="text-xs font-bold">{toast.text}</span><button onClick={onClose}><X className="h-4 w-4 opacity-60"/></button></div>; }
function Metric({ value, label }: { value: number; label: string }) { return <div className="min-w-[70px] rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-center"><div className="text-lg font-black text-white">{value}</div><div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</div></div>; }
function Spinner({ show }: { show: boolean }) { return show ? <Loader2 className="h-4 w-4 animate-spin"/> : null; }

function Avatar({ p, size = 'md' }: { p?: Profile | null; size?: 'sm' | 'md' | 'lg' }) { const cls = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'; return <div className="relative shrink-0"><div className={`${cls} flex items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]`}>{p?.photoURL ? <img src={p.photoURL} alt={p.displayName} className="h-full w-full object-cover"/> : <CircleUserRound className="h-1/2 w-1/2 text-slate-500"/>}</div>{p?.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#090d14] bg-emerald-400"/>}</div>; }
function PersonCard({ p, onChat, onFollow, onBlock, working }: any) { return <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.035]"><div className="flex items-center gap-3"><Avatar p={p}/><div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-white">{p.displayName}</div><div className="mt-0.5 truncate text-[10px] text-slate-500">{p.role} · {p.flag} {p.city || p.country}</div></div>{p.online && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">ONLINE</span>}</div>{p.bio && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{p.bio}</p>}<div className="mt-3 flex min-h-6 flex-wrap gap-1">{(p.genres || []).slice(0, 4).map((g:string)=><span key={g} className="rounded-full border border-purple-400/10 bg-purple-500/[0.07] px-2 py-1 text-[9px] text-purple-200">{g}</span>)}</div><div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2"><button onClick={() => onChat(p.uid)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-slate-950"><Spinner show={working===`chat-${p.uid}`}/><MessageCircle className="h-3.5 w-3.5"/>Messaggio</button>{onFollow && <button title="Segui" onClick={() => onFollow(p.uid)} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:text-rose-300"><Heart className="h-4 w-4"/></button>}{onBlock && <button title="Blocca" onClick={() => onBlock(p.uid)} className="rounded-xl border border-white/10 p-2 text-slate-500 hover:text-rose-300"><MoreHorizontal className="h-4 w-4"/></button>}</div></article>; }

function World({ draft, setDraft, hubs, people, onSave, onChat, working }: any) { return <div className="grid gap-4 xl:grid-cols-[390px_1fr]"><section className={`${panel} p-5`}><div className="flex items-center gap-3"><CircleUserRound className="h-5 w-5 text-cyan-300"/><div><h2 className="text-sm font-black text-white">Profilo pubblico</h2><p className="text-[10px] text-slate-500">Controlla come appari nella community.</p></div></div><div className="mt-5 space-y-3"><input className={field} value={draft.displayName} onChange={e=>setDraft((v:any)=>({...v,displayName:e.target.value}))} placeholder="Nome artista"/><textarea className={field} rows={3} value={draft.bio} onChange={e=>setDraft((v:any)=>({...v,bio:e.target.value}))} placeholder="Bio musicale professionale"/><div className="grid grid-cols-2 gap-2"><select className={field} value={draft.role} onChange={e=>setDraft((v:any)=>({...v,role:e.target.value}))}>{ROLES.map(r=><option key={r}>{r}</option>)}</select><select className={field} value={draft.cityId} onChange={e=>setDraft((v:any)=>({...v,cityId:e.target.value}))}><option value="">Città</option>{hubs.map((h:Hub)=><option key={h.id} value={h.id}>{h.flag} {h.name}</option>)}</select></div><input className={field} value={draft.genres} onChange={e=>setDraft((v:any)=>({...v,genres:e.target.value}))} placeholder="Generi: House, Techno, Pop..."/><input className={field} value={draft.languages} onChange={e=>setDraft((v:any)=>({...v,languages:e.target.value}))} placeholder="Lingue: Italiano, English..."/><label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"><span><span className="block text-xs font-bold text-white">Visibile in Scoperta</span><span className="text-[9px] text-slate-600">Solo città, mai posizione GPS precisa.</span></span><input type="checkbox" checked={draft.discoverable} onChange={e=>setDraft((v:any)=>({...v,discoverable:e.target.checked}))} className="h-4 w-4 accent-cyan-400"/></label><button onClick={onSave} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950"><Spinner show={working==='profile'}/>Salva profilo</button></div></section><section className={`${panel} p-5`}><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-white">Creator consigliati</h2><p className="mt-1 text-[10px] text-slate-500">Profili reali che hanno attivato la visibilità.</p></div><Wifi className="h-4 w-4 text-emerald-300"/></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{people.length ? people.map((p:Profile)=><PersonCard key={p.uid} p={p} onChat={onChat} working={working}/>) : <Empty title="La community è pronta" text="Quando altri creator attivano la visibilità appariranno qui."/>}</div></section></div>; }

function People({ people, search, setSearch, onChat, onFollow, onBlock, working }: any) { return <section className={`${panel} p-4 sm:p-5`}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-black text-white">Directory creator</h2><p className="mt-1 text-[10px] text-slate-500">Cerca per nome, ruolo, città o genere musicale.</p></div><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-600"/><input className={`${field} pl-9`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca nella community..."/></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{people.length ? people.map((p:Profile)=><PersonCard key={p.uid} p={p} onChat={onChat} onFollow={onFollow} onBlock={onBlock} working={working}/>) : <Empty title="Nessun risultato" text="Prova un altro nome, ruolo, città o genere."/>}</div></section>; }

function Chat({ threads, selected, setSelected, thread, messages, meUid, text, setText, onSend, onUpload, working, endRef }: any) { return <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#080c13] lg:grid-cols-[340px_1fr]"><aside className="border-b border-white/[0.06] bg-black/15 lg:border-b-0 lg:border-r"><div className="border-b border-white/[0.06] p-4"><div className="text-sm font-black text-white">Messaggi</div><div className="mt-1 text-[10px] text-slate-600">{threads.length} conversazioni</div></div><div className="max-h-[250px] overflow-y-auto p-2 lg:max-h-[610px]">{threads.length ? threads.map((t:Thread)=>{const p=t.participants?.[0]; return <button key={t.id} onClick={()=>setSelected(t.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selected===t.id?'bg-white/[0.08]':'hover:bg-white/[0.035]'}`}><Avatar p={p} size="sm"/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-white">{t.name}</span><span className="shrink-0 text-[8px] text-slate-600">{formatSocialTime(t.updatedAt)}</span></div><div className="mt-1 truncate text-[10px] text-slate-500">{t.lastMessage || 'Nuova conversazione'}</div></div></button>}) : <Empty title="Nessuna conversazione" text="Apri un profilo creator e premi Messaggio." compact/>}</div></aside><main className="flex min-h-[500px] flex-col"><header className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-4">{thread ? <><Avatar p={thread.participants?.[0]} size="sm"/><div><div className="text-sm font-black text-white">{thread.name}</div><div className="text-[9px] text-slate-600">{thread.participants?.[0]?.online ? 'Online adesso' : 'Conversazione privata SONARA'}</div></div></> : <span className="text-sm text-slate-600">Seleziona una conversazione</span>}</header><div className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(255,255,255,.018),transparent_65%)] p-4 sm:p-6">{selected && messages.length===0 && <Empty title="Inizia la conversazione" text="Scrivi il primo messaggio." compact/>}{messages.map((m:Message)=><MessageBubble key={m.id} message={m} mine={m.senderUid===meUid}/>) }<div ref={endRef}/></div>{selected && <div className="border-t border-white/[0.06] p-3"><div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-2"><label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/[0.05] hover:text-white"><Spinner show={working==='attachment'}/>{working!=='attachment'&&<Paperclip className="h-4 w-4"/>}<input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,audio/*" onChange={e=>{const f=e.currentTarget.files?.[0]; if(f) onUpload(f); e.currentTarget.value='';}}/></label><textarea rows={1} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSend();}}} placeholder="Scrivi un messaggio..." className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"/><button disabled={!text.trim()||working==='send-message'} onClick={onSend} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950 disabled:opacity-30"><Spinner show={working==='send-message'}/>{working!=='send-message'&&<Send className="h-4 w-4"/>}</button></div></div>}</main></div>; }
function MessageBubble({ message, mine }: { message: Message; mine: boolean }) { return <div className={`flex ${mine?'justify-end':'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine?'rounded-br-md bg-white text-slate-950':'rounded-bl-md border border-white/[0.07] bg-[#111722] text-slate-200'} ${message.optimistic?'opacity-65':''}`}>{message.text && <div className="whitespace-pre-wrap break-words leading-5">{message.text}</div>}{message.attachmentUrl && <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className={`mt-1.5 block text-xs font-bold underline ${mine?'text-slate-700':'text-cyan-300'}`}>{message.attachmentName || 'Apri allegato'}</a>}<div className={`mt-1 text-right text-[8px] ${mine?'text-slate-500':'text-slate-600'}`}>{message.optimistic?'invio...':formatSocialTime(message.createdAt)}</div></div></div>; }

function Collabs({ items, draft, setDraft, onCreate, onChat, working }: any) { return <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><section className={`${panel} p-5`}><h2 className="text-sm font-black text-white">Nuova collaborazione</h2><p className="mt-1 text-[10px] text-slate-500">Pubblica una richiesta precisa e professionale.</p><div className="mt-4 space-y-2.5"><input className={field} value={draft.title} onChange={e=>setDraft((v:any)=>({...v,title:e.target.value}))} placeholder="Es. Cerco vocalist Deep House"/><textarea className={field} rows={4} value={draft.description} onChange={e=>setDraft((v:any)=>({...v,description:e.target.value}))} placeholder="Descrivi progetto e obiettivo"/><input className={field} value={draft.genre} onChange={e=>setDraft((v:any)=>({...v,genre:e.target.value}))} placeholder="Genere"/><input className={field} value={draft.roleWanted} onChange={e=>setDraft((v:any)=>({...v,roleWanted:e.target.value}))} placeholder="Ruolo cercato"/><div className="grid grid-cols-2 gap-2"><input className={field} value={draft.language} onChange={e=>setDraft((v:any)=>({...v,language:e.target.value}))} placeholder="Lingua"/><input className={field} value={draft.bpm} onChange={e=>setDraft((v:any)=>({...v,bpm:e.target.value}))} placeholder="BPM"/></div><button onClick={onCreate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950"><Spinner show={working==='collab'}/><Plus className="h-4 w-4"/>Pubblica</button></div></section><section className={`${panel} p-5`}><h2 className="text-sm font-black text-white">Opportunità aperte</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{items.length ? items.map((c:Collaboration)=><article key={c.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center gap-3"><Avatar p={c.owner}/><div className="min-w-0"><div className="truncate text-sm font-black text-white">{c.title}</div><div className="mt-0.5 text-[9px] text-slate-500">{c.owner?.displayName || 'Creator SONARA'} · {c.genre || 'Genere aperto'} {c.bpm?`· ${c.bpm} BPM`:''}</div></div></div><p className="mt-3 text-xs leading-5 text-slate-400">{c.description || 'Nessuna descrizione aggiuntiva.'}</p><div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] text-cyan-300">{c.roleWanted || 'Ruolo aperto'}</span>{c.ownerUid&&<button onClick={()=>onChat(c.ownerUid)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black text-white">Contatta</button>}</div></article>) : <Empty title="Nessuna richiesta aperta" text="Pubblica la prima opportunità di collaborazione."/>}</div></section></div>; }
function Matches({ items, onChat, working }: any) { return <section className={`${panel} p-5`}><div><h2 className="text-sm font-black text-white">SONARA Match</h2><p className="mt-1 text-[10px] text-slate-500">Compatibilità basata su generi, ruolo, lingua e città.</p></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.length?items.map((m:Match)=><article key={m.profile.uid} className="rounded-2xl border border-purple-400/10 bg-gradient-to-br from-purple-500/[0.07] to-transparent p-4"><div className="flex items-center gap-3"><Avatar p={m.profile} size="lg"/><div><div className="text-2xl font-black text-purple-200">{m.score}%</div><div className="text-sm font-black text-white">{m.profile.displayName}</div><div className="text-[9px] text-slate-500">{m.profile.role} · {m.profile.flag} {m.profile.city}</div></div></div><button onClick={()=>onChat(m.profile.uid)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/15 bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-100"><Spinner show={working===`chat-${m.profile.uid}`}/><MessageCircle className="h-3.5 w-3.5"/>Contatta</button></article>):<Empty title="Nessun match disponibile" text="Completa generi, ruolo e lingue del tuo profilo."/>}</div></section>; }

function Live({ rooms, selected, setSelected, room, messages, meUid, text, setText, draft, setDraft, onCreate, onJoin, onSend, working, endRef }: any) { return <div className="grid gap-4 xl:grid-cols-[320px_1fr]"><div className="space-y-4"><section className={`${panel} p-4`}><h2 className="text-sm font-black text-white">Apri stanza LIVE</h2><div className="mt-3 space-y-2"><input className={field} value={draft.name} onChange={e=>setDraft((v:any)=>({...v,name:e.target.value}))} placeholder="Nome stanza"/><select className={field} value={draft.kind} onChange={e=>setDraft((v:any)=>({...v,kind:e.target.value}))}>{ROOM_KINDS.map(k=><option key={k}>{k}</option>)}</select><input className={field} value={draft.genre} onChange={e=>setDraft((v:any)=>({...v,genre:e.target.value}))} placeholder="Genere"/><button onClick={onCreate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-slate-950"><Spinner show={working==='room-create'}/><Radio className="h-4 w-4"/>Apri LIVE</button></div></section><section className={`${panel} p-2`}><div className="px-2 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600">Stanze attive</div>{rooms.length?rooms.map((r:Room)=><button key={r.id} onClick={()=>setSelected(r.id)} className={`mb-1 w-full rounded-xl p-3 text-left ${selected===r.id?'bg-white/[0.07]':'hover:bg-white/[0.03]'}`}><div className="flex items-center justify-between"><span className="truncate text-xs font-black text-white">{r.name}</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">{r.participantCount} LIVE</span></div><div className="mt-1 text-[9px] text-slate-600">{r.kind} · {r.genre || 'Open format'}</div></button>):<Empty title="Nessuna LIVE" text="Apri la prima stanza." compact/>}</section></div><section className={`${panel} flex min-h-[650px] flex-col overflow-hidden`}>{!room?<div className="flex flex-1 items-center justify-center"><Empty title="Seleziona una stanza" text="Entra in una sessione LIVE per partecipare."/></div>:<><header className="flex items-center justify-between border-b border-white/[0.06] p-4"><div><div className="flex items-center gap-2 text-sm font-black text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/>{room.name}</div><div className="mt-1 text-[9px] text-slate-600">{room.kind} · {room.participantCount} partecipanti · {room.genre || 'Open format'}</div></div><button onClick={()=>onJoin(room.id)} className="rounded-xl bg-emerald-400 px-4 py-2 text-[10px] font-black text-emerald-950"><Spinner show={working===`join-${room.id}`}/> ENTRA</button></header><div className="flex-1 space-y-2 overflow-y-auto p-4">{messages.length?messages.map((m:Message)=><MessageBubble key={m.id} message={m} mine={m.senderUid===meUid}/>):<Empty title="Stanza pronta" text="Entra e scrivi il primo messaggio LIVE." compact/>}<div ref={endRef}/></div><div className="border-t border-white/[0.06] p-3"><div className="flex gap-2"><input className={field} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSend();}}} placeholder="Messaggio nella stanza LIVE..."/><button onClick={onSend} disabled={!text.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950 disabled:opacity-30"><Spinner show={working==='room-send'}/>{working!=='room-send'&&<Send className="h-4 w-4"/>}</button></div></div></>}</section></div>; }

function Trending({ stats }: { stats: DashboardData | null }) { return <div className="grid gap-4 lg:grid-cols-2"><section className={`${panel} p-5`}><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-300"/><h2 className="text-sm font-black text-white">Generi in crescita</h2></div><div className="mt-4 space-y-2">{stats?.topGenres?.length?stats.topGenres.map((g,i)=><TrendRow key={g.name} rank={i+1} name={g.name} value={g.count}/>):<Empty title="Dati in costruzione" text="I trend si aggiornano con l'attività reale della community."/>}</div></section><section className={`${panel} p-5`}><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-cyan-300"/><h2 className="text-sm font-black text-white">Hub musicali</h2></div><div className="mt-4 space-y-2">{stats?.topCities?.length?stats.topCities.map((g,i)=><TrendRow key={g.name} rank={i+1} name={g.name} value={g.count}/>):<Empty title="Dati in costruzione" text="Le città emergono dai profili pubblici reali."/>}</div></section></div>; }
function TrendRow({ rank, name, value }: { rank:number; name:string; value:number }) { return <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"><span className="w-6 text-center text-xs font-black text-slate-600">{rank}</span><span className="flex-1 text-xs font-bold text-white">{name}</span><span className="text-[10px] font-black text-cyan-300">{value}</span></div>; }
function Empty({ title, text, compact=false }: { title:string; text:string; compact?:boolean }) { return <div className={`col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.07] text-center ${compact?'p-5':'min-h-40 p-8'}`}><Globe2 className="h-5 w-5 text-slate-700"/><div className="mt-2 text-xs font-black text-slate-400">{title}</div><div className="mt-1 max-w-sm text-[10px] leading-5 text-slate-600">{text}</div></div>; }
