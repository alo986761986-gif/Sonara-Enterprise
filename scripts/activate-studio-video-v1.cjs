const fs = require('node:fs');
const path = require('node:path');

const studioFile = path.join(process.cwd(), 'src/components/studio/SonaraStudio.tsx');
const controlFile = path.join(process.cwd(), 'src/components/studio/StudioSectionControl.tsx');
let studio = fs.readFileSync(studioFile, 'utf8');
let control = fs.readFileSync(controlFile, 'utf8');
const MARKER = 'SONARA_STUDIO_VIDEO_V1';
const NAV_MARKER = 'SONARA_STUDIO_VIDEO_NAV_V1';

function replaceRequired(source, anchor, replacement, label) {
  if (!source.includes(anchor)) {
    console.error(`[SONARA] Studio video activation failed: ${label} anchor not found.`);
    process.exit(1);
  }
  return source.replace(anchor, replacement);
}

if (!studio.includes(MARKER)) {
  studio = replaceRequired(
    studio,
    "  const [crossfadeLength, setCrossfadeLength] = useState(1);",
    "  const [crossfadeLength, setCrossfadeLength] = useState(1);\n  const [videoAsset, setVideoAsset] = useState<{ name: string; src: string; duration: number; start: number; assetId?: string } | null>(null);\n  const [videoMuted, setVideoMuted] = useState(true);\n  // SONARA_STUDIO_VIDEO_V1",
    'video state'
  );

  studio = replaceRequired(
    studio,
    "  const midiInputRef = useRef<HTMLInputElement | null>(null);",
    "  const midiInputRef = useRef<HTMLInputElement | null>(null);\n  const videoInputRef = useRef<HTMLInputElement | null>(null);\n  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);",
    'video refs'
  );

  const videoFunctions = `  const importVideo = async (files: FileList | null) => {\n    if (!files?.length) return;\n    const file = Array.from(files).find(item => item.type.startsWith('video/') || /\\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(item.name));\n    if (!file) { setAssistantNotice('Nessun file video valido selezionato.'); return; }\n    const url = URL.createObjectURL(file);\n    try {\n      const duration = await new Promise<number>((resolve, reject) => {\n        const probe = document.createElement('video');\n        probe.preload = 'metadata';\n        probe.src = url;\n        probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 1);\n        probe.onerror = () => reject(new Error('Impossibile leggere i metadati del video.'));\n      });\n      const assetId = await saveStudioAsset(file, file.name);\n      if (videoAsset?.src.startsWith('blob:')) URL.revokeObjectURL(videoAsset.src);\n      const next = { name: file.name, src: url, duration, start: snapTime(playhead), assetId: assetId || undefined };\n      setVideoAsset(next);\n      window.localStorage.setItem('sonara.studio.video.v1', JSON.stringify({ name: next.name, duration: next.duration, start: next.start, assetId: next.assetId || '' }));\n      setAssistantNotice(\`Video importato: \${file.name} · \${formatTime(duration)} · sync da \${formatTime(next.start)}.\`);\n    } catch (error) {\n      URL.revokeObjectURL(url);\n      setAssistantNotice(error instanceof Error ? error.message : String(error));\n    }\n  };\n\n  const alignVideoToPlayhead = () => {\n    if (!videoAsset) return;\n    const next = { ...videoAsset, start: snapTime(playhead) };\n    setVideoAsset(next);\n    window.localStorage.setItem('sonara.studio.video.v1', JSON.stringify({ name: next.name, duration: next.duration, start: next.start, assetId: next.assetId || '' }));\n    setAssistantNotice(\`Video allineato al playhead: \${formatTime(next.start)}.\`);\n  };\n\n  const removeVideo = () => {\n    if (videoAsset?.src.startsWith('blob:')) URL.revokeObjectURL(videoAsset.src);\n    setVideoAsset(null);\n    window.localStorage.removeItem('sonara.studio.video.v1');\n    setAssistantNotice('Video rimosso dallo Studio.');\n  };\n\n  useEffect(() => {\n    let cancelled = false;\n    const raw = window.localStorage.getItem('sonara.studio.video.v1');\n    if (!raw) return () => { cancelled = true; };\n    try {\n      const saved = JSON.parse(raw);\n      if (!saved?.assetId) return () => { cancelled = true; };\n      void loadStudioAsset(String(saved.assetId)).then(blob => {\n        if (cancelled || !blob) return;\n        const src = URL.createObjectURL(blob);\n        setVideoAsset({ name: String(saved.name || 'Studio Video'), src, duration: Math.max(0.1, Number(saved.duration) || 1), start: Math.max(0, Number(saved.start) || 0), assetId: String(saved.assetId) });\n      });\n    } catch {}\n    return () => { cancelled = true; };\n  }, []);\n\n  useEffect(() => {\n    const video = videoPreviewRef.current;\n    if (!video || !videoAsset) return;\n    video.muted = videoMuted;\n    const localTime = playhead - videoAsset.start;\n    const active = localTime >= 0 && localTime < videoAsset.duration;\n    if (!active) {\n      if (!video.paused) video.pause();\n      try { video.currentTime = localTime < 0 ? 0 : Math.max(0, videoAsset.duration - 0.04); } catch {}\n      return;\n    }\n    const desired = clamp(localTime, 0, Math.max(0, videoAsset.duration - 0.02));\n    try { if (Math.abs(video.currentTime - desired) > 0.18) video.currentTime = desired; } catch {}\n    if (playing) {\n      if (video.paused) void video.play().catch(() => undefined);\n    } else if (!video.paused) {\n      video.pause();\n    }\n  }, [playing, playhead, videoAsset, videoMuted]);\n\n`;

  studio = replaceRequired(
    studio,
    "  const importMidi = async (files: FileList | null) => {",
    videoFunctions + "  const importMidi = async (files: FileList | null) => {",
    'video import functions'
  );

  studio = replaceRequired(
    studio,
    '      <input ref={midiInputRef} type="file" multiple accept=".mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={event => void importMidi(event.target.files)} />',
    '      <input ref={midiInputRef} type="file" multiple accept=".mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={event => void importMidi(event.target.files)} />\n      <input ref={videoInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.avi,.mkv" className="hidden" onChange={event => void importVideo(event.target.files)} />',
    'video file input'
  );

  studio = replaceRequired(
    studio,
    '<div className="grid grid-cols-3 gap-2 xl:grid-cols-1">',
    '<div className="grid grid-cols-2 gap-2 xl:grid-cols-1">',
    'studio import grid'
  );

  const midiButton = '<button onClick={() => midiInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300"><KeyboardMusic className="h-3.5 w-3.5" /> MIDI</button>';
  studio = replaceRequired(
    studio,
    midiButton,
    midiButton + '\n            <button onClick={() => videoInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300"><Upload className="h-3.5 w-3.5" /> VIDEO</button>',
    'video sidebar button'
  );

  const mainAnchor = '        <main className="min-w-0 flex-1 bg-[#06080d]">\n          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/75 px-3 py-2">';
  const videoPanel = `        <main className="min-w-0 flex-1 bg-[#06080d]">\n          {videoAsset && (\n            <section data-sonara-video-sync="true" className="border-b border-slate-800 bg-[#070a10] p-3">\n              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">\n                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black">\n                  <video ref={videoPreviewRef} src={videoAsset.src} muted={videoMuted} playsInline preload="metadata" className="aspect-video max-h-[360px] w-full bg-black object-contain" />\n                </div>\n                <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">\n                  <div>\n                    <div className="text-[8px] font-black uppercase tracking-[0.18em] text-violet-300">VIDEO SYNC · REAL MEDIA</div>\n                    <div className="mt-1 truncate text-xs font-black text-white" title={videoAsset.name}>{videoAsset.name}</div>\n                    <div className="mt-2 text-[9px] leading-4 text-slate-500">Start {formatTime(videoAsset.start)} · Durata {formatTime(videoAsset.duration)} · Preview sincronizzata al transport Studio.</div>\n                  </div>\n                  <div className="grid grid-cols-2 gap-2">\n                    <button onClick={() => setVideoMuted(value => !value)} className=\"rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-[8px] font-black text-slate-300\">AUDIO VIDEO {videoMuted ? 'OFF' : 'ON'}</button>\n                    <button onClick={alignVideoToPlayhead} className=\"rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-2 text-[8px] font-black text-violet-200\">ALLINEA AL PLAYHEAD</button>\n                    <button onClick={() => videoInputRef.current?.click()} className=\"rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-[8px] font-black text-slate-300\">SOSTITUISCI VIDEO</button>\n                    <button onClick={removeVideo} className=\"rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-2 text-[8px] font-black text-rose-200\">RIMUOVI VIDEO</button>\n                  </div>\n                </div>\n              </div>\n            </section>\n          )}\n          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/75 px-3 py-2">`;
  studio = replaceRequired(studio, mainAnchor, videoPanel, 'video preview panel');

  fs.writeFileSync(studioFile, studio);
  console.log('[SONARA] Studio video v1 activated: real import, persistent local asset, transport sync and non-overlay preview.');
} else {
  console.log('[SONARA] Studio video v1 already active.');
}

if (!control.includes(NAV_MARKER)) {
  control = replaceRequired(
    control,
    '  Download,\n  FileAudio2,',
    '  Clapperboard,\n  Download,\n  FileAudio2,',
    'Studio video nav icon'
  );

  control = replaceRequired(
    control,
    "  const triggerImport = (kind: 'audio' | 'stems' | 'midi') => {\n    const inputs = Array.from(getStudioRoot()?.querySelectorAll('input[type=\"file\"]') || []) as HTMLInputElement[];\n    const index = kind === 'audio' ? 0 : kind === 'stems' ? 1 : 2;",
    "  const triggerImport = (kind: 'audio' | 'stems' | 'midi' | 'video') => {\n    // SONARA_STUDIO_VIDEO_NAV_V1\n    const inputs = Array.from(getStudioRoot()?.querySelectorAll('input[type=\"file\"]') || []) as HTMLInputElement[];\n    const index = kind === 'audio' ? 0 : kind === 'stems' ? 1 : kind === 'midi' ? 2 : 3;",
    'Studio video nav trigger'
  );

  const navMidi = `            <button type="button" onClick={() => triggerImport('midi')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">\n              <KeyboardMusic className="h-3.5 w-3.5" /> MIDI\n            </button>`;
  control = replaceRequired(
    control,
    navMidi,
    navMidi + `\n            <button type="button" onClick={() => triggerImport('video')} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/[0.05] hover:text-white">\n              <Clapperboard className="h-3.5 w-3.5" /> Video\n            </button>`,
    'Studio video top navigation'
  );

  fs.writeFileSync(controlFile, control);
  console.log('[SONARA] Studio video navigation activated in the native Studio Pro header.');
} else {
  console.log('[SONARA] Studio video navigation already active.');
}
