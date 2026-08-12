import { StabilityProvider, GenerationPayload } from '../providers/StabilityProvider';
import { JobManager } from '../jobs/JobManager';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { FirebaseStorageService } from '../storage/FirebaseStorage';
import { AudioAnalyzer } from './AudioAnalyzer';
import { MixingMasteringEngineService } from './MixingMasteringEngineService';
import { AceStepEngine } from '../engine/AceStepEngine';
import fs from 'fs';
import path from 'path';

let jobCounter = 1000;
let projCounter = 500;

export class MusicGenerationService {
  public static validateAudioBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 100000) return false;
    const isWav = buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WAVE';
    const isMp3 = buffer.toString('utf8', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0);
    return isWav || isMp3;
  }

  public static createFallbackAudio(
    titleStr: string = 'Sonara Track',
    durationSec: number = 30,
    targetBpm: number = 128
  ): { audioBuffer: Buffer; audioPath: string } {
    const outputDir = path.join(process.cwd(), 'output', `dsp_fallback_${Date.now()}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const audioPath = path.join(outputDir, 'audio.wav');

    const sampleRate = 44100;
    const numChannels = 2;
    const bitsPerSample = 16;
    const numFrames = sampleRate * durationSec;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = Buffer.alloc(bufferSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // AudioFormat = PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * blockAlign, 28); // ByteRate
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // --- MATHEMATICAL GRID QUANTIZATION ENGINE ---
    const bpm = Math.max(60, Math.min(200, targetBpm));
    const samplesPerBeat = (sampleRate * 60.0) / bpm;
    const samplesPerTick = samplesPerBeat / 4.0; // 16th note grid
    const samplesPerBar = samplesPerBeat * 4.0;   // 4/4 bar anchor

    // Phase accumulators to prevent frequency modulation pitch drift and clicks
    let kickPhase = 0;
    let bassPhase = 0;
    let leadPhase = 0;

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      // Sample-exact grid quantization math
      const tickIndex = Math.floor(i / samplesPerTick);
      const tickSampleOffset = i % samplesPerTick;
      const tickPhase = tickSampleOffset / samplesPerTick; // [0, 1) within 16th note

      const beatIndex = Math.floor(i / samplesPerBeat);
      const beatSampleOffset = i % samplesPerBeat;
      const beatPhase = beatSampleOffset / samplesPerBeat; // [0, 1) within beat

      const barIndex = Math.floor(i / samplesPerBar);

      // Section energy modifier based on bar position
      const totalBars = Math.max(1, Math.floor(numFrames / samplesPerBar));
      const sectionProgress = barIndex / totalBars;

      let kickWeight = 0.45;
      let snareWeight = 0.30;
      let hihatWeight = 0.20;
      let bassWeight = 0.35;
      let leadWeight = 0.25;

      if (sectionProgress < 0.15) {
        // Intro: Filtered rhythm
        kickWeight = 0.25; snareWeight = 0.0; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.10;
      } else if (sectionProgress < 0.35) {
        // Verse: Driving groove
        kickWeight = 0.40; snareWeight = 0.25; hihatWeight = 0.20; bassWeight = 0.30; leadWeight = 0.15;
      } else if (sectionProgress < 0.75) {
        // Chorus: Peak Energy
        kickWeight = 0.50; snareWeight = 0.35; hihatWeight = 0.25; bassWeight = 0.35; leadWeight = 0.30;
      } else if (sectionProgress < 0.88) {
        // Breakdown: Ambient melody focus
        kickWeight = 0.0; snareWeight = 0.10; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.40;
      } else {
        // Outro: Stripped beat
        kickWeight = 0.30; snareWeight = 0.0; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.10;
      }

      // 1. Kick Drum (Sample-locked on beats 0, 1, 2, 3)
      const kickEnv = Math.exp(-15.0 * beatPhase);
      const kickFreq = 45.0 + 75.0 * kickEnv;
      kickPhase += (2.0 * Math.PI * kickFreq) / sampleRate;
      const kickSignal = Math.sin(kickPhase) * kickEnv * kickWeight;

      // 2. Snare Drum (Sample-locked on beats 2 & 4)
      const isSnareBeat = (beatIndex % 2) === 1;
      const snareEnv = isSnareBeat ? Math.exp(-18.0 * beatPhase) : 0.0;
      const snareNoise = (Math.sin(i * 0.1) * 0.5 + Math.sin(2.0 * Math.PI * 220.0 * (beatSampleOffset / sampleRate)) * 0.5);
      const snareSignal = snareNoise * snareEnv * snareWeight;

      // 3. Hi-Hat (Sample-locked to 16th-note tick grid)
      const is16thTick = tickIndex % 2 === 1;
      const hihatEnv = Math.exp(-35.0 * tickPhase);
      const hihatNoise = Math.sin(i * 0.77);
      const hihatSignal = hihatNoise * hihatEnv * (is16thTick ? hihatWeight * 1.2 : hihatWeight * 0.7);

      // 4. Bassline (Locked to 16th tick & 4-bar progression: C -> G -> Am -> F)
      const chordIdx = barIndex % 4;
      const bassFreqs = [130.81, 98.00, 110.00, 87.31]; // C3, G2, A2, F2
      const currentBassFreq = bassFreqs[chordIdx];
      bassPhase += (2.0 * Math.PI * currentBassFreq) / sampleRate;
      const bassEnv = Math.exp(-7.0 * tickPhase);
      const bassSignal = (Math.sin(bassPhase) + 0.3 * Math.sin(bassPhase * 2.0)) * bassEnv * bassWeight;

      // 5. Lead Arpeggio (16th Note Arpeggio synchronized with beat and tick indices)
      const arpNotes = [currentBassFreq * 2.0, currentBassFreq * 2.5, currentBassFreq * 3.0, currentBassFreq * 4.0];
      const currentLeadFreq = arpNotes[tickIndex % 4];
      leadPhase += (2.0 * Math.PI * currentLeadFreq) / sampleRate;
      const leadEnv = Math.exp(-12.0 * tickPhase);
      const leadSignal = Math.sin(leadPhase) * leadEnv * leadWeight;

      // Mid-Side Stereo Mix & Peak Ceiling (-1.0 dBTP = 0.891)
      const leftMix = kickSignal + snareSignal + (hihatSignal * 0.8) + bassSignal + (leadSignal * 1.15);
      const rightMix = kickSignal + snareSignal + (hihatSignal * 1.2) + bassSignal + (leadSignal * 0.85);

      const ceiling = 0.891;
      const clampedL = Math.max(-ceiling, Math.min(ceiling, leftMix));
      const clampedR = Math.max(-ceiling, Math.min(ceiling, rightMix));

      const leftVal = Math.floor(clampedL * 32767);
      const rightVal = Math.floor(clampedR * 32767);

      buffer.writeInt16LE(leftVal, offset);
      buffer.writeInt16LE(rightVal, offset + 2);
      offset += 4;
    }

    // Pass through Professional Mix & Master Engine
    const { processedBuffer, report } = MixingMasteringEngineService.processBuffer(buffer, -14.0, -1.0, bpm);

    fs.writeFileSync(audioPath, processedBuffer);
    console.log(`[ENTERPRISE_LOG] [DSP_MIX_MASTER_ENGINE] Applied Mix & Master (-14 LUFS, -1.0 dBTP, Phase Corr: ${report.stereoPhaseCorrelation}): ${audioPath}`);
    return { audioBuffer: processedBuffer, audioPath };
  }

  private static extractUserDirection(promptStr: string): string {
    const prompt = String(promptStr || '').trim();
    if (!prompt) return '';

    // AceStepPromptEngine currently wraps the user text in a pipe-delimited
    // optimization envelope. For neural generation we keep the actual user
    // direction, but rebuild the genre instructions from the selected UI genre
    // so stale/mixed genre tags cannot steer ACE-Step away from the selection.
    if (prompt.includes('[SONARA V12 ACE-STEP]') && prompt.includes(' | Style Elements:')) {
      const beforeStyleElements = prompt.split(' | Style Elements:')[0];
      const fields = beforeStyleElements.split(' | ');
      if (fields.length >= 4) {
        return fields.slice(3).join(' | ').trim();
      }
    }

    return prompt;
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static sanitizeCompetingHouseStyles(userDirection: string, selectedGenre: string): string {
    const selected = selectedGenre.trim().toLowerCase();
    let cleaned = String(userDirection || '');

    const houseStyles = [
      'Afro Tech House', 'Progressive House', 'Melodic House', 'Organic House',
      'Soulful House', 'Tropical House', 'Minimal House', 'Electro House',
      'Big Room House', 'Future House', 'Garage House', 'Tribal House',
      'Deep House', 'Tech House', 'Afro House', 'Funky House', 'Disco House',
      'French House', 'Filter House', 'Jackin House', 'Chicago House',
      'Acid House', 'Detroit House', 'Latin House', 'Bass House', 'Slap House',
      'Piano House', 'Vocal House', 'Lo-Fi House', 'Microhouse', 'Hard House',
      'Speed House', 'Techno House', 'Balearic House', 'Ibiza House',
      'Beach House', 'Amapiano House', 'Kwaito House', 'G-House'
    ];

    if (!selected.includes('house')) return cleaned.trim();

    for (const styleName of houseStyles) {
      if (styleName.toLowerCase() === selected) continue;
      cleaned = cleaned.replace(new RegExp(`\\b${this.escapeRegExp(styleName)}\\b`, 'gi'), ' ');
    }

    return cleaned
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*(?:and|with|,|-)+\s*/i, '')
      .replace(/\b(?:and|with)\s*(?=,|\.|$)/gi, '')
      .replace(/\s+([,.])/g, '$1')
      .trim();
  }

  private static genreFingerprint(genreStr: string): string[] {
    const genre = genreStr.trim().toLowerCase();

    if (genre.includes('afro tech house')) {
      return ['deep tech-house kick', 'rolling sub bass', 'Afro polyrhythmic percussion', 'congas and shakers', 'hypnotic dark club groove', 'minimal melodic content'];
    }
    if (genre.includes('tribal house')) {
      return ['dominant tribal percussion', 'layered congas and bongos', 'toms and shakers', 'syncopated polyrhythmic groove', 'deep four-on-the-floor kick', 'repetitive hypnotic club arrangement'];
    }
    if (genre.includes('tech house')) {
      return ['dry punchy four-on-the-floor kick', 'rolling percussive bassline', 'tight syncopated percussion', 'open hats', 'short funky stabs', 'minimal club-tool arrangement'];
    }
    if (genre.includes('deep house')) {
      return ['warm round sub bass', 'soulful Rhodes chords', 'mellow four-on-the-floor kick', 'shuffled hats', 'dubby atmospheric pads', 'smooth late-night groove'];
    }
    if (genre.includes('afro house')) {
      return ['organic African percussion', 'congas and djembes', 'deep warm bass', 'hypnotic shaker patterns', 'spiritual atmospheric pads', 'rolling dancefloor groove'];
    }
    if (genre.includes('organic house')) {
      return ['warm organic percussion', 'natural plucked instruments', 'soft four-on-the-floor kick', 'rounded bass', 'earthy melodic textures', 'spacious flowing arrangement'];
    }
    if (genre.includes('melodic house')) {
      return ['emotional minor-key harmony', 'layered synth arpeggios', 'sidechained bass', 'clean four-on-the-floor kick', 'wide atmospheric pads', 'progressive melodic development'];
    }
    if (genre.includes('progressive house')) {
      return ['driving four-on-the-floor groove', 'long tension-and-release build', 'layered synth progression', 'controlled sidechained bass', 'evolving automation', 'large club arrangement'];
    }
    if (genre.includes('soulful house')) {
      return ['soulful piano or Rhodes chords', 'warm grooving bassline', 'classic house drums', 'gospel-influenced harmony', 'smooth percussion', 'uplifting club groove'];
    }
    if (genre.includes('funky house') || genre.includes('jackin house')) {
      return ['funky syncopated bassline', 'punchy house kick', 'disco-influenced chord stabs', 'claps and open hats', 'sample-driven groove', 'energetic dancefloor swing'];
    }
    if (genre.includes('disco house') || genre.includes('french house') || genre.includes('filter house')) {
      return ['disco-derived groove', 'filtered sample-style chords', 'funky bassline', 'steady house kick', 'bright open hats', 'sidechained pumping feel'];
    }
    if (genre.includes('acid house')) {
      return ['303-style acid bass sequence', 'classic house drum machine groove', 'four-on-the-floor kick', 'resonant filter movement', 'raw repetitive club structure', 'minimal harmonic clutter'];
    }
    if (genre.includes('latin house')) {
      return ['Latin percussion', 'congas and timbales', 'syncopated house groove', 'warm bassline', 'four-on-the-floor kick', 'bright rhythmic stabs'];
    }
    if (genre.includes('minimal house') || genre.includes('microhouse')) {
      return ['minimal four-on-the-floor kick', 'micro-edited percussion', 'subtle bass groove', 'sparse stabs', 'small rhythmic variations', 'restrained hypnotic arrangement'];
    }
    if (genre.includes('piano house')) {
      return ['bright house piano chords', 'steady four-on-the-floor kick', 'grooving bassline', 'open hats and claps', 'uplifting chord rhythm', 'clean club arrangement'];
    }
    if (genre === 'house' || genre.endsWith(' house')) {
      return ['classic four-on-the-floor kick', 'grooving bassline', 'offbeat open hi-hats', 'syncopated percussion', 'house chord stabs', 'club-focused arrangement'];
    }

    return [
      `unmistakable ${genreStr} rhythm and instrumentation`,
      `genre-authentic ${genreStr} drum programming`,
      `genre-authentic ${genreStr} bass movement`,
      `genre-authentic ${genreStr} arrangement`,
      'coherent production with no stylistic drift'
    ];
  }

  private static buildStrictGenrePrompt(
    promptStr: string,
    genreStr: string,
    moodStr: string,
    bpm: number
  ): string {
    const exactGenre = String(genreStr || 'House').trim() || 'House';
    const rawUserDirection = this.extractUserDirection(promptStr);
    const userDirection = this.sanitizeCompetingHouseStyles(rawUserDirection, exactGenre);
    const fingerprint = this.genreFingerprint(exactGenre).join(', ');

    return [
      `PRIMARY GENRE: ${exactGenre}.`,
      `STRICT GENRE LOCK: make the track unmistakably ${exactGenre}; the selected genre must dominate the rhythm, bass, percussion, harmony and arrangement.`,
      `TEMPO: exactly ${bpm} BPM.`,
      `CORE ${exactGenre.toUpperCase()} FINGERPRINT: ${fingerprint}.`,
      moodStr ? `MOOD / ATMOSPHERE: ${moodStr}.` : '',
      userDirection ? `USER DIRECTION: ${userDirection}.` : '',
      `Maintain ${exactGenre} identity from beginning to end. Avoid stylistic drift or hybridization unless the user explicitly requests it after the selected genre.`
    ].filter(Boolean).join(' ');
  }

  public static async executePythonEngine(
    promptStr: string,
    genreStr: string,
    moodStr: string,
    lyricsStr: string,
    titleStr: string,
    timeoutMs: number = 30000,
    durationSec: number = 15,
    bpm: number = 128
  ): Promise<{ audioBuffer: Buffer | null; audioPath: string | null; metadata: Record<string, any> | null }> {
    const engine = AceStepEngine.getInstance();

    // ACE-Step Turbo speed profile for long renders on a T4.
    // Short clips keep the full 8-step profile; 2-4 minute tracks use fewer
    // denoising steps so long-form generation finishes materially faster.
    const inferenceSteps = durationSec >= 120 ? 6 : 8;
    const strictGenrePrompt = this.buildStrictGenrePrompt(promptStr, genreStr, moodStr, bpm);

    console.log(
      `[ENTERPRISE_LOG] [ACE_STEP_FAST_PROFILE] ${durationSec}s render -> ${inferenceSteps} inference steps, batch 1, guidance 1.0`
    );
    console.log(
      `[ENTERPRISE_LOG] [ACE_STEP_GENRE_LOCK] Exact selected genre: ${genreStr} | BPM: ${bpm}`
    );

    const result = await engine.generate({
      prompt: strictGenrePrompt,
      genre: genreStr,
      mood: moodStr,
      lyrics: lyricsStr,
      title: titleStr,
      timeoutMs,
      durationSec,
      bpm,
      inferenceSteps,
      guidanceScale: 1.0,
      batchSize: 1,
      thinking: false
    });

    return {
      audioBuffer: result.audioBuffer,
      audioPath: result.audioPath,
      metadata: result.metadata || { status: result.status, error: result.error }
    };
  }

  static async processGeneration(payload: GenerationPayload, userId: string): Promise<Record<string, any>> {
    jobCounter++;
    projCounter++;
    const jobId = `job_gen_${Date.now()}_${jobCounter}`;

    console.log(`[ENTERPRISE_LOG] [MUSIC_GEN_SERVICE] Enqueuing Generation Request | JobId: ${jobId} | User: ${userId}`);

    // Enqueue in enterprise JobQueueWorker
    const jobRecord = JobQueueWorker.enqueueJob(jobId, payload, userId, 30000);

    // Wait for worker completion (up to 30s timeout)
    const completedJob = await JobQueueWorker.waitForCompletion(jobId, 30000);

    if (completedJob && completedJob.status === 'COMPLETED') {
      return {
        jobId: completedJob.jobId,
        status: completedJob.status,
        audioUrl: completedJob.audioUrl,
        metadata: completedJob.metadata
      };
    } else {
      return {
        jobId: jobId,
        status: completedJob ? completedJob.status : 'QUEUED',
        audioUrl: completedJob?.audioUrl || null,
        metadata: completedJob?.metadata || { error: completedJob?.error || 'Job processing timeout' }
      };
    }
  }
}
