import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';

export type StemName = 'drums' | 'bass' | 'vocals' | 'other';

export interface StemSeparationResult {
  status: 'COMPLETED';
  engine: 'Demucs v4';
  model: string;
  device: 'cuda';
  outputDirectory: string;
  stems: Record<StemName, {
    path: string;
    url: string;
    bytes: number;
  }>;
}

export class StemSeparationService {
  public static isRequired(): boolean {
    return String(process.env.SONARA_REQUIRE_STEMS || 'true').toLowerCase() !== 'false';
  }

  public static async separate(
    inputWavPath: string,
    jobId: string
  ): Promise<StemSeparationResult> {
    if (!fs.existsSync(inputWavPath)) {
      throw new Error(`STEM_SEPARATION_FAILED: input WAV does not exist: ${inputWavPath}`);
    }

    const projectRoot = process.cwd();
    const outputDirectory = path.join(projectRoot, 'storage', 'stems', jobId);
    const scriptPath = path.join(projectRoot, 'engine', 'stem_separation.py');
    const pythonBinary = PythonEnvironmentManager.getInstance().getPythonBinaryPath();
    const model = process.env.SONARA_DEMUCS_MODEL || 'htdemucs_ft';

    if (!fs.existsSync(pythonBinary)) {
      throw new Error(`STEM_SEPARATION_FAILED: dedicated RunPod Python environment missing at ${pythonBinary}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`STEM_SEPARATION_FAILED: Demucs runner missing at ${scriptPath}`);
    }

    fs.mkdirSync(outputDirectory, { recursive: true });

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        pythonBinary,
        [
          scriptPath,
          '--input', inputWavPath,
          '--output', outputDirectory,
          '--model', model,
          '--device', 'cuda',
          '--segment', String(process.env.SONARA_DEMUCS_SEGMENT || '7'),
          '--overlap', String(process.env.SONARA_DEMUCS_OVERLAP || '0.25'),
          '--shifts', String(process.env.SONARA_DEMUCS_SHIFTS || '1')
        ],
        {
          cwd: projectRoot,
          timeout: Number(process.env.SONARA_DEMUCS_TIMEOUT_MS || 900_000),
          maxBuffer: 20 * 1024 * 1024,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          }
        },
        (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(
              `STEM_SEPARATION_FAILED: ${stderr.trim() || error.message}`
            ));
          }
          resolve({ stdout, stderr });
        }
      );
    });

    const match = result.stdout.match(/JSON_START([\s\S]*?)JSON_END/);
    if (!match?.[1]) {
      throw new Error(
        `STEM_SEPARATION_FAILED: Demucs returned no machine-readable result. ${result.stderr.trim()}`
      );
    }

    const parsed = JSON.parse(match[1]);
    if (parsed.status !== 'COMPLETED' || parsed.device !== 'cuda') {
      throw new Error(`STEM_SEPARATION_FAILED: ${parsed.error || 'GPU separation did not complete'}`);
    }

    const stems = {} as StemSeparationResult['stems'];
    for (const stemName of ['drums', 'bass', 'vocals', 'other'] as StemName[]) {
      const stemPath = String(parsed.stems?.[stemName] || '');
      if (!stemPath || !fs.existsSync(stemPath)) {
        throw new Error(`STEM_SEPARATION_FAILED: missing ${stemName} stem`);
      }

      const relativeStoragePath = path.relative(path.join(projectRoot, 'storage'), stemPath);
      if (relativeStoragePath.startsWith('..')) {
        throw new Error(`STEM_SEPARATION_FAILED: invalid output path for ${stemName}`);
      }

      stems[stemName] = {
        path: stemPath,
        url: `/storage/${relativeStoragePath.split(path.sep).join('/')}`,
        bytes: fs.statSync(stemPath).size
      };
    }

    return {
      status: 'COMPLETED',
      engine: 'Demucs v4',
      model,
      device: 'cuda',
      outputDirectory,
      stems
    };
  }
}
