import { MusicDnaLibraryService } from './MusicDnaLibraryService';
import { ContinuousLearningService } from './ContinuousLearningService';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export interface DirectorPreFlightPlan {
  genre: string;
  subgenre: string;
  mood: string;
  energy: string;
  bpm: number;
  keySignature: string;
  structure: string[];
  instruments: string[];
  swingPct: number;
  chords: string[];
  recommendedModel: string;
  recalledMemoryDnaId?: string;
}

export interface DirectorProductionResult {
  status: string;
  director: string;
  executionTimeMs: number;
  preFlightPlan: DirectorPreFlightPlan;
  dspReport: {
    integratedLufs: number;
    truePeakDbtp: number;
    stereoPhaseCorrelation: number;
    status: string;
  };
  qualityAudit: {
    scores: {
      genreFidelity: number;
      grooveScore: number;
      mixingScore: number;
      masteringScore: number;
      dynamicScore: number;
      stereoScore: number;
      clarityScore: number;
      creativityScore: number;
      overallScore: number;
    };
    overallScore: number;
    qualityThreshold: number;
    approved: boolean;
    status: string;
  };
  retryCount: number;
  pipelineLog: string[];
  audioFile: string;
}

export class SonaraDirectorService {
  /**
   * Executes the full Sonara AI Director multi-pass production workflow.
   */
  public static async executeProductionPipeline(
    prompt: string,
    genre?: string
  ): Promise<DirectorProductionResult> {
    const safePrompt = prompt.replace(/'/g, "\\'");
    const safeGenre = genre ? genre.replace(/'/g, "\\'") : '';

    // 1. Recall optimal DNA from Music Brain
    const brainRecall = MusicDnaLibraryService.recallOptimalDna(prompt, genre || '');

    // 2. Invoke Python Director AI Engine
    const pythonBin = PythonEnvironmentManager.getInstance().getPythonBinaryPath();
    const pythonCmd = `"${pythonBin}" -c "import json, sys; from engine.director_ai import DirectorAI; d = DirectorAI(); res = d.process_production_request('${safePrompt}', '${safeGenre}'); print(json.dumps(res))"`;

    const { stdout } = await execPromise(pythonCmd, { maxBuffer: 10 * 1024 * 1024 });
    const pyRes = JSON.parse(stdout.trim());

    // 3. Register production into Music Brain
    const promptAnalysis = pyRes.prompt_analysis;
    const qualityAudit = pyRes.quality_audit;
    const dspReport = pyRes.dsp_report;

    const loggedRecord = ContinuousLearningService.logAndLearn({
      prompt: prompt,
      genre: promptAnalysis.genre,
      subgenre: promptAnalysis.subgenre,
      bpm: promptAnalysis.bpm,
      keySignature: promptAnalysis.key_signature,
      structure: promptAnalysis.structure,
      instruments: promptAnalysis.instruments,
      swingPct: promptAnalysis.swing_pct,
      chords: promptAnalysis.chords,
      audioQuality: {
        lufs: dspReport.integrated_lufs,
        truePeakDbtp: dspReport.true_peak_dbtp,
        stereoPhaseCorrelation: dspReport.stereo_phase_correlation,
        noiseFloorDbfs: -85.0
      }
    });

    return {
      status: pyRes.status,
      director: pyRes.director,
      executionTimeMs: pyRes.execution_time_ms,
      preFlightPlan: {
        genre: promptAnalysis.genre,
        subgenre: promptAnalysis.subgenre,
        mood: promptAnalysis.mood,
        energy: promptAnalysis.energy,
        bpm: promptAnalysis.bpm,
        keySignature: promptAnalysis.key_signature,
        structure: promptAnalysis.structure,
        instruments: promptAnalysis.instruments,
        swingPct: promptAnalysis.swing_pct,
        chords: promptAnalysis.chords,
        recommendedModel: promptAnalysis.recommended_model,
        recalledMemoryDnaId: brainRecall.recalledDna?.id
      },
      dspReport: {
        integratedLufs: dspReport.integrated_lufs,
        truePeakDbtp: dspReport.true_peak_dbtp,
        stereoPhaseCorrelation: dspReport.stereo_phase_correlation,
        status: dspReport.status
      },
      qualityAudit: {
        scores: qualityAudit.scores,
        overallScore: qualityAudit.overall_score,
        qualityThreshold: qualityAudit.quality_threshold,
        approved: qualityAudit.approved,
        status: qualityAudit.status
      },
      retryCount: pyRes.retry_count,
      pipelineLog: pyRes.pipeline_log,
      audioFile: pyRes.audio_file
    };
  }
}
