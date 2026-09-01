const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/components/studio/SonaraStudio.tsx');
let source = fs.readFileSync(file, 'utf8');
const MARKER = 'SONARA_STUDIO_REAL_ENGINE_V2';
if (source.includes(MARKER)) {
  console.log('[SONARA] Studio real engine v2 already active.');
  process.exit(0);
}

function requiredReplace(anchor, replacement, label) {
  if (!source.includes(anchor)) {
    console.error(`[SONARA] Studio real engine v2 failed: ${label} anchor not found.`);
    process.exit(1);
  }
  source = source.replace(anchor, replacement);
}

function optionalReplace(anchor, replacement) {
  if (source.includes(anchor)) source = source.replace(anchor, replacement);
}

requiredReplace(
  "import { audioBufferToWav, decodeAudioFromUrl, downloadBlob, safeAudioFilename } from '../production/audioUtils';",
  "import { audioBufferToWav, decodeAudioFromUrl, downloadBlob, safeAudioFilename } from '../production/audioUtils';\nimport { createStudioReverbImpulse, loadStudioAsset, midiNoteFrequency, parseMidiFile, saveStudioAsset, type StudioMidiNote } from './studioRealEngine';",
  'helper import'
);

if (source.includes('  sessionSourceEnd?: number;\n};')) {
  source = source.replace(
    '  sessionSourceEnd?: number;\n};',
    '  sessionSourceEnd?: number;\n  assetId?: string;\n  midiNotes?: StudioMidiNote[];\n};'
  );
} else if (source.includes('  muted?: boolean;\n};')) {
  source = source.replace(
    '  muted?: boolean;\n};',
    '  muted?: boolean;\n  assetId?: string;\n  midiNotes?: StudioMidiNote[];\n};'
  );
} else {
  console.error('[SONARA] Studio real engine v2 failed: compatible Clip type anchor not found.');
  process.exit(1);
}

requiredReplace(
  "type ClipAudioGraph = {\n  source: MediaElementAudioSourceNode;\n  gain: GainNode;\n  panner: StereoPannerNode;\n};",
  "type ClipAudioGraph = {\n  source: MediaElementAudioSourceNode;\n  gain: GainNode;\n  low: BiquadFilterNode;\n  mid: BiquadFilterNode;\n  high: BiquadFilterNode;\n  compressor: DynamicsCompressorNode;\n  dry: GainNode;\n  convolver: ConvolverNode;\n  wet: GainNode;\n  panner: StereoPannerNode;\n};",
  'live DSP graph type'
);

requiredReplace(
  "  const recordingPunchRef = useRef<PunchSnapshot>({ enabled: false, punchIn: 0, punchOut: 16 });",
  "  const recordingPunchRef = useRef<PunchSnapshot>({ enabled: false, punchIn: 0, punchOut: 16 });\n  const midiScheduledRef = useRef(new Set<string>());\n  const restoredProjectRef = useRef(false);\n  // ${MARKER}",
  'engine refs'
);

const midiOld = `  const importMidi = (files: FileList | null) => {\n    if (!files?.length) return;\n    pushHistory();\n    const next = Array.from(files).filter(file => /\\.(mid|midi)$/i.test(file.name)).map(file => ({\n      ...makeMidiTrack(file.name.replace(/\\.(mid|midi)$/i, '')),\n      clips: [{ id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0, duration: 16, fadeIn: 0, fadeOut: 0, kind: 'midi' as TrackKind }]\n    }));\n    setTracks(current => [...current, ...next]);\n    setAssistantNotice(next.length ? \`${'${next.length}'} traccia/e MIDI aggiunte alla timeline.\` : 'Nessun file MIDI valido selezionato.');\n  };`;
const midiNew = `  const importMidi = async (files: FileList | null) => {\n    if (!files?.length) return;\n    const midiFiles = Array.from(files).filter(file => /\\.(mid|midi)$/i.test(file.name));\n    if (!midiFiles.length) { setAssistantNotice('Nessun file MIDI valido selezionato.'); return; }\n    pushHistory();\n    const next: Track[] = [];\n    for (const file of midiFiles) {\n      try {\n        const parsed = await parseMidiFile(file);\n        const track = makeMidiTrack(file.name.replace(/\\.(mid|midi)$/i, ''));\n        track.clips = [{ id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0, duration: Math.max(0.1, parsed.duration), fadeIn: 0, fadeOut: 0, kind: 'midi', midiNotes: parsed.notes }];\n        next.push(track);\n      } catch (error) { setAssistantNotice(error instanceof Error ? error.message : String(error)); }\n    }\n    if (next.length) {\n      setTracks(current => [...current, ...next]);\n      setSelectedTrackId(next[0].id);\n      setSelectedClipId(next[0].clips[0].id);\n      setAssistantNotice(\`${'${next.length}'} traccia/e MIDI importate con note reali e playback attivo.\`);\n    }\n  };`;
requiredReplace(midiOld, midiNew, 'MIDI import');
optionalReplace(
  '<input ref={midiInputRef} type="file" multiple accept=".mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={event => importMidi(event.target.files)} />',
  '<input ref={midiInputRef} type="file" multiple accept=".mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={event => void importMidi(event.target.files)} />'
);

requiredReplace(
  `  const canRouteThroughWebAudio = (src: string) => {\n    try {\n      const url = new URL(src, window.location.href);\n      return url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === window.location.origin;\n    } catch {\n      return true;\n    }\n  };`,
  `  const canRouteThroughWebAudio = (src: string) => {\n    try {\n      const url = new URL(src, window.location.href);\n      if (url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === window.location.origin) return true;\n      return ['sonaraenterprise.com','www.sonaraenterprise.com','api.sonaraenterprise.com','molab.sonaraenterprise.com'].includes(url.hostname);\n    } catch { return true; }\n  };`,
  'SONARA WebAudio host routing'
);

requiredReplace(
  `          audio = new Audio(clip.src);\n          audio.preload = 'auto';`,
  `          audio = new Audio();\n          if (/^https?:\\/\\//i.test(clip.src)) audio.crossOrigin = 'anonymous';\n          audio.src = clip.src;\n          audio.preload = 'auto';`,
  'CORS media element setup'
);

requiredReplace(
  `            const source = context.createMediaElementSource(audio);\n            const gain = context.createGain();\n            const panner = context.createStereoPanner();\n            source.connect(gain).connect(panner).connect(master);\n            clipGraphs.current.set(clip.id, { source, gain, panner });`,
  `            const source = context.createMediaElementSource(audio);\n            const gain = context.createGain();\n            const low = context.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;\n            const mid = context.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1600; mid.Q.value = 0.8;\n            const high = context.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 7000;\n            const compressor = context.createDynamicsCompressor();\n            const dry = context.createGain(); dry.gain.value = 1;\n            const convolver = context.createConvolver(); convolver.buffer = createStudioReverbImpulse(context);\n            const wet = context.createGain();\n            const panner = context.createStereoPanner();\n            source.connect(gain).connect(low).connect(mid).connect(high).connect(compressor);\n            compressor.connect(dry).connect(panner);\n            compressor.connect(convolver).connect(wet).connect(panner);\n            panner.connect(master);\n            clipGraphs.current.set(clip.id, { source, gain, low, mid, high, compressor, dry, convolver, wet, panner });`,
  'live DSP graph'
);

requiredReplace(
  `          audio.volume = 1;\n          graph.gain.gain.value = track.volume;\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);`,
  `          audio.volume = 1;\n          graph.gain.gain.value = track.volume;\n          graph.low.gain.value = track.low; graph.mid.gain.value = track.mid; graph.high.gain.value = track.high;\n          graph.compressor.threshold.value = -8 - track.compression * 0.34;\n          graph.compressor.knee.value = 20; graph.compressor.ratio.value = 1 + track.compression * 0.08;\n          graph.compressor.attack.value = 0.008; graph.compressor.release.value = 0.2;\n          graph.wet.gain.value = clamp(track.reverb / 100, 0, 0.5);\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);`,
  'initial live DSP values'
);

requiredReplace(
  `        if (graph) {\n          graph.gain.gain.value = track.volume * fade;\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);\n        } else {`,
  `        if (graph) {\n          let automatedVolume = track.volume;\n          if (track.automation.length) {\n            const points = [...track.automation].sort((a, b) => a.time - b.time);\n            const before = [...points].reverse().find(point => point.time <= time);\n            const after = points.find(point => point.time > time);\n            if (before && after) { const r = clamp((time - before.time) / Math.max(0.001, after.time - before.time), 0, 1); automatedVolume = before.value + (after.value - before.value) * r; }\n            else if (before) automatedVolume = before.value; else if (after) automatedVolume = after.value;\n          }\n          graph.gain.gain.value = automatedVolume * fade;\n          graph.low.gain.value = track.low; graph.mid.gain.value = track.mid; graph.high.gain.value = track.high;\n          graph.compressor.threshold.value = -8 - track.compression * 0.34; graph.compressor.ratio.value = 1 + track.compression * 0.08;\n          graph.wet.gain.value = clamp(track.reverb / 100, 0, 0.5);\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);\n        } else {`,
  'live automation and effects'
);

const recorderAnchor = '  const stopRecorderOnly = () => {';
requiredReplace(
  recorderAnchor,
  `  const scheduleMidiAt = (time: number) => {\n    const context = audioContextRef.current; const master = masterGainNodeRef.current;\n    if (!context || !master) return;\n    for (const track of tracks) {\n      if (track.kind !== 'midi' || track.mute || (anySolo && !track.solo)) continue;\n      for (const clip of track.clips) {\n        if (!clip.midiNotes?.length || time < clip.start || time >= clip.start + clip.duration) continue;\n        const local = time - clip.start;\n        for (let index = 0; index < clip.midiNotes.length; index += 1) {\n          const note = clip.midiNotes[index];\n          if (note.start < local || note.start > local + 0.08) continue;\n          const key = clip.id + ':' + index + ':' + Math.floor(note.start * 1000);\n          if (midiScheduledRef.current.has(key)) continue; midiScheduledRef.current.add(key);\n          const osc = context.createOscillator(); const gain = context.createGain(); const pan = context.createStereoPanner();\n          osc.type = 'sawtooth'; osc.frequency.value = midiNoteFrequency(note.note + track.pitch);\n          const when = context.currentTime + Math.max(0, note.start - local); const end = when + Math.max(0.03, note.duration);\n          gain.gain.setValueAtTime(0.0001, when); gain.gain.exponentialRampToValueAtTime(Math.max(0.002, note.velocity * track.volume * 0.22), when + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, end);\n          pan.pan.value = clamp(track.pan / 100, -1, 1); osc.connect(gain).connect(pan).connect(master); osc.start(when); osc.stop(end + 0.02);\n        }\n      }\n    }\n  };\n\n  ${recorderAnchor}`,
  'MIDI scheduler'
);
requiredReplace('      syncClips(next);\n      if (metronome) {', '      syncClips(next);\n      scheduleMidiAt(next);\n      if (metronome) {', 'MIDI transport');
requiredReplace('    playingClips.current.clear();\n    lastMetronomeBeatRef.current = -1;', '    playingClips.current.clear();\n    midiScheduledRef.current.clear();\n    lastMetronomeBeatRef.current = -1;', 'MIDI stop reset');

requiredReplace('      const url = URL.createObjectURL(file);\n      const duration = await probeDuration(url);', '      const url = URL.createObjectURL(file);\n      const assetId = await saveStudioAsset(file, file.name);\n      const duration = await probeDuration(url);', 'persist import');
requiredReplace('      imported.push(makeAudioTrack(name, url, duration, inferredKind));', "      const importedTrack = makeAudioTrack(name, url, duration, inferredKind);\n      importedTrack.clips[0].assetId = assetId || undefined;\n      imported.push(importedTrack);", 'persist imported asset id');

requiredReplace('        const url = URL.createObjectURL(blob);\n        void probeDuration(url).then(rawDuration => {', "        const url = URL.createObjectURL(blob);\n        void saveStudioAsset(blob, `recording-${Date.now()}.webm`).then(assetId => {\n        void probeDuration(url).then(rawDuration => {", 'persist recording open');
const recordedClipAnchor = `              takeNumber,\n              muted: false\n            };`;
requiredReplace(recordedClipAnchor, `              takeNumber,\n              muted: false,\n              assetId: assetId || undefined\n            };`, 'recorded asset id');
requiredReplace('          setAssistantNotice(`Take ${highestTake} registrata: ${formatTime(clipDuration)}. Waveform reale in analisi e take pronta per il comp.`);\n        });', '          setAssistantNotice(`Take ${highestTake} registrata: ${formatTime(clipDuration)}. Waveform reale in analisi e take pronta per il comp.`);\n        });\n        });', 'persist recording close');

const saveStart = source.indexOf('  const saveProject = () => {');
const assistantStart = source.indexOf('  const runAssistant = () => {', saveStart);
if (saveStart < 0 || assistantStart < 0) {
  console.error('[SONARA] Studio real engine v2 failed: save/assistant block not found.');
  process.exit(1);
}
const saveReplacement = `  const saveProject = () => {\n    setSaving(true);\n    try {\n      const serializableTracks = tracks.map(track => ({ ...track, clips: track.clips.map(clip => ({ ...clip, src: clip.assetId ? '' : (clip.src?.startsWith('blob:') ? '' : clip.src) })) }));\n      const project = { version: 6, name: projectName, bpm, keySignature, tracks: serializableTracks, markers, quantize, metronome, countInBars, masterVolume, input: { selectedInputId, inputGainDb, monitoring, latencyMode }, punch: { punchEnabled, punchIn, punchOut }, savedAt: new Date().toISOString() };\n      localStorage.setItem('sonara.studio.project.v6', JSON.stringify(project));\n      setAssistantNotice('Sessione Studio Pro salvata con audio persistente, MIDI reale, editing, DSP e comping.');\n    } catch { setAssistantNotice('Impossibile salvare la sessione sul dispositivo.'); }\n    finally { window.setTimeout(() => setSaving(false), 350); }\n  };\n\n  useEffect(() => {\n    if (restoredProjectRef.current || audioUrl) return;\n    restoredProjectRef.current = true;\n    let project: any = null; try { project = JSON.parse(localStorage.getItem('sonara.studio.project.v6') || 'null'); } catch {}\n    if (!project || !Array.isArray(project.tracks)) return;\n    void (async () => {\n      const restored: Track[] = [];\n      for (const track of project.tracks as Track[]) {\n        const clips: Clip[] = [];\n        for (const clip of track.clips || []) {\n          let src = clip.src || '';\n          if (clip.assetId) { const blob = await loadStudioAsset(clip.assetId); if (blob) src = URL.createObjectURL(blob); }\n          clips.push({ ...clip, src });\n        }\n        restored.push({ ...track, clips });\n      }\n      setProjectName(String(project.name || 'SONARA Project')); setTracks(restored); setMarkers(Array.isArray(project.markers) ? project.markers : []); setMasterVolume(Number(project.masterVolume ?? 0.92)); setMetronome(Boolean(project.metronome)); setCountInBars([0,1,2].includes(project.countInBars) ? project.countInBars : 1);\n      if (restored[0]) { setSelectedTrackId(restored[0].id); setSelectedClipId(restored[0].clips[0]?.id || ''); }\n      restored.flatMap(track => track.clips).filter(clip => clip.src && clip.kind !== 'midi').forEach(clip => void hydrateSource(String(clip.src)));\n      setAssistantNotice('Sessione Studio Pro ripristinata con asset audio persistenti.');\n    })();\n  }, [audioUrl]);\n\n`;
source = source.slice(0, saveStart) + saveReplacement + source.slice(assistantStart);

optionalReplace('applicati nel render offline', 'applicati in playback live e nel render');
optionalReplace('Studio AI Bar', 'Studio Command Bar');
optionalReplace('<span className="text-[8px] text-slate-700">BETA</span>', '<span className="text-[8px] text-emerald-500">LIVE</span>');
optionalReplace('<span>48 kHz render</span><span>32-bit float export</span>', '<span>DSP LIVE</span><span>MIDI NOTE ENGINE</span><span>48 kHz render</span><span>32-bit float export</span>');

fs.writeFileSync(file, source);
console.log('[SONARA] Studio real engine v2 activated: live DSP, live automation, MIDI notes, persistent local audio assets and SONARA CORS routing.');
