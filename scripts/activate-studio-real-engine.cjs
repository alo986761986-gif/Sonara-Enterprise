const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/components/studio/SonaraStudio.tsx');
let source = fs.readFileSync(file, 'utf8');
const MARKER = 'SONARA_STUDIO_REAL_ENGINE_V1';
if (source.includes(MARKER)) {
  console.log('[SONARA] Studio real engine already active.');
  process.exit(0);
}

function replace(anchor, replacement, label) {
  if (!source.includes(anchor)) {
    console.error(`[SONARA] Studio real engine activation failed: ${label} anchor not found.`);
    process.exit(1);
  }
  source = source.replace(anchor, replacement);
}

replace(
  "import { audioBufferToWav, decodeAudioFromUrl, downloadBlob, safeAudioFilename } from '../production/audioUtils';",
  "import { audioBufferToWav, decodeAudioFromUrl, downloadBlob, safeAudioFilename } from '../production/audioUtils';\nimport { createStudioReverbImpulse, loadStudioAsset, midiNoteFrequency, parseMidiFile, saveStudioAsset, type StudioMidiNote } from './studioRealEngine';",
  'helper import'
);

replace(
  "  muted?: boolean;\n};",
  "  muted?: boolean;\n  assetId?: string;\n  midiNotes?: StudioMidiNote[];\n};",
  'clip fields'
);

replace(
  "type ClipAudioGraph = {\n  source: MediaElementAudioSourceNode;\n  gain: GainNode;\n  panner: StereoPannerNode;\n};",
  "type ClipAudioGraph = {\n  source: MediaElementAudioSourceNode;\n  gain: GainNode;\n  low: BiquadFilterNode;\n  mid: BiquadFilterNode;\n  high: BiquadFilterNode;\n  compressor: DynamicsCompressorNode;\n  dry: GainNode;\n  convolver: ConvolverNode;\n  wet: GainNode;\n  panner: StereoPannerNode;\n};",
  'live graph type'
);

replace(
  "  const recordingPunchRef = useRef<PunchSnapshot>({ enabled: false, punchIn: 0, punchOut: 16 });",
  "  const recordingPunchRef = useRef<PunchSnapshot>({ enabled: false, punchIn: 0, punchOut: 16 });\n  const midiScheduledRef = useRef(new Set<string>());\n  const restoredProjectRef = useRef(false);\n  // ${MARKER}",
  'real engine refs'
);

const importMidiOld = `  const importMidi = (files: FileList | null) => {\n    if (!files?.length) return;\n    pushHistory();\n    const next = Array.from(files).filter(file => /\\.(mid|midi)$/i.test(file.name)).map(file => ({\n      ...makeMidiTrack(file.name.replace(/\\.(mid|midi)$/i, '')),\n      clips: [{ id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0, duration: 16, fadeIn: 0, fadeOut: 0, kind: 'midi' as TrackKind }]\n    }));\n    setTracks(current => [...current, ...next]);\n    setAssistantNotice(next.length ? \`${'${next.length}'} traccia/e MIDI aggiunte alla timeline.\` : 'Nessun file MIDI valido selezionato.');\n  };`;
const importMidiNew = `  const importMidi = async (files: FileList | null) => {\n    if (!files?.length) return;\n    const midiFiles = Array.from(files).filter(file => /\\.(mid|midi)$/i.test(file.name));\n    if (!midiFiles.length) { setAssistantNotice('Nessun file MIDI valido selezionato.'); return; }\n    pushHistory();\n    const next: Track[] = [];\n    for (const file of midiFiles) {\n      try {\n        const parsed = await parseMidiFile(file);\n        const track = makeMidiTrack(file.name.replace(/\\.(mid|midi)$/i, ''));\n        track.clips = [{\n          id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0,\n          duration: Math.max(0.1, parsed.duration), fadeIn: 0, fadeOut: 0, kind: 'midi', midiNotes: parsed.notes\n        }];\n        next.push(track);\n      } catch (error) {\n        setAssistantNotice(error instanceof Error ? error.message : String(error));\n      }\n    }\n    if (next.length) {\n      setTracks(current => [...current, ...next]);\n      setSelectedTrackId(next[0].id);\n      setSelectedClipId(next[0].clips[0].id);\n      setAssistantNotice(\`${'${next.length}'} traccia/e MIDI importate con note reali e pronte per il playback.\`);\n    }\n  };`;
replace(importMidiOld, importMidiNew, 'real MIDI import');

replace(
  "<input ref={midiInputRef} type=\"file\" multiple accept=\".mid,.midi,audio/midi,audio/x-midi\" className=\"hidden\" onChange={event => importMidi(event.target.files)} />",
  "<input ref={midiInputRef} type=\"file\" multiple accept=\".mid,.midi,audio/midi,audio/x-midi\" className=\"hidden\" onChange={event => void importMidi(event.target.files)} />",
  'MIDI async handler'
);

const graphOld = `            const source = context.createMediaElementSource(audio);\n            const gain = context.createGain();\n            const panner = context.createStereoPanner();\n            source.connect(gain).connect(panner).connect(master);\n            clipGraphs.current.set(clip.id, { source, gain, panner });`;
const graphNew = `            const source = context.createMediaElementSource(audio);\n            const gain = context.createGain();\n            const low = context.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;\n            const mid = context.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1600; mid.Q.value = 0.8;\n            const high = context.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 7000;\n            const compressor = context.createDynamicsCompressor();\n            const dry = context.createGain(); dry.gain.value = 1;\n            const convolver = context.createConvolver(); convolver.buffer = createStudioReverbImpulse(context);\n            const wet = context.createGain();\n            const panner = context.createStereoPanner();\n            source.connect(gain).connect(low).connect(mid).connect(high).connect(compressor);\n            compressor.connect(dry).connect(panner);\n            compressor.connect(convolver).connect(wet).connect(panner);\n            panner.connect(master);\n            clipGraphs.current.set(clip.id, { source, gain, low, mid, high, compressor, dry, convolver, wet, panner });`;
replace(graphOld, graphNew, 'live DSP graph');

const graphUpdateOld = `          audio.volume = 1;\n          graph.gain.gain.value = track.volume;\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);`;
const graphUpdateNew = `          audio.volume = 1;\n          graph.gain.gain.value = track.volume;\n          graph.low.gain.value = track.low;\n          graph.mid.gain.value = track.mid;\n          graph.high.gain.value = track.high;\n          graph.compressor.threshold.value = -8 - track.compression * 0.34;\n          graph.compressor.knee.value = 20;\n          graph.compressor.ratio.value = 1 + track.compression * 0.08;\n          graph.compressor.attack.value = 0.008;\n          graph.compressor.release.value = 0.2;\n          graph.wet.gain.value = clamp(track.reverb / 100, 0, 0.5);\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);`;
replace(graphUpdateOld, graphUpdateNew, 'prepare DSP values');

const syncGraphOld = `        if (graph) {\n          graph.gain.gain.value = track.volume * fade;\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);\n        } else {`;
const syncGraphNew = `        if (graph) {\n          let automatedVolume = track.volume;\n          if (track.automation.length) {\n            const points = [...track.automation].sort((a, b) => a.time - b.time);\n            const before = [...points].reverse().find(point => point.time <= time);\n            const after = points.find(point => point.time > time);\n            if (before && after) {\n              const ratio = clamp((time - before.time) / Math.max(0.001, after.time - before.time), 0, 1);\n              automatedVolume = before.value + (after.value - before.value) * ratio;\n            } else if (before) automatedVolume = before.value;\n            else if (after) automatedVolume = after.value;\n          }\n          graph.gain.gain.value = automatedVolume * fade;\n          graph.low.gain.value = track.low;\n          graph.mid.gain.value = track.mid;\n          graph.high.gain.value = track.high;\n          graph.compressor.threshold.value = -8 - track.compression * 0.34;\n          graph.compressor.ratio.value = 1 + track.compression * 0.08;\n          graph.wet.gain.value = clamp(track.reverb / 100, 0, 0.5);\n          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);\n        } else {`;
replace(syncGraphOld, syncGraphNew, 'live automation and DSP sync');

const beforeStopRecorder = `  const stopRecorderOnly = () => {`;
const midiScheduler = `  const scheduleMidiAt = (time: number) => {\n    const context = audioContextRef.current;\n    const master = masterGainNodeRef.current;\n    if (!context || !master) return;\n    for (const track of tracks) {\n      if (track.kind !== 'midi' || track.mute || (anySolo && !track.solo)) continue;\n      for (const clip of track.clips) {\n        if (!clip.midiNotes?.length || time < clip.start || time >= clip.start + clip.duration) continue;\n        const local = time - clip.start;\n        for (let index = 0; index < clip.midiNotes.length; index += 1) {\n          const note = clip.midiNotes[index];\n          if (note.start < local || note.start > local + 0.08) continue;\n          const key = \`${'${clip.id}:${index}:${Math.floor(note.start * 1000)}'}\`;\n          if (midiScheduledRef.current.has(key)) continue;\n          midiScheduledRef.current.add(key);\n          const osc = context.createOscillator();\n          const gain = context.createGain();\n          const pan = context.createStereoPanner();\n          osc.type = 'sawtooth';\n          osc.frequency.value = midiNoteFrequency(note.note + track.pitch);\n          const when = context.currentTime + Math.max(0, note.start - local);\n          const end = when + Math.max(0.03, note.duration);\n          gain.gain.setValueAtTime(0.0001, when);\n          gain.gain.exponentialRampToValueAtTime(Math.max(0.002, note.velocity * track.volume * 0.22), when + 0.008);\n          gain.gain.exponentialRampToValueAtTime(0.0001, end);\n          pan.pan.value = clamp(track.pan / 100, -1, 1);\n          osc.connect(gain).connect(pan).connect(master);\n          osc.start(when); osc.stop(end + 0.02);\n        }\n      }\n    }\n  };\n\n  ${beforeStopRecorder}`;
replace(beforeStopRecorder, midiScheduler, 'MIDI scheduler');

replace(
  "      syncClips(next);\n      if (metronome) {",
  "      syncClips(next);\n      scheduleMidiAt(next);\n      if (metronome) {",
  'MIDI transport'
);
replace(
  "    playingClips.current.clear();\n    lastMetronomeBeatRef.current = -1;",
  "    playingClips.current.clear();\n    midiScheduledRef.current.clear();\n    lastMetronomeBeatRef.current = -1;",
  'MIDI scheduler reset'
);

replace(
  "      const url = URL.createObjectURL(file);\n      const duration = await probeDuration(url);",
  "      const url = URL.createObjectURL(file);\n      const assetId = await saveStudioAsset(file, file.name);\n      const duration = await probeDuration(url);",
  'persist imported audio'
);
replace(
  "      imported.push(makeAudioTrack(name, url, duration, inferredKind));",
  "      const importedTrack = makeAudioTrack(name, url, duration, inferredKind);\n      importedTrack.clips[0].assetId = assetId || undefined;\n      imported.push(importedTrack);",
  'store imported asset id'
);

replace(
  "        const url = URL.createObjectURL(blob);\n        void probeDuration(url).then(rawDuration => {",
  "        const url = URL.createObjectURL(blob);\n        void saveStudioAsset(blob, `recording-${Date.now()}.webm`).then(assetId => {\n        void probeDuration(url).then(rawDuration => {",
  'persist recording start'
);
replace(
  "              muted: false\n            };",
  "              muted: false,\n              assetId: assetId || undefined\n            };",
  'persist recording clip'
);
replace(
  "          setAssistantNotice(`Take ${highestTake} registrata: ${formatTime(clipDuration)}. Waveform reale in analisi e take pronta per il comp.`);\n        });",
  "          setAssistantNotice(`Take ${highestTake} registrata: ${formatTime(clipDuration)}. Waveform reale in analisi e take pronta per il comp.`);\n        });\n        });",
  'persist recording close'
);

const saveOld = `  const saveProject = () => {\n    setSaving(true);\n    try {\n      const project = {\n        version: 5,\n        name: projectName,\n        bpm,\n        keySignature,\n        tracks,\n        markers,\n        quantize,\n        metronome,\n        countInBars,\n        masterVolume,\n        input: { selectedInputId, inputGainDb, monitoring, latencyMode },\n        punch: { punchEnabled, punchIn, punchOut },\n        savedAt: new Date().toISOString()\n      };\n      localStorage.setItem('sonara.studio.project.v5', JSON.stringify(project));\n      setAssistantNotice('Sessione Studio Pro v5 salvata con waveform, fade e comping.');\n    } catch {\n      setAssistantNotice('Impossibile salvare la sessione sul dispositivo.');\n    } finally {\n      window.setTimeout(() => setSaving(false), 350);\n    }\n  };`;
const saveNew = `  const saveProject = () => {\n    setSaving(true);\n    try {\n      const serializableTracks = tracks.map(track => ({\n        ...track,\n        clips: track.clips.map(clip => ({\n          ...clip,\n          src: clip.assetId ? '' : (clip.src?.startsWith('blob:') ? '' : clip.src)\n        }))\n      }));\n      const project = {\n        version: 6, name: projectName, bpm, keySignature, tracks: serializableTracks, markers, quantize,\n        metronome, countInBars, masterVolume, input: { selectedInputId, inputGainDb, monitoring, latencyMode },\n        punch: { punchEnabled, punchIn, punchOut }, savedAt: new Date().toISOString()\n      };\n      localStorage.setItem('sonara.studio.project.v6', JSON.stringify(project));\n      setAssistantNotice('Sessione Studio Pro salvata con audio persistente, MIDI reale, editing, DSP e comping.');\n    } catch {\n      setAssistantNotice('Impossibile salvare la sessione sul dispositivo.');\n    } finally { window.setTimeout(() => setSaving(false), 350); }\n  };\n\n  useEffect(() => {\n    if (restoredProjectRef.current || audioUrl) return;\n    restoredProjectRef.current = true;\n    let project: any = null;\n    try { project = JSON.parse(localStorage.getItem('sonara.studio.project.v6') || 'null'); } catch {}\n    if (!project || !Array.isArray(project.tracks)) return;\n    void (async () => {\n      const restored: Track[] = [];\n      for (const track of project.tracks as Track[]) {\n        const clips: Clip[] = [];\n        for (const clip of track.clips || []) {\n          let src = clip.src || '';\n          if (clip.assetId) {\n            const blob = await loadStudioAsset(clip.assetId);\n            if (blob) src = URL.createObjectURL(blob);\n          }\n          clips.push({ ...clip, src });\n        }\n        restored.push({ ...track, clips });\n      }\n      setProjectName(String(project.name || 'SONARA Project'));\n      setTracks(restored);\n      setMarkers(Array.isArray(project.markers) ? project.markers : []);\n      setMasterVolume(Number(project.masterVolume ?? 0.92));\n      setMetronome(Boolean(project.metronome));\n      setCountInBars([0,1,2].includes(project.countInBars) ? project.countInBars : 1);\n      if (restored[0]) { setSelectedTrackId(restored[0].id); setSelectedClipId(restored[0].clips[0]?.id || ''); }\n      restored.flatMap(track => track.clips).filter(clip => clip.src && clip.kind !== 'midi').forEach(clip => void hydrateSource(String(clip.src)));\n      setAssistantNotice('Sessione Studio Pro ripristinata con asset audio persistenti.');\n    })();\n  }, [audioUrl]);`;
replace(saveOld, saveNew, 'persistent project save/restore');

replace(
  "<span className=\"text-[9px] text-slate-500\">{selectedTrack.automation.length} punti · applicati nel render offline</span>",
  "<span className=\"text-[9px] text-slate-500\">{selectedTrack.automation.length} punti · applicati in playback live e nel render</span>",
  'automation truth label'
);
replace(
  "<div className=\"flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-purple-300\"><Bot className=\"h-3.5 w-3.5\" /> Studio AI Bar</div><span className=\"text-[8px] text-slate-700\">BETA</span>",
  "<div className=\"flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-purple-300\"><Bot className=\"h-3.5 w-3.5\" /> Studio Command Bar</div><span className=\"text-[8px] text-emerald-500\">LIVE</span>",
  'command bar truthful label'
);
replace(
  "<span>48 kHz render</span><span>32-bit float export</span>",
  "<span>DSP LIVE</span><span>MIDI NOTE ENGINE</span><span>48 kHz render</span><span>32-bit float export</span>",
  'real engine footer'
);

fs.writeFileSync(file, source);
console.log('[SONARA] Studio real live DSP, MIDI playback and persistent project assets activated.');
