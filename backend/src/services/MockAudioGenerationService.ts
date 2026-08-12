import {
  PatternGenerationResult,
  PatternGeneratorService
} from './PatternGeneratorService';

export interface MockAudioGenerationParams {
  durationSec: number;
  bpm: number;
  genre?: string;
  mood?: string;
  prompt?: string;
}

export interface MockAudioGenerationResult {
  audioBuffer: Buffer;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationSec: number;
  profileName: string;
  patternKey: string;
}

type GenreFamily =
  | 'HOUSE'
  | 'TECHNO'
  | 'TRANCE'
  | 'DNB'
  | 'BASS'
  | 'HIPHOP'
  | 'TRAP'
  | 'JAZZ'
  | 'BLUES'
  | 'ROCK'
  | 'POP'
  | 'RNB'
  | 'DISCO'
  | 'REGGAE'
  | 'LATIN'
  | 'AFRO'
  | 'COUNTRY'
  | 'AMBIENT'
  | 'CINEMATIC';

type ChordMode = 'PAD' | 'STAB' | 'COMP' | 'OFFBEAT' | 'POWER';
type LeadMode = 'NONE' | 'MELODY' | 'ARP' | 'ACID';

interface LocalGenreProfile {
  name: string;
  family: GenreFamily;
  patternKey: string;
  chordMode: ChordMode;
  leadMode: LeadMode;
  kickAmount: number;
  snareAmount: number;
  hatAmount: number;
  percussionAmount: number;
  bassAmount: number;
  chordAmount: number;
  leadAmount: number;
  delayMix: number;
  drive: number;
  bassWave: number;
  chordWave: number;
  leadWave: number;
  bassDecay: number;
  brightness: number;
}

interface ArrangementState {
  kick: number;
  snare: number;
  hats: number;
  percussion: number;
  bass: number;
  chords: number;
  lead: number;
}

interface ParsedChord {
  rootMidi: number;
  notes: number[];
}

export class MockAudioGenerationService {
  private static readonly SAMPLE_RATE = 44_100;
  private static readonly CHANNELS = 2;
  private static readonly BIT_DEPTH = 16;
  private static readonly TABLE_SIZE = 2048;

  public static generate(params: MockAudioGenerationParams): MockAudioGenerationResult {
    const durationSec = Math.max(1, Math.min(240, Number(params.durationSec || 15)));
    const bpm = Math.max(40, Math.min(260, Number(params.bpm || 124)));
    const sampleRate = this.SAMPLE_RATE;
    const channels = this.CHANNELS;
    const bytesPerSample = this.BIT_DEPTH / 8;
    const totalFrames = Math.floor(durationSec * sampleRate);
    const dataSize = totalFrames * channels * bytesPerSample;
    const buffer = Buffer.allocUnsafe(44 + dataSize);

    this.writeWavHeader(buffer, dataSize, sampleRate, channels, this.BIT_DEPTH);

    const descriptor = `${params.genre || ''} ${params.mood || ''} ${params.prompt || ''}`.toLowerCase();
    const genreSeed = this.hashString(descriptor || 'sonara-local-v2');
    const atmosphere = this.resolveAtmosphere(descriptor);
    const profile = this.resolveGenreProfile(params.genre || '', descriptor, atmosphere);
    const pattern = this.buildPattern(profile, genreSeed);
    const sineTable = this.createSineTable();

    const progression = pattern.chordProgression.length > 0
      ? pattern.chordProgression
      : ['Am7', 'Fmaj7', 'Cmaj7', 'G7'];
    const melodyMidi = this.scaleToMidi(pattern.melodyScale);

    const baseStepFrames = sampleRate * 60 / bpm / 4;
    const totalBars = Math.max(1, durationSec * bpm / (60 * 4));
    const swing = Math.min(0.32, Math.max(0, pattern.swingPct / 100));

    const delaySeconds = Math.max(0.11, Math.min(0.48, (60 / bpm) * 0.72));
    const delayFrames = Math.max(1, Math.floor(sampleRate * delaySeconds));
    const delayLeft = new Float32Array(delayFrames);
    const delayRight = new Float32Array(delayFrames);
    const delayMix = Math.max(0, Math.min(0.42, profile.delayMix + atmosphere.space));
    const delayFeedback = 0.22 + atmosphere.space * 0.28;
    let delayIndex = 0;

    let noiseState = (genreSeed || 1) >>> 0;
    let previousNoise = 0;

    let globalStep = 0;
    let currentStep = -1;
    let currentBar = -1;
    let stepPhase = 0;
    let stepIncrement = 1 / baseStepFrames;

    let arrangement: ArrangementState = {
      kick: 1,
      snare: 1,
      hats: 1,
      percussion: 1,
      bass: 1,
      chords: 1,
      lead: 1
    };

    let kickVelocity = 0;
    let snareVelocity = 0;
    let hatVelocity = 0;
    let percussionVelocity = 0;
    let chordVelocity = 0;
    let leadVelocity = 0;

    let bassEnvelope = 0;
    let bassFrequency = 65;
    let bassPhase = 0;
    let kickPhase = 0;
    let snareTonePhase = 0;
    let percussionPhase = 0;
    let leadPhase = 0;
    let leadFrequency = 440;

    const chordPhases = [0, 0, 0, 0];
    let chordFrequencies = [220, 261.63, 329.63, 392];
    let currentChordRootMidi = 48;

    let offset = 44;

    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (globalStep !== currentStep) {
        currentStep = globalStep;
        const stepInBar = globalStep % 16;
        const barIndex = Math.floor(globalStep / 16);

        const swingStretch = globalStep % 2 === 0
          ? 1 - swing * 0.22
          : 1 + swing * 0.22;
        stepIncrement = 1 / (baseStepFrames * swingStretch);

        if (barIndex !== currentBar) {
          currentBar = barIndex;
          arrangement = this.arrangementForBar(barIndex, totalBars, profile.family);

          const parsedChord = this.parseChord(progression[barIndex % progression.length]);
          currentChordRootMidi = parsedChord.rootMidi;
          chordFrequencies = parsedChord.notes
            .slice(0, 4)
            .map(note => this.midiToHz(note));

          while (chordFrequencies.length < 4) {
            chordFrequencies.push(chordFrequencies[chordFrequencies.length - 1] * 2);
          }
        }

        kickVelocity = (pattern.rhythm.kick[stepInBar] || 0)
          * profile.kickAmount
          * arrangement.kick;
        snareVelocity = (pattern.rhythm.snare[stepInBar] || 0)
          * profile.snareAmount
          * arrangement.snare;
        hatVelocity = (pattern.rhythm.hihat[stepInBar] || 0)
          * profile.hatAmount
          * arrangement.hats
          * atmosphere.brightness;
        percussionVelocity = (pattern.rhythm.percussion[stepInBar] || 0)
          * profile.percussionAmount
          * arrangement.percussion
          * atmosphere.percussion;

        const bassTrigger = (pattern.rhythm.bass[stepInBar] || 0)
          * profile.bassAmount
          * arrangement.bass;
        if (bassTrigger > 0.02) {
          bassEnvelope = Math.max(bassEnvelope, Math.min(1, bassTrigger));
          const bassOffset = this.bassNoteOffset(profile.family, stepInBar, globalStep, genreSeed);
          bassFrequency = this.midiToHz(currentChordRootMidi - 12 + bassOffset);
        }

        chordVelocity = this.chordTrigger(profile.chordMode, stepInBar)
          * profile.chordAmount
          * arrangement.chords;

        leadVelocity = this.leadTrigger(profile.leadMode, stepInBar, globalStep, genreSeed)
          * profile.leadAmount
          * arrangement.lead
          * atmosphere.lead;

        if (leadVelocity > 0.01 && melodyMidi.length > 0) {
          const melodyIndex = Math.abs(globalStep * 5 + (genreSeed % 17)) % melodyMidi.length;
          let leadMidi = melodyMidi[melodyIndex];
          if (profile.family === 'TRANCE' || profile.family === 'DNB') leadMidi += 12;
          if (profile.family === 'JAZZ' && stepInBar % 8 === 6) leadMidi -= 5;
          leadFrequency = this.midiToHz(leadMidi);
        }
      }

      noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
      const noise = (noiseState / 0xffffffff) * 2 - 1;
      const highNoise = noise - previousNoise * 0.82;
      previousNoise = noise;

      const kickEnv = kickVelocity > 0
        ? Math.max(0, 1 - stepPhase * 10) ** 2
        : 0;
      const kickFrequency = 43 + 82 * kickEnv;
      kickPhase = this.wrapPhase(kickPhase + kickFrequency / sampleRate);
      const kick = this.oscillator(kickPhase, 0, sineTable)
        * kickEnv
        * kickVelocity
        * 0.82;

      const snareEnv = snareVelocity > 0
        ? Math.max(0, 1 - stepPhase * 7.5) ** 2
        : 0;
      snareTonePhase = this.wrapPhase(snareTonePhase + 185 / sampleRate);
      const snare = (
        noise * 0.72 +
        this.oscillator(snareTonePhase, 1, sineTable) * 0.28
      ) * snareEnv * snareVelocity * 0.48;

      const hatEnv = hatVelocity > 0
        ? Math.max(0, 1 - stepPhase * 22) ** 2
        : 0;
      const hat = highNoise * hatEnv * hatVelocity * 0.22;

      const percussionEnv = percussionVelocity > 0
        ? Math.max(0, 1 - stepPhase * 11) ** 2
        : 0;
      const percussionFrequency = 145 + ((globalStep % 4) * 34);
      percussionPhase = this.wrapPhase(percussionPhase + percussionFrequency / sampleRate);
      const percussion = (
        this.oscillator(percussionPhase, 1, sineTable) * 0.72 + noise * 0.28
      ) * percussionEnv * percussionVelocity * 0.28;

      bassPhase = this.wrapPhase(bassPhase + bassFrequency / sampleRate);
      const bassOsc = this.oscillator(bassPhase, profile.bassWave, sineTable);
      const bass = bassOsc * bassEnvelope * 0.42;
      bassEnvelope *= profile.bassDecay;
      if (bassEnvelope < 0.0005) bassEnvelope = 0;

      let chordOsc = 0;
      for (let index = 0; index < 4; index += 1) {
        chordPhases[index] = this.wrapPhase(
          chordPhases[index] + chordFrequencies[index] / sampleRate
        );
        const noteWeight = index === 0 ? 1 : index === 1 ? 0.8 : index === 2 ? 0.66 : 0.5;
        chordOsc += this.oscillator(chordPhases[index], profile.chordWave, sineTable) * noteWeight;
      }
      chordOsc /= 2.96;

      const chordEnv = this.chordEnvelope(profile.chordMode, stepPhase, chordVelocity);
      const sidechainDuck = 1 - Math.min(0.48, kickEnv * kickVelocity * 0.48);
      const chord = chordOsc * chordEnv * sidechainDuck * 0.32;

      leadPhase = this.wrapPhase(leadPhase + leadFrequency / sampleRate);
      const leadEnv = leadVelocity > 0
        ? Math.max(0, 1 - stepPhase * (profile.leadMode === 'ARP' ? 4.5 : 2.7))
        : 0;
      let lead = this.oscillator(leadPhase, profile.leadWave, sineTable)
        * leadEnv
        * leadVelocity
        * 0.22;

      if (profile.leadMode === 'ACID') {
        const acidPulse = this.oscillator(this.wrapPhase(leadPhase * 2), 3, sineTable);
        lead = (lead * 0.72 + acidPulse * leadEnv * leadVelocity * 0.08);
      }

      const subtleNoise = noise * atmosphere.noiseFloor;
      const tonal = bass + chord + lead;
      const drums = kick + snare + hat + percussion;
      const dryMono = drums + tonal + subtleNoise;

      const panMotion = this.oscillator(
        this.wrapPhase((frame / sampleRate) * 0.085),
        1,
        sineTable
      ) * 0.075;
      const percPan = globalStep % 2 === 0 ? -0.08 : 0.08;
      const dryLeft = dryMono + chord * panMotion - percussion * percPan + lead * 0.035;
      const dryRight = dryMono - chord * panMotion + percussion * percPan - lead * 0.035;

      const delayedLeft = delayLeft[delayIndex];
      const delayedRight = delayRight[delayIndex];
      delayLeft[delayIndex] = dryLeft * 0.62 + delayedRight * delayFeedback;
      delayRight[delayIndex] = dryRight * 0.62 + delayedLeft * delayFeedback;
      delayIndex += 1;
      if (delayIndex >= delayFrames) delayIndex = 0;

      const wetLeft = dryLeft + delayedLeft * delayMix;
      const wetRight = dryRight + delayedRight * delayMix;
      const masterDrive = profile.drive + atmosphere.drive;
      const left = this.softClip(wetLeft, masterDrive) * 0.92;
      const right = this.softClip(wetRight, masterDrive) * 0.92;

      buffer.writeInt16LE(Math.round(left * 32767), offset);
      buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
      offset += 4;

      stepPhase += stepIncrement;
      if (stepPhase >= 1) {
        stepPhase -= 1;
        globalStep += 1;
      }
    }

    return {
      audioBuffer: buffer,
      sampleRate,
      channels,
      bitDepth: this.BIT_DEPTH,
      durationSec,
      profileName: profile.name,
      patternKey: profile.patternKey
    };
  }

  private static resolveGenreProfile(
    genre: string,
    descriptor: string,
    atmosphere: ReturnType<typeof MockAudioGenerationService.resolveAtmosphere>
  ): LocalGenreProfile {
    const g = genre.toLowerCase();
    const text = `${g} ${descriptor}`;

    const base = (overrides: Partial<LocalGenreProfile>): LocalGenreProfile => ({
      name: 'Sonara Local',
      family: 'HOUSE',
      patternKey: 'melodic house',
      chordMode: 'STAB',
      leadMode: 'MELODY',
      kickAmount: 0.95,
      snareAmount: 0.78,
      hatAmount: 0.72,
      percussionAmount: 0.52,
      bassAmount: 0.86,
      chordAmount: 0.72,
      leadAmount: 0.22,
      delayMix: 0.11,
      drive: 1.02,
      bassWave: 4,
      chordWave: 1,
      leadWave: 2,
      bassDecay: 0.99986,
      brightness: 1,
      ...overrides
    });

    if (text.includes('jazz')) {
      return base({
        name: 'Jazz / Nu-Jazz Local Band', family: 'JAZZ', patternKey: 'lo-fi',
        chordMode: 'COMP', leadMode: 'MELODY', kickAmount: 0.45, snareAmount: 0.48,
        hatAmount: 0.48, percussionAmount: 0.28, bassAmount: 0.72, chordAmount: 0.9,
        leadAmount: 0.42, delayMix: 0.14, drive: 0.88, bassWave: 0, chordWave: 0,
        leadWave: 0, bassDecay: 0.9999, brightness: 0.78
      });
    }

    if (text.includes('blues')) {
      return base({
        name: 'Blues Local Band', family: 'BLUES', patternKey: 'hip hop',
        chordMode: 'COMP', leadMode: 'MELODY', kickAmount: 0.62, snareAmount: 0.66,
        hatAmount: 0.52, percussionAmount: 0.2, bassAmount: 0.76, chordAmount: 0.76,
        leadAmount: 0.48, delayMix: 0.1, drive: 0.96, bassWave: 1, chordWave: 1,
        leadWave: 2, bassDecay: 0.99988, brightness: 0.8
      });
    }

    if (text.includes('deep house')) {
      return base({
        name: 'Deep House Local Club', family: 'HOUSE', patternKey: 'deep house',
        chordMode: 'STAB', leadMode: 'MELODY', bassAmount: 0.92, chordAmount: 0.82,
        leadAmount: 0.18, delayMix: 0.16, drive: 0.98, bassWave: 4,
        chordWave: 0, brightness: 0.82
      });
    }
    if (text.includes('tech house')) {
      return base({
        name: 'Tech House Local Club', family: 'HOUSE', patternKey: 'tech house',
        chordMode: 'STAB', leadMode: text.includes('acid') ? 'ACID' : 'NONE',
        kickAmount: 1, bassAmount: 0.98, chordAmount: 0.36, leadAmount: 0.2,
        percussionAmount: 0.72, delayMix: 0.07, drive: 1.12, bassWave: 2,
        chordWave: 3, brightness: 1.05
      });
    }
    if (text.includes('afro house')) {
      return base({
        name: 'Afro House Local Percussion', family: 'AFRO', patternKey: 'afro house',
        chordMode: 'STAB', leadMode: 'MELODY', percussionAmount: 1,
        bassAmount: 0.9, chordAmount: 0.62, leadAmount: 0.3, delayMix: 0.16,
        drive: 0.98, bassWave: 0, chordWave: 1, brightness: 0.88
      });
    }
    if (text.includes('organic house')) {
      return base({
        name: 'Organic House Local Ensemble', family: 'AFRO', patternKey: 'organic house',
        chordMode: 'PAD', leadMode: 'MELODY', percussionAmount: 0.9,
        bassAmount: 0.76, chordAmount: 0.82, leadAmount: 0.32, delayMix: 0.2,
        drive: 0.9, bassWave: 0, chordWave: 0, brightness: 0.82
      });
    }
    if (text.includes('progressive house')) {
      return base({
        name: 'Progressive House Local Stage', family: 'HOUSE', patternKey: 'progressive house',
        chordMode: 'PAD', leadMode: 'ARP', chordAmount: 0.86, leadAmount: 0.48,
        delayMix: 0.22, drive: 1.02, bassWave: 2, chordWave: 2,
        leadWave: 2, brightness: 1.08
      });
    }
    if (text.includes('melodic house')) {
      return base({
        name: 'Melodic House Local Stage', family: 'HOUSE', patternKey: 'melodic house',
        chordMode: 'PAD', leadMode: 'MELODY', chordAmount: 0.86, leadAmount: 0.4,
        delayMix: 0.22, drive: 0.98, bassWave: 4, chordWave: 0, brightness: 0.9
      });
    }

    if (text.includes('techno')) {
      return base({
        name: 'Techno Local Machine', family: 'TECHNO', patternKey: 'techno',
        chordMode: 'STAB', leadMode: text.includes('acid') ? 'ACID' : 'ARP',
        kickAmount: 1.08, snareAmount: 0.68, hatAmount: 0.85,
        percussionAmount: 0.78, bassAmount: 0.98, chordAmount: 0.22,
        leadAmount: 0.26, delayMix: 0.08, drive: 1.22, bassWave: 2,
        chordWave: 3, leadWave: 2, bassDecay: 0.99982, brightness: 1.08
      });
    }

    if (text.includes('trance')) {
      return base({
        name: 'Trance Local Arpeggiator', family: 'TRANCE', patternKey: 'trance',
        chordMode: 'PAD', leadMode: 'ARP', kickAmount: 1, hatAmount: 0.82,
        bassAmount: 0.9, chordAmount: 0.86, leadAmount: 0.68, delayMix: 0.28,
        drive: 1.03, bassWave: 2, chordWave: 2, leadWave: 2, brightness: 1.18
      });
    }

    if (text.includes('drum & bass') || text.includes('drum and bass') || text.includes('dnb') || text.includes('jungle')) {
      return base({
        name: 'Drum & Bass Local Break Engine', family: 'DNB', patternKey: 'drum & bass',
        chordMode: 'PAD', leadMode: 'ARP', kickAmount: 0.92, snareAmount: 1,
        hatAmount: 0.88, percussionAmount: 0.58, bassAmount: 1, chordAmount: 0.5,
        leadAmount: 0.3, delayMix: 0.12, drive: 1.18, bassWave: 2,
        chordWave: 0, leadWave: 2, bassDecay: 0.99986, brightness: 1.12
      });
    }

    if (text.includes('dubstep') || text.includes('garage') || text.includes('bass music') || text.includes('future bass')) {
      return base({
        name: 'Bass / Garage Local Engine', family: 'BASS', patternKey: 'trap',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.92, snareAmount: 0.95,
        hatAmount: 0.72, percussionAmount: 0.42, bassAmount: 1.08, chordAmount: 0.58,
        leadAmount: 0.34, delayMix: 0.18, drive: 1.2, bassWave: 2,
        chordWave: 2, leadWave: 2, bassDecay: 0.99992, brightness: 1.05
      });
    }

    if (text.includes('trap') || text.includes('drill') || text.includes('phonk')) {
      return base({
        name: 'Trap / Drill Local 808', family: 'TRAP', patternKey: 'trap',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.9, snareAmount: 1,
        hatAmount: 0.88, percussionAmount: 0.48, bassAmount: 1.08, chordAmount: 0.5,
        leadAmount: 0.28, delayMix: 0.13, drive: 1.12, bassWave: 0,
        chordWave: 0, leadWave: 3, bassDecay: 0.99996, brightness: 0.98
      });
    }

    if (text.includes('hip hop') || text.includes('hip-hop') || text.includes('rap')) {
      return base({
        name: 'Hip Hop Local Beatmaker', family: 'HIPHOP', patternKey: text.includes('lo-fi') ? 'lo-fi' : 'hip hop',
        chordMode: 'COMP', leadMode: 'MELODY', kickAmount: 0.9, snareAmount: 0.95,
        hatAmount: 0.62, percussionAmount: 0.25, bassAmount: 0.88, chordAmount: 0.7,
        leadAmount: 0.2, delayMix: 0.1, drive: 1.02, bassWave: 0,
        chordWave: 0, leadWave: 1, bassDecay: 0.99993, brightness: 0.82
      });
    }

    if (text.includes('r&b') || text.includes('rnb') || text.includes('soul')) {
      return base({
        name: 'R&B / Soul Local Session', family: 'RNB', patternKey: 'lo-fi',
        chordMode: 'COMP', leadMode: 'MELODY', kickAmount: 0.58, snareAmount: 0.64,
        hatAmount: 0.48, percussionAmount: 0.2, bassAmount: 0.74, chordAmount: 0.92,
        leadAmount: 0.24, delayMix: 0.2, drive: 0.9, bassWave: 0,
        chordWave: 0, leadWave: 0, bassDecay: 0.99992, brightness: 0.72
      });
    }

    if (text.includes('disco') || text.includes('funk')) {
      return base({
        name: 'Disco / Funk Local Groove', family: 'DISCO', patternKey: 'house',
        chordMode: 'STAB', leadMode: 'MELODY', kickAmount: 0.9, snareAmount: 0.82,
        hatAmount: 0.92, percussionAmount: 0.56, bassAmount: 0.94, chordAmount: 0.74,
        leadAmount: 0.28, delayMix: 0.08, drive: 1.02, bassWave: 2,
        chordWave: 1, leadWave: 2, brightness: 1.16
      });
    }

    if (text.includes('reggae') || text.includes('dancehall') || text.includes('dub')) {
      return base({
        name: 'Reggae / Dub Local Band', family: 'REGGAE', patternKey: 'hip hop',
        chordMode: 'OFFBEAT', leadMode: 'MELODY', kickAmount: 0.62, snareAmount: 0.72,
        hatAmount: 0.56, percussionAmount: 0.38, bassAmount: 0.94, chordAmount: 0.78,
        leadAmount: 0.2, delayMix: 0.32, drive: 0.92, bassWave: 0,
        chordWave: 1, leadWave: 1, bassDecay: 0.99994, brightness: 0.78
      });
    }

    if (text.includes('latin') || text.includes('reggaeton') || text.includes('salsa') || text.includes('cumbia') || text.includes('bachata')) {
      return base({
        name: 'Latin Local Percussion Band', family: 'LATIN', patternKey: 'afro house',
        chordMode: 'STAB', leadMode: 'MELODY', kickAmount: 0.78, snareAmount: 0.7,
        hatAmount: 0.58, percussionAmount: 1.08, bassAmount: 0.82, chordAmount: 0.68,
        leadAmount: 0.36, delayMix: 0.12, drive: 0.96, bassWave: 0,
        chordWave: 1, leadWave: 1, brightness: 0.94
      });
    }

    if (text.includes('african') || text.includes('amapiano') || text.includes('kwaito') || text.includes('world') || text.includes('tribal')) {
      return base({
        name: 'African / World Local Percussion', family: 'AFRO', patternKey: 'afro house',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.72, snareAmount: 0.5,
        hatAmount: 0.62, percussionAmount: 1.15, bassAmount: 0.92, chordAmount: 0.62,
        leadAmount: 0.32, delayMix: 0.18, drive: 0.92, bassWave: 0,
        chordWave: 0, leadWave: 1, bassDecay: 0.99994, brightness: 0.86
      });
    }

    if (text.includes('metal') || text.includes('punk') || text.includes('hardcore') || text.includes('rock')) {
      return base({
        name: text.includes('metal') ? 'Metal Local Power Engine' : 'Rock / Punk Local Band',
        family: 'ROCK', patternKey: 'hip hop', chordMode: 'POWER', leadMode: 'MELODY',
        kickAmount: text.includes('metal') ? 1.08 : 0.92, snareAmount: 1,
        hatAmount: 0.82, percussionAmount: 0.12, bassAmount: 0.86, chordAmount: 0.98,
        leadAmount: 0.35, delayMix: 0.08, drive: text.includes('metal') ? 1.35 : 1.16,
        bassWave: 2, chordWave: 2, leadWave: 2, bassDecay: 0.99988, brightness: 1.08
      });
    }

    if (text.includes('country') || text.includes('folk') || text.includes('americana')) {
      return base({
        name: 'Country / Folk Local Band', family: 'COUNTRY', patternKey: 'hip hop',
        chordMode: 'COMP', leadMode: 'MELODY', kickAmount: 0.55, snareAmount: 0.62,
        hatAmount: 0.52, percussionAmount: 0.12, bassAmount: 0.68, chordAmount: 0.82,
        leadAmount: 0.36, delayMix: 0.08, drive: 0.88, bassWave: 1,
        chordWave: 1, leadWave: 1, bassDecay: 0.9999, brightness: 0.88
      });
    }

    if (text.includes('classical') || text.includes('orchestral')) {
      return base({
        name: 'Classical / Orchestral Local Sketch', family: 'CINEMATIC', patternKey: 'cinematic',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.12, snareAmount: 0.08,
        hatAmount: 0.02, percussionAmount: 0.18, bassAmount: 0.54, chordAmount: 1,
        leadAmount: 0.46, delayMix: 0.32, drive: 0.78, bassWave: 0,
        chordWave: 0, leadWave: 0, bassDecay: 0.99995, brightness: 0.72
      });
    }

    if (text.includes('cinematic') || text.includes('soundtrack') || text.includes('epic')) {
      return base({
        name: 'Cinematic Local Score', family: 'CINEMATIC', patternKey: 'cinematic',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.58, snareAmount: 0.42,
        hatAmount: 0.18, percussionAmount: 0.76, bassAmount: 0.7, chordAmount: 0.98,
        leadAmount: 0.5, delayMix: 0.3, drive: 0.92, bassWave: 0,
        chordWave: 0, leadWave: 0, bassDecay: 0.99994, brightness: 0.82
      });
    }

    if (text.includes('ambient') || text.includes('downtempo') || text.includes('chill') || text.includes('idm')) {
      return base({
        name: 'Ambient / Downtempo Local Soundscape', family: 'AMBIENT', patternKey: 'ambient',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.15, snareAmount: 0.08,
        hatAmount: 0.16, percussionAmount: 0.18, bassAmount: 0.55, chordAmount: 1,
        leadAmount: 0.3, delayMix: 0.36, drive: 0.78, bassWave: 0,
        chordWave: 0, leadWave: 0, bassDecay: 0.99997, brightness: 0.62
      });
    }

    if (text.includes('pop')) {
      return base({
        name: 'Pop Local Production', family: 'POP', patternKey: 'house',
        chordMode: 'PAD', leadMode: 'MELODY', kickAmount: 0.78, snareAmount: 0.88,
        hatAmount: 0.68, percussionAmount: 0.32, bassAmount: 0.8, chordAmount: 0.84,
        leadAmount: 0.42, delayMix: 0.16, drive: 0.98, bassWave: 4,
        chordWave: 0, leadWave: 2, brightness: 1.02
      });
    }

    if (text.includes('house')) {
      return base({
        name: 'House Local Club', family: 'HOUSE', patternKey: 'house',
        chordMode: 'STAB', leadMode: 'MELODY'
      });
    }

    return base({
      name: 'Sonara Local Music Engine v2',
      family: 'HOUSE',
      patternKey: 'melodic house',
      chordMode: 'PAD',
      leadMode: 'MELODY',
      delayMix: 0.18,
      chordAmount: 0.82,
      leadAmount: 0.32,
      brightness: Math.max(0.65, atmosphere.brightness)
    });
  }

  private static resolveAtmosphere(descriptor: string) {
    let brightness = 1;
    let space = 0;
    let drive = 0;
    let percussion = 1;
    let lead = 1;
    let noiseFloor = 0.0012;

    if (/deep|intimate|notturn|night|dream|chill|relax|smooth|warm/.test(descriptor)) {
      brightness -= 0.12;
      space += 0.08;
      lead -= 0.08;
    }
    if (/dark|industrial|raw|aggressive|hard|menacing|horror/.test(descriptor)) {
      brightness += 0.06;
      drive += 0.12;
      space -= 0.02;
    }
    if (/sunny|summer|joy|euphor|triumph|festival|mainstage|bright/.test(descriptor)) {
      brightness += 0.16;
      lead += 0.16;
      space += 0.03;
    }
    if (/tribal|organic|afro|primordial|ritual|spiritual|latin/.test(descriptor)) {
      percussion += 0.26;
    }
    if (/acid|neon|future|futuristic|psychedelic|hypnotic/.test(descriptor)) {
      brightness += 0.1;
      drive += 0.08;
      lead += 0.18;
    }
    if (/lo-fi|lofi|vintage|dusty|smoky/.test(descriptor)) {
      brightness -= 0.22;
      noiseFloor += 0.004;
      drive -= 0.06;
    }
    if (/cinematic|epic|space|atmospheric|ambient/.test(descriptor)) {
      space += 0.14;
    }

    return {
      brightness: Math.max(0.5, Math.min(1.3, brightness)),
      space: Math.max(0, Math.min(0.2, space)),
      drive: Math.max(-0.12, Math.min(0.22, drive)),
      percussion: Math.max(0.7, Math.min(1.4, percussion)),
      lead: Math.max(0.65, Math.min(1.35, lead)),
      noiseFloor: Math.max(0, Math.min(0.01, noiseFloor))
    };
  }

  private static buildPattern(profile: LocalGenreProfile, seed: number): PatternGenerationResult {
    const pattern = PatternGeneratorService.generatePattern(profile.patternKey, seed);

    if (profile.family === 'JAZZ') {
      pattern.rhythm = {
        kick: [0.5,0,0,0, 0.12,0,0,0, 0.35,0,0,0, 0.12,0,0,0],
        snare: [0,0,0,0, 0.28,0,0,0, 0,0,0,0, 0.28,0,0,0],
        hihat: [0.58,0,0.34,0, 0.62,0,0.34,0, 0.58,0,0.34,0, 0.66,0,0.38,0],
        percussion: [0,0,0,0.2, 0,0,0,0, 0,0,0.18,0, 0,0,0,0],
        bass: [0.82,0,0,0, 0.76,0,0,0, 0.82,0,0,0, 0.72,0,0,0]
      };
      pattern.chordProgression = ['Dm9', 'G13', 'Cmaj9', 'A7alt'];
      pattern.melodyScale = ['D','E','F','G','A','B','C'];
      pattern.swingPct = 24;
    } else if (profile.family === 'BLUES') {
      pattern.rhythm = {
        kick: [0.85,0,0,0, 0,0,0.55,0, 0.72,0,0,0, 0,0,0.48,0],
        snare: [0,0,0,0, 0.8,0,0,0, 0,0,0,0, 0.82,0,0,0],
        hihat: [0.56,0,0.4,0, 0.56,0,0.4,0, 0.56,0,0.4,0, 0.56,0,0.4,0],
        percussion: [0,0,0,0, 0.18,0,0,0, 0,0,0,0, 0.18,0,0,0],
        bass: [0.82,0,0.55,0, 0.72,0,0.58,0, 0.82,0,0.55,0, 0.72,0,0.58,0]
      };
      pattern.chordProgression = ['A7','D7','A7','A7','D7','D7','A7','A7','E7','D7','A7','E7'];
      pattern.melodyScale = ['A','B','C','C#','E','F#','G'];
      pattern.swingPct = 20;
    } else if (profile.family === 'ROCK') {
      pattern.rhythm = {
        kick: [1,0,0,0, 0,0,0.58,0, 0.82,0,0,0, 0,0,0.52,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat: [0.78,0,0.58,0, 0.78,0,0.58,0, 0.78,0,0.58,0, 0.78,0,0.64,0],
        percussion: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
        bass: [0.88,0,0,0, 0.7,0,0,0, 0.88,0,0,0, 0.7,0,0,0]
      };
      pattern.chordProgression = ['Em','C','G','D'];
      pattern.melodyScale = ['E','F#','G','A','B','C','D'];
      pattern.swingPct = 0;
    } else if (profile.family === 'REGGAE') {
      pattern.rhythm = {
        kick: [0,0,0,0, 0,0,0,0, 0.78,0,0,0, 0,0,0,0],
        snare: [0,0,0,0, 0,0,0,0, 0.82,0,0,0, 0,0,0,0],
        hihat: [0.5,0,0.45,0, 0.5,0,0.45,0, 0.5,0,0.45,0, 0.5,0,0.45,0],
        percussion: [0,0,0.25,0, 0,0,0.25,0, 0,0,0.25,0, 0,0,0.25,0],
        bass: [0.72,0,0,0.62, 0,0,0.68,0, 0.75,0,0,0.58, 0,0,0.65,0]
      };
      pattern.chordProgression = ['Am7','Dm7','Em7','Dm7'];
      pattern.melodyScale = ['A','B','C','D','E','F','G'];
      pattern.swingPct = 8;
    } else if (profile.family === 'POP') {
      pattern.rhythm = {
        kick: [0.9,0,0,0, 0,0,0.35,0, 0.78,0,0,0, 0,0,0.4,0],
        snare: [0,0,0,0, 0.92,0,0,0, 0,0,0,0, 0.92,0,0,0],
        hihat: [0.5,0,0.42,0, 0.5,0,0.42,0, 0.5,0,0.42,0, 0.5,0,0.46,0],
        percussion: [0,0,0,0, 0,0,0.2,0, 0,0,0,0, 0,0,0.24,0],
        bass: [0.78,0,0,0, 0.58,0,0,0, 0.78,0,0,0, 0.58,0,0,0]
      };
      pattern.chordProgression = ['C','G','Am','F'];
      pattern.melodyScale = ['C','D','E','F','G','A','B'];
    } else if (profile.family === 'RNB') {
      pattern.chordProgression = ['Cm9','Fm9','Abmaj9','G7alt'];
      pattern.melodyScale = ['C','D','Eb','F','G','Ab','Bb'];
      pattern.swingPct = 18;
    } else if (profile.family === 'DISCO') {
      pattern.chordProgression = ['Am7','D9','Gmaj7','Cmaj7'];
      pattern.melodyScale = ['A','B','C','D','E','F#','G'];
    } else if (profile.family === 'COUNTRY') {
      pattern.rhythm = {
        kick: [0.72,0,0,0, 0,0,0,0, 0.7,0,0,0, 0,0,0,0],
        snare: [0,0,0,0, 0.65,0,0,0, 0,0,0,0, 0.65,0,0,0],
        hihat: [0.42,0,0.35,0, 0.42,0,0.35,0, 0.42,0,0.35,0, 0.42,0,0.35,0],
        percussion: new Array(16).fill(0),
        bass: [0.7,0,0,0, 0.58,0,0,0, 0.7,0,0,0, 0.58,0,0,0]
      };
      pattern.chordProgression = ['G','C','D','G'];
      pattern.melodyScale = ['G','A','B','C','D','E','F#'];
    } else if (profile.family === 'BASS') {
      pattern.rhythm.snare = [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
      pattern.rhythm.kick = [1,0,0,0, 0,0,0.55,0, 0,0,0.8,0, 0,0,0,0];
      pattern.chordProgression = ['Fm','Db','Ab','Eb'];
      pattern.melodyScale = ['F','G','Ab','Bb','C','Db','Eb'];
    } else if (profile.family === 'LATIN') {
      pattern.chordProgression = ['Am7','Dm7','G7','Cmaj7'];
      pattern.melodyScale = ['A','B','C','D','E','F','G'];
      pattern.swingPct = 14;
    }

    return pattern;
  }

  private static arrangementForBar(
    barIndex: number,
    totalBars: number,
    family: GenreFamily
  ): ArrangementState {
    const progress = totalBars <= 9
      ? (barIndex % 8) / 8
      : Math.min(1, barIndex / Math.max(1, totalBars - 1));

    if (family === 'AMBIENT' || family === 'CINEMATIC') {
      if (progress < 0.22) return { kick:0.15,snare:0.12,hats:0.2,percussion:0.35,bass:0.55,chords:0.82,lead:0.32 };
      if (progress < 0.62) return { kick:0.45,snare:0.32,hats:0.32,percussion:0.65,bass:0.78,chords:1,lead:0.55 };
      if (progress < 0.78) return { kick:0.08,snare:0.08,hats:0.12,percussion:0.28,bass:0.45,chords:1,lead:0.7 };
      return { kick:0.55,snare:0.38,hats:0.34,percussion:0.72,bass:0.82,chords:1,lead:0.62 };
    }

    if (progress < 0.12) return { kick:0.72,snare:0.42,hats:0.4,percussion:0.42,bass:0.28,chords:0.72,lead:0.05 };
    if (progress < 0.28) return { kick:0.88,snare:0.7,hats:0.72,percussion:0.75,bass:0.72,chords:0.86,lead:0.22 };
    if (progress < 0.58) return { kick:1,snare:1,hats:1,percussion:1,bass:1,chords:1,lead:0.62 };
    if (progress < 0.72) return { kick:0.14,snare:0.28,hats:0.34,percussion:0.38,bass:0.22,chords:1,lead:0.78 };
    if (progress < 0.93) return { kick:1,snare:1,hats:1,percussion:1,bass:1,chords:1,lead:0.82 };
    return { kick:0.68,snare:0.55,hats:0.48,percussion:0.45,bass:0.52,chords:0.72,lead:0.18 };
  }

  private static chordTrigger(mode: ChordMode, stepInBar: number): number {
    if (mode === 'PAD') return 1;
    if (mode === 'OFFBEAT') return [2,6,10,14].includes(stepInBar) ? 1 : 0;
    if (mode === 'POWER') return [0,4,8,12].includes(stepInBar) ? 1 : 0;
    if (mode === 'COMP') return [0,3,6,10,13].includes(stepInBar) ? 0.82 : 0;
    return [2,6,10,14].includes(stepInBar) ? 0.9 : 0;
  }

  private static chordEnvelope(mode: ChordMode, stepPhase: number, velocity: number): number {
    if (velocity <= 0) return 0;
    if (mode === 'PAD') {
      const swell = 0.72 + 0.28 * (1 - Math.abs(stepPhase * 2 - 1));
      return velocity * swell;
    }
    const rate = mode === 'OFFBEAT' ? 6.5 : mode === 'POWER' ? 2.6 : 4.4;
    return velocity * Math.max(0, 1 - stepPhase * rate) ** 2;
  }

  private static leadTrigger(
    mode: LeadMode,
    stepInBar: number,
    globalStep: number,
    seed: number
  ): number {
    if (mode === 'NONE') return 0;
    if (mode === 'ARP') return stepInBar % 2 === 0 ? 0.82 : 0.56;
    if (mode === 'ACID') return [0,3,6,8,11,14].includes(stepInBar) ? 0.78 : 0;
    const selector = (globalStep * 13 + seed) % 16;
    return [0,4,7,10,12,15].includes(stepInBar) && selector % 3 !== 1 ? 0.62 : 0;
  }

  private static bassNoteOffset(
    family: GenreFamily,
    stepInBar: number,
    globalStep: number,
    seed: number
  ): number {
    if (family === 'JAZZ') {
      const walk = [0,4,7,9];
      return walk[Math.floor(stepInBar / 4) % walk.length];
    }
    if (family === 'BLUES') {
      const bluesWalk = [0,7,9,10];
      return bluesWalk[Math.floor(stepInBar / 4) % bluesWalk.length];
    }
    if (family === 'TRAP' || family === 'BASS') {
      return stepInBar >= 8 && ((globalStep + seed) % 3 === 0) ? 12 : 0;
    }
    if (family === 'DNB' || family === 'TECHNO') {
      return [0,0,7,0][Math.floor(stepInBar / 4) % 4];
    }
    if (family === 'DISCO') {
      return [0,7,12,9][Math.floor(stepInBar / 4) % 4];
    }
    return stepInBar % 8 === 6 ? 7 : 0;
  }

  private static parseChord(symbol: string): ParsedChord {
    const match = String(symbol || 'C').match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!match) return { rootMidi: 48, notes: [60,64,67,71] };

    const rootName = `${match[1].toUpperCase()}${match[2] || ''}`;
    const quality = (match[3] || '').toLowerCase();
    const rootSemitone = this.noteNameToSemitone(rootName);
    const rootMidi = 48 + rootSemitone;

    let intervals: number[];
    if (quality.includes('sus4')) {
      intervals = [0,5,7,10];
    } else if (quality.includes('dim')) {
      intervals = [0,3,6,9];
    } else if (quality.startsWith('m') && !quality.startsWith('maj')) {
      intervals = quality.includes('9') ? [0,3,7,10,14] : quality.includes('7') ? [0,3,7,10] : [0,3,7,12];
    } else if (quality.includes('maj9')) {
      intervals = [0,4,7,11,14];
    } else if (quality.includes('maj7')) {
      intervals = [0,4,7,11];
    } else if (quality.includes('9')) {
      intervals = [0,4,7,10,14];
    } else if (quality.includes('7')) {
      intervals = [0,4,7,10];
    } else {
      intervals = [0,4,7,12];
    }

    return {
      rootMidi,
      notes: intervals.map(interval => rootMidi + 12 + interval)
    };
  }

  private static scaleToMidi(scale: string[]): number[] {
    if (!Array.isArray(scale) || scale.length === 0) return [72,74,76,77,79,81,83];
    return scale.map(noteName => 72 + this.noteNameToSemitone(noteName));
  }

  private static noteNameToSemitone(noteName: string): number {
    const map: Record<string, number> = {
      C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11
    };
    return map[noteName] ?? 0;
  }

  private static midiToHz(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private static createSineTable(): Float32Array {
    const table = new Float32Array(this.TABLE_SIZE);
    for (let index = 0; index < table.length; index += 1) {
      table[index] = Math.sin((index / table.length) * Math.PI * 2);
    }
    return table;
  }

  private static oscillator(phase: number, wave: number, sineTable: Float32Array): number {
    if (wave === 0) {
      const index = Math.floor(phase * this.TABLE_SIZE) & (this.TABLE_SIZE - 1);
      return sineTable[index];
    }
    if (wave === 1) return 1 - 4 * Math.abs(phase - 0.5);
    if (wave === 2) return phase * 2 - 1;
    if (wave === 3) return phase < 0.5 ? 1 : -1;

    const index = Math.floor(phase * this.TABLE_SIZE) & (this.TABLE_SIZE - 1);
    return sineTable[index] * 0.72 + (1 - 4 * Math.abs(phase - 0.5)) * 0.28;
  }

  private static wrapPhase(phase: number): number {
    if (phase >= 1) return phase - Math.floor(phase);
    if (phase < 0) return phase - Math.floor(phase);
    return phase;
  }

  private static softClip(value: number, drive: number): number {
    const driven = value * Math.max(0.65, drive);
    return driven / (1 + Math.abs(driven) * 0.72);
  }

  private static writeWavHeader(
    buffer: Buffer,
    dataSize: number,
    sampleRate: number,
    channels: number,
    bitDepth: number
  ): void {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);
  }

  private static hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
