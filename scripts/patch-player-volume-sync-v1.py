from pathlib import Path

CANDIDATE = Path('src/components/generator/ElevenMusicGenerationControl.tsx')
FIXED = Path('src/components/player/SonaraProfessionalFixedPlayer.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED')
        return text
    if old not in text:
        raise SystemExit(f'{label}=OLD_MARKER_NOT_FOUND')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_candidate() -> None:
    text = CANDIDATE.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "import { Check, Download, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';",
        "import { Check, Download, Pause, Play, RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';",
        'CANDIDATE_VOLUME_ICONS'
    )

    marker = "function ProfessionalCandidatePlayer({\n"
    insert = """const GLOBAL_VOLUME_EVENT = 'sonara:global-player-volume';
const GLOBAL_VOLUME_STORAGE = 'sonara.globalPlayerVolume';

function readGlobalVolume() {
  if (typeof window === 'undefined') return 0.82;
  try {
    const stored = Number(window.localStorage.getItem(GLOBAL_VOLUME_STORAGE));
    return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.82;
  } catch {
    return 0.82;
  }
}

function ProfessionalCandidatePlayer({
"""
    text = replace_once(text, marker, insert, 'CANDIDATE_VOLUME_GLOBALS')

    text = replace_once(
        text,
        "  const [playing, setPlaying] = useState(false);\n  const [currentTime, setCurrentTime] = useState(0);\n  const [duration, setDuration] = useState(0);",
        "  const [playing, setPlaying] = useState(false);\n  const [currentTime, setCurrentTime] = useState(0);\n  const [duration, setDuration] = useState(0);\n  const [volume, setVolume] = useState(readGlobalVolume);\n  const [lastVolume, setLastVolume] = useState(() => {\n    const initial = readGlobalVolume();\n    return initial > 0.01 ? initial : 0.82;\n  });\n  const isMuted = volume <= 0.001;",
        'CANDIDATE_VOLUME_STATE'
    )

    text = replace_once(
        text,
        "  useEffect(() => {\n    setPlaying(false);\n    setCurrentTime(0);\n    setDuration(0);\n  }, [candidate.audioUrl]);",
        "  useEffect(() => {\n    setPlaying(false);\n    setCurrentTime(0);\n    setDuration(0);\n  }, [candidate.audioUrl]);\n\n  useEffect(() => {\n    const audio = audioRef.current;\n    if (audio) audio.volume = volume;\n  }, [candidate.audioUrl, volume]);\n\n  useEffect(() => {\n    const onGlobalVolume = (event: Event) => {\n      const detail = (event as CustomEvent<{ volume?: number }>).detail;\n      const next = Number(detail?.volume);\n      if (!Number.isFinite(next)) return;\n      const clamped = Math.max(0, Math.min(1, next));\n      setVolume(clamped);\n      if (clamped > 0.01) setLastVolume(clamped);\n      if (audioRef.current) audioRef.current.volume = clamped;\n    };\n    window.addEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);\n    return () => window.removeEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);\n  }, []);",
        'CANDIDATE_VOLUME_EFFECTS'
    )

    text = replace_once(
        text,
        "  const seek = (value: number) => {\n    const audio = audioRef.current;\n    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;\n    const next = Math.max(0, Math.min(audio.duration, value));\n    audio.currentTime = next;\n    setCurrentTime(next);\n  };\n\n  const percent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;",
        "  const seek = (value: number) => {\n    const audio = audioRef.current;\n    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;\n    const next = Math.max(0, Math.min(audio.duration, value));\n    audio.currentTime = next;\n    setCurrentTime(next);\n  };\n\n  const applyVolume = (value: number) => {\n    const next = Math.max(0, Math.min(1, value));\n    setVolume(next);\n    if (next > 0.01) setLastVolume(next);\n    if (audioRef.current) audioRef.current.volume = next;\n    try { window.localStorage.setItem(GLOBAL_VOLUME_STORAGE, String(next)); } catch {}\n    window.dispatchEvent(new CustomEvent(GLOBAL_VOLUME_EVENT, {\n      detail: { volume: next, source: `candidate-${candidate.id}` }\n    }));\n  };\n\n  const toggleMute = () => {\n    if (isMuted) {\n      applyVolume(lastVolume > 0.01 ? lastVolume : 0.82);\n      return;\n    }\n    setLastVolume(volume);\n    applyVolume(0);\n  };\n\n  const percent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;",
        'CANDIDATE_VOLUME_ACTIONS'
    )

    text = replace_once(
        text,
        "      <div className=\"mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3\">\n        <span className=\"text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600\">\n          {candidate.audioFormat.toUpperCase()} · READY\n        </span>\n        <div className=\"flex items-center gap-1.5\">",
        "      <div className=\"mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3\">\n        <span className=\"text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600\">\n          {candidate.audioFormat.toUpperCase()} · READY\n        </span>\n        <div className=\"flex flex-wrap items-center justify-end gap-2\">\n          <div className=\"flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-1.5 py-1\" data-sonara-candidate-volume={candidate.id}>\n            <button\n              type=\"button\"\n              onClick={toggleMute}\n              className=\"grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.08] hover:text-white\"\n              aria-label={isMuted ? `Riattiva volume brano ${candidate.id}` : `Silenzia volume brano ${candidate.id}`}\n              title={`Volume ${Math.round(volume * 100)}%`}\n            >\n              {isMuted ? <VolumeX className=\"h-3.5 w-3.5\" /> : <Volume2 className=\"h-3.5 w-3.5\" />}\n            </button>\n            <input\n              type=\"range\"\n              min={0}\n              max={1}\n              step={0.01}\n              value={volume}\n              onChange={event => applyVolume(Number(event.target.value))}\n              aria-label={`Volume brano ${candidate.id}`}\n              className=\"h-1 w-20 cursor-pointer accent-violet-500\"\n            />\n            <span className=\"w-7 text-right font-mono text-[8px] tabular-nums text-zinc-500\">{Math.round(volume * 100)}%</span>\n          </div>",
        'CANDIDATE_VOLUME_UI'
    )

    CANDIDATE.write_text(text, encoding='utf-8')


def patch_fixed() -> None:
    text = FIXED.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "type RepeatMode = 'off' | 'all' | 'one';\n",
        "type RepeatMode = 'off' | 'all' | 'one';\n\nconst GLOBAL_VOLUME_EVENT = 'sonara:global-player-volume';\nconst GLOBAL_VOLUME_STORAGE = 'sonara.globalPlayerVolume';\n\nfunction readStoredVolume() {\n  if (typeof window === 'undefined') return 0.82;\n  try {\n    const stored = Number(window.localStorage.getItem(GLOBAL_VOLUME_STORAGE));\n    return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.82;\n  } catch {\n    return 0.82;\n  }\n}\n",
        'FIXED_VOLUME_GLOBALS'
    )

    text = replace_once(
        text,
        "  const [volume, setVolume] = useState(0.82);\n  const [lastVolume, setLastVolume] = useState(0.82);",
        "  const [volume, setVolume] = useState(readStoredVolume);\n  const [lastVolume, setLastVolume] = useState(() => {\n    const initial = readStoredVolume();\n    return initial > 0.01 ? initial : 0.82;\n  });",
        'FIXED_VOLUME_STATE'
    )

    text = replace_once(
        text,
        "  useEffect(() => {\n    const audio = audioRef.current;\n    if (!audio) return;\n    audio.volume = volume;\n  }, [volume]);",
        "  useEffect(() => {\n    const audio = audioRef.current;\n    if (audio) audio.volume = volume;\n    if (volume > 0.01) setLastVolume(volume);\n    try { window.localStorage.setItem(GLOBAL_VOLUME_STORAGE, String(volume)); } catch {}\n    window.dispatchEvent(new CustomEvent(GLOBAL_VOLUME_EVENT, {\n      detail: { volume, source: 'universal-player' }\n    }));\n  }, [volume]);\n\n  useEffect(() => {\n    const onGlobalVolume = (event: Event) => {\n      const detail = (event as CustomEvent<{ volume?: number; source?: string }>).detail;\n      if (detail?.source === 'universal-player') return;\n      const next = Number(detail?.volume);\n      if (!Number.isFinite(next)) return;\n      const clamped = Math.max(0, Math.min(1, next));\n      setVolume(clamped);\n      if (clamped > 0.01) setLastVolume(clamped);\n    };\n    window.addEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);\n    return () => window.removeEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);\n  }, []);",
        'FIXED_VOLUME_SYNC'
    )

    text = replace_once(
        text,
        "          <div className=\"sonara-pro-volume\">\n            <button type=\"button\" className=\"sonara-pro-icon-button\" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>{isMuted ? <VolumeX /> : <Volume2 />}</button>\n            <input type=\"range\" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label=\"Volume\" />\n          </div>",
        "          <div className=\"sonara-pro-volume\" data-sonara-universal-volume=\"true\" title={`Volume ${Math.round(volume * 100)}%`}>\n            <button type=\"button\" className=\"sonara-pro-icon-button\" onClick={toggleMute} aria-label={isMuted ? 'Riattiva volume' : `Silenzia volume ${Math.round(volume * 100)}%`}>{isMuted ? <VolumeX /> : <Volume2 />}<small>{Math.round(volume * 100)}</small></button>\n            <input type=\"range\" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label={`Volume universale ${Math.round(volume * 100)}%`} />\n          </div>",
        'FIXED_VOLUME_UI'
    )

    text = replace_once(
        text,
        ".sonara-pro-player-actions>.sonara-pro-icon-button,.sonara-pro-volume input,.sonara-pro-menu-wrap{display:none}.sonara-pro-volume{display:block}.sonara-pro-volume .sonara-pro-icon-button{display:grid}",
        ".sonara-pro-player-actions>.sonara-pro-icon-button,.sonara-pro-menu-wrap{display:none}.sonara-pro-volume{display:grid;grid-template-columns:34px 64px;gap:2px}.sonara-pro-volume .sonara-pro-icon-button{display:grid;width:34px;height:34px}.sonara-pro-volume input{display:block;width:64px}",
        'FIXED_VOLUME_MOBILE_VISIBLE'
    )

    FIXED.write_text(text, encoding='utf-8')


patch_candidate()
patch_fixed()
print('SONARA_PLAYER_VOLUME_SYNC_V1=PATCHED')
