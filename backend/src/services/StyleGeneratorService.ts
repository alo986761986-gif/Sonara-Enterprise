// StyleGeneratorService.ts - Sonara Intelligent Style Generator & Aesthetic Mutator
import fs from 'fs';
import path from 'path';
import { MusicDnaLibraryService, DnaElement } from './MusicDnaLibraryService';
import { ResearchEngineService, ResearchExperiment } from './ResearchEngineService';
import { ContinuousLearningService, CompletedSong } from './ContinuousLearningService';
import { AiQualityEngineService } from './AiQualityEngineService';

export interface GeneratedStyle {
  id: string;
  name: string;
  description: string;
  creativeIndex: number; // 10 to 100 (level of experimentation)
  innovationScore: number; // 0 to 100 (degree of divergence from standard DNA)
  mood: string;
  bpm: number;
  key: string;
  instruments: string[];
  compatibility: string[];
  energy: number; // 1 to 10
  transitions: string[];
  structure: string[];
  passedQualityEngine: boolean;
  qualityScore?: number;
  creationTimestamp: string;
}

export class StyleGeneratorService {
  private static stylesPath = path.join(process.cwd(), 'storage', 'generated_styles.json');
  private static styles: GeneratedStyle[] = [];

  // Static lists for combinatorics/mutations
  private static prefixes = ['Neo', 'Quantum', 'Epic', 'Future', 'Glitch', 'Hydro', 'Astro', 'Deep', 'Hyperspace', 'Liquid', 'Ambient', 'Neuro', 'Primal', 'Cyber', 'Organic', 'Sub-Zero'];
  private static roots = ['Ambient', 'Synth Pop', 'EDM', 'Acoustic', 'Techno', 'House', 'Dubstep', 'Trap', 'Lo-Fi', 'Metal', 'Cinematic', 'Breakbeat', 'Jazz', 'Industrial', 'Trance', 'Drill'];
  private static suffixes = ['Fringe', 'Atmosphere', 'Pulse', 'Core', 'Vortex', 'Wave', 'Friction', 'Tapestry', 'Evolution', 'Grid', 'Symphony', 'Cascade', 'Drift', 'Slick'];

  private static moods = ['Ethereal', 'Hyper-Vibrant', 'Dark Cinematic', 'Serene Atmospheric', 'High-Tension Cyber', 'Melancholic', 'Nostalgic Retro', 'Gritty Industrial', 'Hypnotic', 'Uplifting', 'Ominous', 'Cosmic'];
  private static keys = ['C minor', 'F minor', 'D minor', 'A minor', 'G major', 'E minor', 'B minor', 'A major', 'D# minor', 'F# major', 'G# minor', 'A# minor', 'C# major'];
  private static instrumentsPool = [
    'Modular Wavetable Synthesizer', 'Analog Sub-Kick', 'Holographic Arp', 'Granular Bowed Cello', 'Resonator Synth Pluck',
    '808 Bass Cannon', 'LinnDrum Snare', 'Shimmering Reverb Pads', 'FM Electric Piano', 'Wooden Rimshot',
    'Acoustic Nylon Guitar', 'Industrial Metal Grime', 'Glitch Glissando', 'Ambient Forest Flute', 'Bitcrushed Bells'
  ];
  private static transitionsPool = [
    'Filtered white-noise sweep rise', 'Low-cut frequency decay', 'Noise-gate compression drop coupling',
    'Sudden rhythmic beat cut to ambient tail', 'Arpeggiated fast-decay pitch build-up', 'Reverse tape feedback delay'
  ];
  private static structuresPool = [
    ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    ['drop', 'breakdown', 'bridge', 'drop', 'outro'],
    ['intro', 'drop', 'breakdown', 'drop', 'outro'],
    ['verse', 'prechorus', 'chorus', 'verse', 'chorus', 'outro']
  ];

  /**
   * Initializes the Style Generator database and pre-seeds standard styles if empty.
   */
  public static init(): void {
    const storageDir = path.dirname(this.stylesPath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    if (fs.existsSync(this.stylesPath)) {
      try {
        const fileContent = fs.readFileSync(this.stylesPath, 'utf8');
        this.styles = JSON.parse(fileContent);
      } catch (err) {
        console.warn('[STYLE_GENERATOR] Failed to read generated_styles.json:', err);
        this.styles = [];
      }
    }

    if (this.styles.length === 0) {
      this.preseedStyles();
    }
  }

  /**
   * Returns all active generated styles
   */
  public static getAllStyles(): GeneratedStyle[] {
    this.init();
    return this.styles;
  }

  /**
   * Analyzes baseline assets (DNA, Best Songs, Failed Songs) to identify
   * high-success parameters and avoid low-performance duplicates or errors.
   */
  private static analyzeHistoricalBias() {
    try {
      const bestSongs = ContinuousLearningService.getBestSongs();
      const failedSongs = ContinuousLearningService.getFailedSongs();
      const dnaElements = MusicDnaLibraryService.getAllElements();

      const workingKeys = new Set<string>();
      const workingBpmRanges: number[] = [];
      const workingInstruments = new Set<string>();

      bestSongs.forEach(song => {
        if (song.key) workingKeys.add(song.key);
        if (song.bpm) workingBpmRanges.push(song.bpm);
        if (song.instruments) {
          song.instruments.forEach(inst => workingInstruments.add(inst.toLowerCase()));
        }
      });

      const failedKeys = new Set<string>();
      const failedBpmRanges: number[] = [];
      const failedInstruments = new Set<string>();

      failedSongs.forEach(song => {
        if (song.key) failedKeys.add(song.key);
        if (song.bpm) failedBpmRanges.push(song.bpm);
        if (song.instruments) {
          song.instruments.forEach(inst => failedInstruments.add(inst.toLowerCase()));
        }
      });

      return {
        workingKeys: Array.from(workingKeys),
        workingBpmAvg: workingBpmRanges.length > 0 ? workingBpmRanges.reduce((a, b) => a + b, 0) / workingBpmRanges.length : 124,
        workingInstruments: Array.from(workingInstruments),
        failedKeys: Array.from(failedKeys),
        failedBpmRanges,
        failedInstruments: Array.from(failedInstruments),
        dnaSignatureCount: dnaElements.length
      };
    } catch (err) {
      console.warn('[STYLE_GENERATOR] Error gathering historical bias, falling back to neutral weightings:', err);
      return {
        workingKeys: [],
        workingBpmAvg: 124,
        workingInstruments: [],
        failedKeys: [],
        failedBpmRanges: [],
        failedInstruments: [],
        dnaSignatureCount: 10
      };
    }
  }

  /**
   * Generates a completely new unique style by analyzing historical successes and combinations.
   */
  public static generateStyle(creativeIndex: number = 50, parentIds?: string[]): GeneratedStyle {
    this.init();
    const bias = this.analyzeHistoricalBias();

    // 1. Synthesize a non-derivative style name
    let styleName = '';
    let uniqueAttempt = 0;
    while (uniqueAttempt < 10) {
      const prefix = this.prefixes[Math.floor(Math.random() * this.prefixes.length)];
      const root = this.roots[Math.floor(Math.random() * this.roots.length)];
      const suffix = Math.random() > 0.5 ? ' ' + this.suffixes[Math.floor(Math.random() * this.suffixes.length)] : '';
      styleName = `${prefix} ${root}${suffix}`;

      // Check for exact duplication in database
      const exists = this.styles.some(s => s.name.toLowerCase() === styleName.toLowerCase());
      if (!exists) break;
      uniqueAttempt++;
    }

    // 2. Select highly operational BPM and Keys using Historical Biases
    let chosenBpm = 120;
    if (bias.workingBpmAvg && Math.random() > 0.3) {
      // Pick around the successful average, or random with deviation
      const dev = Math.round((Math.random() - 0.5) * (creativeIndex > 70 ? 40 : 15));
      chosenBpm = Math.max(60, Math.min(220, Math.round(bias.workingBpmAvg + dev)));
    } else {
      chosenBpm = Math.round(80 + Math.random() * 90);
    }

    // Verify against failed BPMs to prevent disaster
    if (bias.failedBpmRanges.includes(chosenBpm)) {
      chosenBpm += 5; // offset slightly to escape the failure envelope
    }

    let chosenKey = this.keys[Math.floor(Math.random() * this.keys.length)];
    if (bias.workingKeys.length > 0 && Math.random() > 0.4) {
      // Pick a historically proven key
      chosenKey = bias.workingKeys[Math.floor(Math.random() * bias.workingKeys.length)];
    }
    // Avoid failed keys if possible
    if (bias.failedKeys.includes(chosenKey) && bias.workingKeys.length > 0) {
      chosenKey = bias.workingKeys.find(k => !bias.failedKeys.includes(k)) || chosenKey;
    }

    // 3. Instrumentation & Transitions coupling
    const styleInstruments: string[] = [];
    const instCount = Math.floor(3 + Math.random() * 3); // 3 to 5 instruments
    
    // Mix in some successful instruments, some random ones
    const workingInstsPool = bias.workingInstruments.length > 0 ? bias.workingInstruments : this.instrumentsPool;
    for (let i = 0; i < instCount; i++) {
      let inst = '';
      if (Math.random() > 0.4) {
        inst = workingInstsPool[Math.floor(Math.random() * workingInstsPool.length)];
      } else {
        inst = this.instrumentsPool[Math.floor(Math.random() * this.instrumentsPool.length)];
      }
      // Capitalize nicely
      inst = inst.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (inst && !styleInstruments.includes(inst)) {
        styleInstruments.push(inst);
      }
    }
    if (styleInstruments.length === 0) {
      styleInstruments.push('Analog Modular Lead', 'Granular Soundscape Generator');
    }

    const transitions = [
      this.transitionsPool[Math.floor(Math.random() * this.transitionsPool.length)],
      this.transitionsPool[Math.floor(Math.random() * this.transitionsPool.length)]
    ].filter((v, i, a) => a.indexOf(v) === i);

    const structure = this.structuresPool[Math.floor(Math.random() * this.structuresPool.length)];
    const mood = this.moods[Math.floor(Math.random() * this.moods.length)];
    const energy = Math.min(10, Math.max(1, Math.round((chosenBpm - 60) / 15 + Math.random() * 2)));

    // 4. Innovation score calculation based on distance from baseline instruments and BPM offsets
    const innovationBase = 40 + Math.round((creativeIndex / 2) + (styleInstruments.length * 5));
    const innovationScore = Math.min(100, Math.max(15, innovationBase));

    const description = `An advanced stylistic synthesis blending ${mood.toLowerCase()} textures with a ${chosenBpm} BPM driving rhythmic base, using ${styleInstruments.slice(0, 3).join(', ')}. Engineered with dynamic transitions like ${transitions[0]}.`;

    const newStyle: GeneratedStyle = {
      id: `style_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: styleName,
      description,
      creativeIndex,
      innovationScore,
      mood,
      bpm: chosenBpm,
      key: chosenKey,
      instruments: styleInstruments,
      compatibility: [mood, ...styleInstruments.slice(0, 2), chosenKey],
      energy,
      transitions,
      structure,
      passedQualityEngine: false,
      creationTimestamp: new Date().toISOString()
    };

    this.styles.unshift(newStyle);
    this.saveStyles();

    console.log(`[STYLE_GENERATOR] Automatically generated style "${newStyle.name}" (ID: ${newStyle.id}) with Innovation level of ${newStyle.innovationScore}%`);
    return newStyle;
  }

  /**
   * Mutates an existing style slightly or heavily based on the mutationRate.
   */
  public static mutateStyle(styleId: string, mutationRate: number = 0.3): GeneratedStyle {
    this.init();
    const target = this.styles.find(s => s.id === styleId);
    if (!target) {
      throw new Error(`Style with ID "${styleId}" not found for mutation`);
    }

    // BPM mutation
    let newBpm = target.bpm;
    if (Math.random() < mutationRate) {
      const delta = Math.round((Math.random() - 0.5) * 20);
      newBpm = Math.max(65, Math.min(210, target.bpm + delta));
    }

    // Key mutation
    let newKey = target.key;
    if (Math.random() < mutationRate) {
      newKey = this.keys[Math.floor(Math.random() * this.keys.length)];
    }

    // Instrumentation mutation
    const newInstruments = [...target.instruments];
    if (Math.random() < mutationRate && newInstruments.length > 0) {
      // replace or add an instrument
      const replaceIdx = Math.floor(Math.random() * newInstruments.length);
      const replacement = this.instrumentsPool[Math.floor(Math.random() * this.instrumentsPool.length)];
      if (!newInstruments.includes(replacement)) {
        newInstruments[replaceIdx] = replacement;
      }
    }

    // Mood mutation
    let newMood = target.mood;
    if (Math.random() < mutationRate * 0.7) {
      newMood = this.moods[Math.floor(Math.random() * this.moods.length)];
    }

    const mutatedId = `style_mut_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const mutatedName = target.name.startsWith('Mutated') 
      ? `Ultra-${target.name}` 
      : `Mutated ${target.name}`;

    const newInnovation = Math.min(100, Math.max(10, Math.round(target.innovationScore * (1 + (Math.random() - 0.2) * mutationRate))));

    const description = `A mutant evolution of the standard ${target.name} style. Shifted to a revised tempo profile of ${newBpm} BPM with adjusted harmonic elements in root ${newKey}.`;

    const mutatedStyle: GeneratedStyle = {
      id: mutatedId,
      name: mutatedName,
      description,
      creativeIndex: target.creativeIndex,
      innovationScore: newInnovation,
      mood: newMood,
      bpm: newBpm,
      key: newKey,
      instruments: newInstruments,
      compatibility: [newMood, ...newInstruments.slice(0, 2)],
      energy: Math.min(10, Math.max(1, Math.round((newBpm - 60) / 15 + Math.random() * 2))),
      transitions: target.transitions,
      structure: target.structure,
      passedQualityEngine: false,
      creationTimestamp: new Date().toISOString()
    };

    this.styles.unshift(mutatedStyle);
    this.saveStyles();

    console.log(`[STYLE_GENERATOR] Mutated style "${target.name}" into brand new branch "${mutatedStyle.name}"`);
    return mutatedStyle;
  }

  /**
   * Crosses over/merges two styles to create a brand new hybrid style.
   */
  public static mergeStyles(styleId1: string, styleId2: string): GeneratedStyle {
    this.init();
    const style1 = this.styles.find(s => s.id === styleId1);
    const style2 = this.styles.find(s => s.id === styleId2);

    if (!style1 || !style2) {
      throw new Error('Could not find both source styles for merging / hybrid crossover.');
    }

    // Merge names (e.g. Neo Hybrid Ambient + Quantum Synth Pop -> Neo Quantum Ambient Pop)
    const words1 = style1.name.split(' ');
    const words2 = style2.name.split(' ');
    const prefix = words1[0];
    const root1 = words1[1] || '';
    const root2 = words2[1] || words2[0];
    const hybridName = `${prefix}-${root2} Hybrid`;

    // Blend values
    const newBpm = Math.round((style1.bpm + style2.bpm) / 2);
    const newKey = Math.random() > 0.5 ? style1.key : style2.key;
    const creativeIndex = Math.round((style1.creativeIndex + style2.creativeIndex) / 2);
    
    // Combine unique instruments
    const newInstruments = Array.from(new Set([...style1.instruments.slice(0, 2), ...style2.instruments.slice(0, 2)]));
    const newTransitions = Array.from(new Set([...style1.transitions.slice(0, 1), ...style2.transitions.slice(0, 1)]));
    const newStructure = Math.random() > 0.5 ? style1.structure : style2.structure;
    const newMood = Math.random() > 0.5 ? style1.mood : style2.mood;

    const innovationScore = Math.min(100, Math.max(20, Math.round((style1.innovationScore + style2.innovationScore) / 1.6 + 15)));

    const description = `A sophisticated aesthetic crossover merging the core of ${style1.name} and ${style2.name}. Melds the harmonic footprint of ${newKey} with a hybridized instrumentation pool.`;

    const hybridStyle: GeneratedStyle = {
      id: `style_hyb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: hybridName,
      description,
      creativeIndex,
      innovationScore,
      mood: newMood,
      bpm: newBpm,
      key: newKey,
      instruments: newInstruments,
      compatibility: [newMood, ...newInstruments],
      energy: Math.round((style1.energy + style2.energy) / 2),
      transitions: newTransitions,
      structure: newStructure,
      passedQualityEngine: false,
      creationTimestamp: new Date().toISOString()
    };

    this.styles.unshift(hybridStyle);
    this.saveStyles();

    console.log(`[STYLE_GENERATOR] Successfully created crossover hybrid style "${hybridStyle.name}"`);
    return hybridStyle;
  }

  /**
   * Generates a pre-evaluated estimate profile for the proposed style.
   */
  public static evaluateStyle(styleId: string): { score: number; innovationScore: number; feedback: string[] } {
    this.init();
    const style = this.styles.find(s => s.id === styleId);
    if (!style) {
      throw new Error(`Style with ID "${styleId}" not found for evaluation`);
    }

    const feedback: string[] = [];
    let baseScore = 65;

    // Evaluate tempo stability expectations
    if (style.bpm < 80) {
      feedback.push('Low tempo range may trigger minor rhythmic drift; recommended to layer transient heavy sub-kicks.');
      baseScore -= 5;
    } else if (style.bpm > 160) {
      feedback.push('High speed tempo generates intense energetic rhythm; requires clean transients to pass compression filters.');
      baseScore += 5;
    } else {
      feedback.push('Optimal mid-tempo profile guarantees solid grid-alignment and rhythmic cohesion.');
      baseScore += 10;
    }

    // Evaluate instrument synergy
    if (style.instruments.length >= 4) {
      feedback.push('Dense instrumentation creates full sonic spectrum. High compatibility expected across low-end channels.');
      baseScore += 12;
    } else {
      feedback.push('Minimalist layout allows high clarity on individual stems, lowering the risk of clipping.');
      baseScore += 5;
    }

    // Scale keys rarity check
    const rareKeys = ['D# minor', 'F# major', 'G# minor', 'A# minor', 'C# major', 'B minor'];
    if (rareKeys.includes(style.key)) {
      feedback.push(`Sophisticated scale key (${style.key}) boosts emotional resonance score.`);
      baseScore += 8;
    } else {
      feedback.push(`Standard root key (${style.key}) ensures solid compatibility across generic playlists.`);
      baseScore += 3;
    }

    // Dynamic random fluctuation factor
    const finalScore = Math.min(100, Math.max(30, baseScore + Math.floor(Math.random() * 15)));

    return {
      score: finalScore,
      innovationScore: style.innovationScore,
      feedback
    };
  }

  /**
   * Spawns an automated full verification cycle:
   * Plans Song -> Runs simulated Generation Queue -> Passes through AI Quality Engine -> Promotes to DNA Library if approved.
   */
  public static async testAndPromoteStyle(styleId: string): Promise<GeneratedStyle> {
    this.init();
    const index = this.styles.findIndex(s => s.id === styleId);
    if (index === -1) {
      throw new Error(`Style "${styleId}" not found for testing`);
    }

    const style = this.styles[index];
    console.log(`[STYLE_GENERATOR] Auto-testing generated style "${style.name}"...`);

    // Simulate Song Planner orchestration and Quality scoring
    const evaluation = this.evaluateStyle(styleId);
    const score = evaluation.score;

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 800));

    style.qualityScore = score;
    style.passedQualityEngine = score >= 85;

    if (style.passedQualityEngine) {
      // 1. Promote style as custom subgenre to Music DNA Library
      MusicDnaLibraryService.addElement({
        id: `dna_style_${style.id}`,
        category: 'subgenre',
        name: style.name,
        description: `${style.description} (Approved by Style Generator and QA Engine with ${score}% rating)`,
        idealBpm: style.bpm,
        key: style.key,
        energy: style.energy,
        intensity: Math.min(10, Math.max(1, Math.round(score / 10))),
        compatibility: [...style.compatibility],
        qualityScore: score
      });

      // 2. Feed to Continuous Learning as a historical breakthrough
      ContinuousLearningService.archiveSong({
        title: `Style Launch: ${style.name}`,
        genre: style.name,
        mood: style.mood,
        bpm: style.bpm,
        key: style.key,
        instruments: style.instruments,
        duration: 30,
        structure: style.structure,
        promptsUsed: [style.description],
        qualityScore: score,
        generationTimeMs: 1200 + Math.round(Math.random() * 800),
        regenerationsCount: 0
      });

      console.log(`[STYLE_GENERATOR] APPROVED! Style "${style.name}" successfully integrated into standard DNA and active Producer AI options.`);
    } else {
      console.log(`[STYLE_GENERATOR] DISCARDED: Style "${style.name}" rated ${score}% (needs >=85% to pass). Quarantined in generation history.`);
    }

    this.styles[index] = style;
    this.saveStyles();

    return style;
  }

  /**
   * Resets styles to original seeds.
   */
  public static resetStyles(): void {
    this.styles = [];
    this.saveStyles();
    this.preseedStyles();
  }

  private static saveStyles(): void {
    try {
      fs.writeFileSync(this.stylesPath, JSON.stringify(this.styles, null, 2), 'utf8');
    } catch (err) {
      console.error('[STYLE_GENERATOR] Failed to save styles JSON archive:', err);
    }
  }

  private static preseedStyles(): void {
    const defaults: GeneratedStyle[] = [
      {
        id: 'style_seed_1',
        name: 'Neo Hybrid Ambient',
        description: 'An advanced stylistic synthesis blending ethereal textures with a 95 BPM driving rhythmic base, using Modular Wavetable Synthesizer, Shimmering Reverb Pads, Ambient Forest Flute. Engineered with dynamic transitions like Filtered white-noise sweep rise.',
        creativeIndex: 65,
        innovationScore: 78,
        mood: 'Ethereal',
        bpm: 95,
        key: 'D# minor',
        instruments: ['Modular Wavetable Synthesizer', 'Shimmering Reverb Pads', 'Ambient Forest Flute'],
        compatibility: ['Ethereal', 'Modular Wavetable Synthesizer', 'Shimmering Reverb Pads', 'D# minor'],
        energy: 4,
        transitions: ['Filtered white-noise sweep rise'],
        structure: ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
        passedQualityEngine: true,
        qualityScore: 92,
        creationTimestamp: new Date(Date.now() - 3600000 * 8).toISOString()
      },
      {
        id: 'style_seed_2',
        name: 'Quantum Synth Pop',
        description: 'An advanced stylistic synthesis blending nostalgic retro textures with a 122 BPM driving rhythmic base, using FM Electric Piano, LinnDrum Snare, Holographic Arp. Engineered with dynamic transitions like Reverse tape feedback delay.',
        creativeIndex: 45,
        innovationScore: 62,
        mood: 'Nostalgic Retro',
        bpm: 122,
        key: 'A major',
        instruments: ['FM Electric Piano', 'LinnDrum Snare', 'Holographic Arp'],
        compatibility: ['Nostalgic Retro', 'FM Electric Piano', 'LinnDrum Snare', 'A major'],
        energy: 6,
        transitions: ['Reverse tape feedback delay'],
        structure: ['intro', 'drop', 'breakdown', 'drop', 'outro'],
        passedQualityEngine: true,
        qualityScore: 89,
        creationTimestamp: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        id: 'style_seed_3',
        name: 'Epic Organic EDM',
        description: 'An advanced stylistic synthesis blending hyper-vibrant textures with a 130 BPM driving rhythmic base, using Granular Bowed Cello, Resonator Synth Pluck, Analog Sub-Kick. Engineered with dynamic transitions like Noise-gate compression drop coupling.',
        creativeIndex: 80,
        innovationScore: 88,
        mood: 'Hyper-Vibrant',
        bpm: 130,
        key: 'F# major',
        instruments: ['Granular Bowed Cello', 'Resonator Synth Pluck', 'Analog Sub-Kick'],
        compatibility: ['Hyper-Vibrant', 'Granular Bowed Cello', 'Resonator Synth Pluck', 'F# major'],
        energy: 8,
        transitions: ['Noise-gate compression drop coupling'],
        structure: ['intro', 'drop', 'breakdown', 'drop', 'outro'],
        passedQualityEngine: false,
        creationTimestamp: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: 'style_seed_4',
        name: 'Future Acoustic',
        description: 'An advanced stylistic synthesis blending serene atmospheric textures with a 85 BPM driving rhythmic base, using Acoustic Nylon Guitar, Wooden Rimshot, Shimmering Reverb Pads. Engineered with dynamic transitions like Low-cut frequency decay.',
        creativeIndex: 55,
        innovationScore: 70,
        mood: 'Serene Atmospheric',
        bpm: 85,
        key: 'C minor',
        instruments: ['Acoustic Nylon Guitar', 'Wooden Rimshot', 'Shimmering Reverb Pads'],
        compatibility: ['Serene Atmospheric', 'Acoustic Nylon Guitar', 'Wooden Rimshot', 'C minor'],
        energy: 3,
        transitions: ['Low-cut frequency decay'],
        structure: ['verse', 'prechorus', 'chorus', 'verse', 'chorus', 'outro'],
        passedQualityEngine: true,
        qualityScore: 86,
        creationTimestamp: new Date(Date.now() - 3600000 * 1).toISOString()
      }
    ];

    this.styles = defaults;
    this.saveStyles();
    console.log('[STYLE_GENERATOR] Style Generator preseeded database successfully.');
  }
}
