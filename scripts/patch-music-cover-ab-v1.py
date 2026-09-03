from pathlib import Path

GEN = Path('src/components/generator/ElevenMusicGenerationControl.tsx')
VAULT = Path('src/services/generatedAssetVault.ts')
FIXED = Path('src/components/player/SonaraProfessionalFixedPlayer.tsx')
BRIDGE = Path('src/components/player/SonaraUniversalPlayerBridge.tsx')
DEPLOY = Path('.github/workflows/deploy-sonara-music-director-v3.yml')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=MARKER_NOT_FOUND')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_generator():
    text = GEN.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "import { Check, Download, Pause, Play, RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';",
        "import { Check, Download, Image as ImageIcon, Pause, Play, RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';",
        'GEN_IMPORT_IMAGE'
    )

    text = replace_once(
        text,
        "  audioUrl: string;\n  audioFormat: string;\n  jobId: string;\n  error: string;",
        "  audioUrl: string;\n  audioFormat: string;\n  coverDataUrl: string;\n  coverMime: string;\n  coverFormat: string;\n  coverPrompt: string;\n  coverStatus: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';\n  coverError: string;\n  coverRevision: number;\n  jobId: string;\n  error: string;",
        'GEN_CANDIDATE_COVER_FIELDS'
    )

    text = replace_once(
        text,
        "  audioUrl: '',\n  audioFormat: 'mp3',\n  jobId: '',\n  error: ''",
        "  audioUrl: '',\n  audioFormat: 'mp3',\n  coverDataUrl: '',\n  coverMime: 'image/webp',\n  coverFormat: 'webp',\n  coverPrompt: '',\n  coverStatus: 'IDLE',\n  coverError: '',\n  coverRevision: 0,\n  jobId: '',\n  error: ''",
        'GEN_EMPTY_COVER_FIELDS'
    )

    marker = "type JobResponse = {"
    cover_type = """type CoverResponse = {
  coverDataUrl?: string;
  coverMime?: string;
  coverFormat?: string;
  coverPrompt?: string;
  variationId?: CandidateId;
  error?: { code?: string; message?: string } | string;
};

"""
    if cover_type not in text:
        text = text.replace(marker, cover_type + marker, 1)
        print('GEN_COVER_RESPONSE=PATCHED')

    state_old = """  const [selected, setSelected] = useState<CandidateId | null>(null);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<CandidateState[]>([empty('A'), empty('B')]);"""
    state_new = """  const [selected, setSelected] = useState<CandidateId | null>(null);
  const [error, setError] = useState('');
  const [autoCover, setAutoCover] = useState(true);
  const [coverStyle, setCoverStyle] = useState('auto');
  const [coverTextMode, setCoverTextMode] = useState('none');
  const [candidates, setCandidates] = useState<CandidateState[]>([empty('A'), empty('B')]);"""
    text = replace_once(text, state_old, state_new, 'GEN_COVER_SETTINGS_STATE')

    processing_marker = """  const processing = (jobId: string, progress: number, stage: string) => {
    setCandidates(previous => previous.map(item => item.audioUrl ? item : ({ ...item, status: 'PROCESSING', progress, stage, jobId })));
  };

"""
    cover_functions = """  const generateCover = async (
    candidateId: CandidateId,
    context: Context,
    generationId: string,
    token: string,
    revision = 0
  ) => {
    setCandidates(previous => previous.map(item => item.id === candidateId
      ? { ...item, coverStatus: 'PROCESSING', coverError: '', coverRevision: revision }
      : item));
    try {
      const response = await fetch('/api/music-cover/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rawPrompt: context.rawPrompt,
          title: context.title,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          bpm: context.bpm,
          keySignature: context.keySignature,
          vocalMode: context.vocalMode,
          variationId: candidateId,
          generationPairId: generationId,
          style: coverStyle,
          textMode: coverTextMode,
          revision
        })
      });
      const payload = await readJson<CoverResponse>(response);
      if (!response.ok || !payload.coverDataUrl) {
        const message = typeof payload.error === 'string'
          ? payload.error
          : payload.error?.message || `Copertina ${candidateId} non generata (HTTP ${response.status}).`;
        throw new Error(message);
      }
      setCandidates(previous => previous.map(item => item.id === candidateId ? {
        ...item,
        coverDataUrl: String(payload.coverDataUrl),
        coverMime: String(payload.coverMime || 'image/webp'),
        coverFormat: String(payload.coverFormat || 'webp'),
        coverPrompt: String(payload.coverPrompt || ''),
        coverStatus: 'COMPLETED',
        coverError: '',
        coverRevision: revision
      } : item));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCandidates(previous => previous.map(item => item.id === candidateId
        ? { ...item, coverStatus: 'FAILED', coverError: message, coverRevision: revision }
        : item));
    }
  };

  const regenerateCover = async (candidate: CandidateState) => {
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    if (!textarea) return;
    try {
      const context = readContext(textarea);
      const token = await getFirebaseIdToken(true);
      const stored = localStorage.getItem('sonara.lastGenerationPairId');
      const generationId = stored || `cover-${Date.now()}`;
      await generateCover(candidate.id, context, generationId, token, candidate.coverRevision + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCandidates(previous => previous.map(item => item.id === candidate.id ? { ...item, coverStatus: 'FAILED', coverError: message } : item));
    }
  };

  const downloadCover = (candidate: CandidateState) => {
    if (!candidate.coverDataUrl) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = 'sonara-track';
    try { if (textarea) title = readContext(textarea).title; } catch {}
    const link = document.createElement('a');
    link.href = candidate.coverDataUrl;
    link.download = `${safeFileName(title)}-${candidate.id}-cover.${candidate.coverFormat || 'webp'}`.toLowerCase();
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

"""
    if cover_functions not in text:
        if processing_marker not in text:
            raise SystemExit('GEN_COVER_FUNCTIONS=MARKER_NOT_FOUND')
        text = text.replace(processing_marker, processing_marker + cover_functions, 1)
        print('GEN_COVER_FUNCTIONS=PATCHED')

    completed_old = """    const completed = outputs.slice(0, 2).map((output, index) => ({
      id: (index === 0 ? 'A' : 'B') as CandidateId,
      status: 'COMPLETED' as const,
      progress: 100,
      stage: `Master ${index === 0 ? 'A' : 'B'} pronto`,
      audioUrl: String(output.audioUrl),
      audioFormat: String(output.audioFormat || 'mp3').toLowerCase(),
      jobId,
      error: ''
    }));

    // The generation is finished as soon as the playable masters are available.
    // Archiving the audio and refreshing billing are secondary tasks and must never
    // keep the Generate button spinning after the user can already play the tracks.
    setCandidates(completed);"""
    completed_new = """    const completed = outputs.slice(0, 2).map((output, index) => ({
      id: (index === 0 ? 'A' : 'B') as CandidateId,
      status: 'COMPLETED' as const,
      progress: 100,
      stage: `Master ${index === 0 ? 'A' : 'B'} pronto`,
      audioUrl: String(output.audioUrl),
      audioFormat: String(output.audioFormat || 'mp3').toLowerCase(),
      jobId,
      error: ''
    }));

    // Audio and cover generation are parallel. Preserve any cover that completed
    // while the music engine was rendering instead of overwriting its state here.
    setCandidates(previous => completed.map(candidate => {
      const existing = previous.find(item => item.id === candidate.id) || empty(candidate.id);
      return { ...existing, ...candidate };
    }));"""
    text = replace_once(text, completed_old, completed_new, 'GEN_PRESERVE_COVER_ON_AUDIO_COMPLETE')

    archive_old = """      primaryAudioUrl: candidate.audioUrl,
      audioFormat: candidate.audioFormat,
      response: {"""
    archive_new = """      primaryAudioUrl: candidate.audioUrl,
      audioFormat: candidate.audioFormat,
      primaryImageUrl: candidate.coverDataUrl || undefined,
      imageFormat: candidate.coverFormat || undefined,
      response: {"""
    text = replace_once(text, archive_old, archive_new, 'GEN_ARCHIVE_COVER')

    generation_old = """      const token = await getFirebaseIdToken(true);
      const generationId = crypto.randomUUID ? crypto.randomUUID() : `generation-${Date.now()}`;
      processing('', 8, 'SONARA: generazione dei 2 master');

      const response = await fetch('/api/billing/generate', {"""
    generation_new = """      const token = await getFirebaseIdToken(true);
      const generationId = crypto.randomUUID ? crypto.randomUUID() : `generation-${Date.now()}`;
      localStorage.setItem('sonara.lastGenerationPairId', generationId);
      processing('', 8, autoCover ? 'SONARA: audio + copertine A/B in parallelo' : 'SONARA: generazione dei 2 master');

      if (autoCover) {
        void generateCover('A', context, generationId, token, 0);
        void generateCover('B', context, generationId, token, 0);
      }

      const response = await fetch('/api/billing/generate', {"""
    text = replace_once(text, generation_old, generation_new, 'GEN_PARALLEL_COVER_START')

    choose_old = """    const detail = { variationId: candidate.id, jobId: candidate.jobId, audioUrl: candidate.audioUrl, audioFormat: candidate.audioFormat, selectedAt: new Date().toISOString() };"""
    choose_new = """    const detail = { variationId: candidate.id, jobId: candidate.jobId, audioUrl: candidate.audioUrl, audioFormat: candidate.audioFormat, coverUrl: candidate.coverDataUrl, title: `SONARA Master ${candidate.id}`, selectedAt: new Date().toISOString() };"""
    text = replace_once(text, choose_old, choose_new, 'GEN_SELECTION_COVER')

    render_old = """  return createPortal(
    <div className="mt-6 space-y-4">
      <button type="button" onClick={() => void generate()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />SONARA STA GENERANDO...</> : <><Sparkles className="h-5 w-5" />GENERA 2 BRANI</>}
      </button>"""
    render_new = """  return createPortal(
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span><strong className="block text-[10px] text-zinc-100">Genera copertine automaticamente</strong><small className="text-[8px] text-zinc-500">A + B insieme all'audio</small></span>
          <input type="checkbox" checked={autoCover} onChange={event => setAutoCover(event.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <label className="flex items-center gap-2 text-[9px] text-zinc-400">STILE
          <select value={coverStyle} onChange={event => setCoverStyle(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200">
            <option value="auto">Auto</option><option value="cinematic">Cinematica</option><option value="realistic">Realistica</option><option value="abstract">Astratta</option><option value="minimal">Minimal</option><option value="futuristic">Futuristica</option><option value="dark">Dark</option><option value="tropical">Tropical</option><option value="retro">Retro</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[9px] text-zinc-400">TESTO
          <select value={coverTextMode} onChange={event => setCoverTextMode(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200">
            <option value="none">Nessuno</option><option value="title">Titolo</option>
          </select>
        </label>
      </div>
      <button type="button" onClick={() => void generate()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />SONARA STA GENERANDO AUDIO + COVER...</> : <><Sparkles className="h-5 w-5" />GENERA A + B · AUDIO + COVER</>}
      </button>"""
    text = replace_once(text, render_old, render_new, 'GEN_COVER_CONTROLS_UI')

    completed_render_old = """                {completed && (
                  <ProfessionalCandidatePlayer
                    candidate={candidate}
                    chosen={chosen}
                    onChoose={() => choose(candidate)}
                    onDownload={() => void download(candidate)}
                  />
                )}"""
    completed_render_new = """                {completed && (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                      <div className="relative aspect-square overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-[#101019] to-blue-950/60 shadow-lg shadow-purple-950/20" data-sonara-candidate-cover={candidate.id}>
                        {candidate.coverDataUrl ? (
                          <img src={candidate.coverDataUrl} alt={`Copertina Master ${candidate.id}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center p-4 text-center">
                            {candidate.coverStatus === 'PROCESSING' ? <RefreshCw className="h-7 w-7 animate-spin text-violet-300" /> : <ImageIcon className="h-8 w-8 text-zinc-600" />}
                            <span className="absolute bottom-3 left-3 right-3 text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-500">{candidate.coverStatus === 'PROCESSING' ? 'CREAZIONE COVER' : 'COVER NON DISPONIBILE'}</span>
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[8px] font-black tracking-[0.12em] text-white backdrop-blur">MASTER {candidate.id}</span>
                      </div>
                      <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                        <div>
                          <div className="text-lg font-black tracking-tight text-white">{(() => { try { const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null; return textarea ? readContext(textarea).title : `SONARA MASTER ${candidate.id}`; } catch { return `SONARA MASTER ${candidate.id}`; } })()}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">AUDIO + COVER · identità visiva coordinata A/B</div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void download(candidate)} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[9px] font-black text-zinc-200 hover:bg-white/[0.08]"><Download className="h-3.5 w-3.5" />SCARICA {candidate.audioFormat.toUpperCase()}</button>
                          <button type="button" onClick={() => downloadCover(candidate)} disabled={!candidate.coverDataUrl} className="inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[9px] font-black text-violet-100 disabled:opacity-35"><ImageIcon className="h-3.5 w-3.5" />SCARICA COVER</button>
                          <button type="button" onClick={() => void regenerateCover(candidate)} disabled={candidate.coverStatus === 'PROCESSING'} className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[9px] font-black text-blue-100 disabled:opacity-35"><RefreshCw className={`h-3.5 w-3.5 ${candidate.coverStatus === 'PROCESSING' ? 'animate-spin' : ''}`} />RIGENERA COPERTINA</button>
                        </div>
                        {candidate.coverError && <div className="mt-3 text-[9px] text-amber-300">Cover: {candidate.coverError}</div>}
                      </div>
                    </div>
                    <ProfessionalCandidatePlayer
                      candidate={candidate}
                      chosen={chosen}
                      onChoose={() => choose(candidate)}
                      onDownload={() => void download(candidate)}
                    />
                  </>
                )}"""
    text = replace_once(text, completed_render_old, completed_render_new, 'GEN_COVER_CARD_UI')

    GEN.write_text(text, encoding='utf-8')


def patch_vault():
    text = VAULT.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "  primaryAudioUrl?: string;\n  audioFormat?: string;\n  response: unknown;",
        "  primaryAudioUrl?: string;\n  audioFormat?: string;\n  primaryImageUrl?: string;\n  imageFormat?: string;\n  response: unknown;",
        'VAULT_IMAGE_INPUT'
    )
    old = """  if (input.primaryAudioUrl) {
    candidateMap.set(input.primaryAudioUrl, {
      url: input.primaryAudioUrl,
      label: 'Master audio',
      formatHint: input.audioFormat || 'wav'
    });
  }

  const candidates = [...candidateMap.values()];"""
    new = """  if (input.primaryAudioUrl) {
    candidateMap.set(input.primaryAudioUrl, {
      url: input.primaryAudioUrl,
      label: 'Master audio',
      formatHint: input.audioFormat || 'wav'
    });
  }
  if (input.primaryImageUrl) {
    candidateMap.set(input.primaryImageUrl, {
      url: input.primaryImageUrl,
      label: 'Cover artwork',
      formatHint: input.imageFormat || 'webp'
    });
  }

  const candidates = [...candidateMap.values()];"""
    text = replace_once(text, old, new, 'VAULT_ARCHIVE_COVER')
    VAULT.write_text(text, encoding='utf-8')


def patch_fixed_player():
    text = FIXED.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "  audioFormat?: string;\n  title?: string;",
        "  audioFormat?: string;\n  title?: string;\n  coverUrl?: string;",
        'FIXED_TRACK_COVER_FIELD'
    )
    text = replace_once(
        text,
        """          <button type="button" className="sonara-pro-player-art" onClick={openLibrary} aria-label="Open SONARA Library">
            <Music2 />
            <i />
          </button>""",
        """          <button type="button" className="sonara-pro-player-art" onClick={openLibrary} aria-label="Open SONARA Library">
            {activeTrack?.coverUrl ? <img src={activeTrack.coverUrl} alt="Copertina brano selezionato" className="h-full w-full object-cover" /> : <Music2 />}
            <i />
          </button>""",
        'FIXED_RENDER_COVER'
    )
    FIXED.write_text(text, encoding='utf-8')


def patch_bridge():
    text = BRIDGE.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "  title: string;\n  variationId?: string;",
        "  title: string;\n  coverUrl?: string;\n  variationId?: string;",
        'BRIDGE_TRACK_COVER_FIELD'
    )
    text = replace_once(
        text,
        """  const id = `generated-${variationId || absoluteUrl(audioUrl)}`;
  return {
    id,
    audioUrl,
    audioFormat: audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'audio',
    title: variationId ? `SONARA Master ${variationId}` : 'SONARA generated track',
    variationId,
    source: 'generated'
  };""",
        """  const id = `generated-${variationId || absoluteUrl(audioUrl)}`;
  const article = audio.closest('article');
  const cover = article?.querySelector<HTMLImageElement>('[data-sonara-candidate-cover] img')?.src || '';
  return {
    id,
    audioUrl,
    audioFormat: audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'audio',
    title: variationId ? `SONARA Master ${variationId}` : 'SONARA generated track',
    coverUrl: cover,
    variationId,
    source: 'generated'
  };""",
        'BRIDGE_SCAN_COVER'
    )
    text = replace_once(
        text,
        """    title: track.title,
    source: track.source,""",
        """    title: track.title,
    coverUrl: track.coverUrl,
    source: track.source,""",
        'BRIDGE_SELECTION_DETAIL_COVER'
    )
    text = replace_once(
        text,
        """          title: detail.title || 'SONARA Track',
          variationId: detail.variationId,""",
        """          title: detail.title || 'SONARA Track',
          coverUrl: detail.coverUrl,
          variationId: detail.variationId,""",
        'BRIDGE_PLAY_TRACK_COVER'
    )
    text = replace_once(
        text,
        """        title: detail.title || (detail.variationId ? `SONARA Master ${detail.variationId}` : 'SONARA Track'),
        variationId: detail.variationId,""",
        """        title: detail.title || (detail.variationId ? `SONARA Master ${detail.variationId}` : 'SONARA Track'),
        coverUrl: detail.coverUrl,
        variationId: detail.variationId,""",
        'BRIDGE_EVENT_COVER'
    )
    BRIDGE.write_text(text, encoding='utf-8')


def patch_deploy():
    text = DEPLOY.read_text(encoding='utf-8')
    if 'api/music-cover/generate.ts' not in text:
        anchor = '      - "src/components/generator/ElevenMusicGenerationControl.tsx"\n'
        if anchor not in text:
            raise SystemExit('DEPLOY_COVER_PATH=MARKER_NOT_FOUND')
        text = text.replace(anchor, '      - "api/music-cover/generate.ts"\n' + anchor, 1)
        print('DEPLOY_COVER_PATH=PATCHED')
    guard_anchor = """      - name: Guard visible volume controls
        run: |
          grep -Fq 'VOLUME {candidate.id}' src/components/generator/ElevenMusicGenerationControl.tsx
          grep -Fq 'sonara-pro-volume-label' src/components/player/SonaraProfessionalFixedPlayer.tsx
"""
    guard_new = guard_anchor + """
      - name: Guard integrated A B cover generation
        run: |
          grep -Fq "'/api/music-cover/generate'" src/components/generator/ElevenMusicGenerationControl.tsx
          grep -Fq 'SCARICA COVER' src/components/generator/ElevenMusicGenerationControl.tsx
          grep -Fq 'RIGENERA COPERTINA' src/components/generator/ElevenMusicGenerationControl.tsx
          grep -Fq 'coverUrl' src/components/player/SonaraProfessionalFixedPlayer.tsx
          grep -Fq 'OPENAI_IMAGES_URL' api/music-cover/generate.ts
"""
    if 'Guard integrated A B cover generation' not in text:
        if guard_anchor not in text:
            raise SystemExit('DEPLOY_COVER_GUARD=MARKER_NOT_FOUND')
        text = text.replace(guard_anchor, guard_new, 1)
        print('DEPLOY_COVER_GUARD=PATCHED')
    DEPLOY.write_text(text, encoding='utf-8')


patch_generator()
patch_vault()
patch_fixed_player()
patch_bridge()
patch_deploy()
print('SONARA_MUSIC_COVER_AB_V1=PATCHED')
