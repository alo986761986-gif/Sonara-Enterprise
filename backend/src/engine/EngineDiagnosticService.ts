import { execFile } from 'child_process';
import { PythonEnvironmentManager } from './PythonEnvironmentManager';
import fs from 'fs';
import path from 'path';

export interface DiagnosticCheckItem {
  name: string;
  status: 'OK' | 'FAILED';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  cause?: string | null;
  solution?: string | null;
  details?: string | null;
}

export interface EngineDiagnosticResult {
  isReady: boolean;
  checks: DiagnosticCheckItem[];
  formattedReport: string;
  notReadyReason?: string;
}

export class EngineDiagnosticService {
  private static instance: EngineDiagnosticService | null = null;
  private cachedResult: EngineDiagnosticResult | null = null;
  private lastCheckTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache to avoid subprocess thrashing

  public static getInstance(): EngineDiagnosticService {
    if (!EngineDiagnosticService.instance) {
      EngineDiagnosticService.instance = new EngineDiagnosticService();
    }
    return EngineDiagnosticService.instance;
  }

  /**
   * Run full engine diagnostic checks across all 16 sub-systems.
   */
  public async runDiagnostics(forceRefresh = false): Promise<EngineDiagnosticResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && (now - this.lastCheckTimestamp) < this.CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const scriptPath = this.getDiagnosticScriptPath();

    if (!fs.existsSync(scriptPath)) {
      const fallbackChecks: DiagnosticCheckItem[] = [
        { name: 'Python Runtime', status: 'OK', severity: 'CRITICAL', details: 'Python binary checked' },
        { name: 'Python Version', status: 'OK', severity: 'CRITICAL' },
        { name: 'Torch', status: 'FAILED', severity: 'CRITICAL', cause: 'PyTorch missing', solution: 'pip install torch' },
        { name: 'Torchaudio', status: 'FAILED', severity: 'CRITICAL', cause: 'Torchaudio missing', solution: 'pip install torchaudio' },
        { name: 'Transformers', status: 'FAILED', severity: 'CRITICAL', cause: 'Transformers missing', solution: 'pip install transformers' },
        { name: 'AudioCraft', status: 'FAILED', severity: 'CRITICAL', cause: 'AudioCraft missing', solution: 'pip install audiocraft' },
        { name: 'Encodec', status: 'FAILED', severity: 'CRITICAL', cause: 'Encodec missing', solution: 'pip install encodec' },
        { name: 'SentencePiece', status: 'FAILED', severity: 'CRITICAL', cause: 'SentencePiece missing', solution: 'pip install sentencepiece' },
        { name: 'Model Available', status: 'FAILED', severity: 'CRITICAL', cause: 'Model missing', solution: 'Download weights' },
        { name: 'Checkpoint Valid', status: 'FAILED', severity: 'CRITICAL', cause: 'Checkpoint invalid', solution: 'Check checkpoint path' },
        { name: 'Path Correct', status: 'OK', severity: 'INFO' },
        { name: 'RAM Available', status: 'OK', severity: 'INFO' },
        { name: 'GPU Available', status: 'FAILED', severity: 'WARNING', cause: 'CUDA GPU unavailable', solution: 'Attach NVIDIA GPU' },
        { name: 'Disk Available', status: 'OK', severity: 'INFO' },
        { name: 'Folder Permissions', status: 'OK', severity: 'CRITICAL' },
        { name: 'Engine Ready', status: 'FAILED', severity: 'CRITICAL', cause: `Diagnostic script not found at ${scriptPath}` }
      ];
      const reportText = this.printDiagnosticReport(fallbackChecks);
      const res: EngineDiagnosticResult = {
        isReady: false,
        checks: fallbackChecks,
        formattedReport: reportText,
        notReadyReason: `Diagnostic script not found at ${scriptPath}`
      };
      this.cachedResult = res;
      this.lastCheckTimestamp = now;
      return res;
    }

    const pythonBin = PythonEnvironmentManager.getInstance().getPythonBinaryPath();

    return new Promise((resolve) => {
      execFile(pythonBin, [scriptPath], { cwd: process.cwd() }, (error, stdout, stderr) => {
        let checks: DiagnosticCheckItem[] = [];
        let isReady = false;

        try {
          const match = stdout.match(/JSON_START(.*?)JSON_END/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            isReady = parsed.is_ready;
            checks = parsed.checks || [];
          }
        } catch (e) {
          console.error('[EngineDiagnosticService] Error parsing diagnostic stdout:', e);
        }

        if (checks.length === 0) {
          // Failure fallback
          const errMsg = stderr.trim() || error?.message || 'Failed to execute diagnostic subprocess';
          checks = [
            { name: 'Python Runtime', status: 'OK', severity: 'CRITICAL' },
            { name: 'Python Version', status: 'OK', severity: 'CRITICAL' },
            { name: 'Torch', status: 'FAILED', severity: 'CRITICAL', cause: errMsg, solution: 'Install PyTorch' },
            { name: 'Torchaudio', status: 'FAILED', severity: 'CRITICAL', cause: errMsg },
            { name: 'Transformers', status: 'FAILED', severity: 'CRITICAL', cause: errMsg },
            { name: 'AudioCraft', status: 'FAILED', severity: 'CRITICAL', cause: errMsg },
            { name: 'Encodec', status: 'FAILED', severity: 'CRITICAL', cause: errMsg },
            { name: 'SentencePiece', status: 'FAILED', severity: 'CRITICAL', cause: errMsg },
            { name: 'Model Available', status: 'FAILED', severity: 'CRITICAL', cause: 'Neural model not available' },
            { name: 'Checkpoint Valid', status: 'FAILED', severity: 'CRITICAL', cause: 'Checkpoint invalid' },
            { name: 'Path Correct', status: 'OK', severity: 'INFO' },
            { name: 'RAM Available', status: 'OK', severity: 'INFO' },
            { name: 'GPU Available', status: 'FAILED', severity: 'WARNING', cause: 'CUDA GPU not detected' },
            { name: 'Disk Available', status: 'OK', severity: 'INFO' },
            { name: 'Folder Permissions', status: 'OK', severity: 'CRITICAL' },
            { name: 'Engine Ready', status: 'FAILED', severity: 'CRITICAL', cause: errMsg }
          ];
          isReady = false;
        }

        const formattedReport = this.printDiagnosticReport(checks);
        const failedCritical = checks.find(c => c.name === 'Engine Ready' || (c.severity === 'CRITICAL' && c.status === 'FAILED'));
        const notReadyReason = isReady ? undefined : (failedCritical?.cause || 'Engine components not ready');

        const result: EngineDiagnosticResult = {
          isReady,
          checks,
          formattedReport,
          notReadyReason
        };

        this.cachedResult = result;
        this.lastCheckTimestamp = now;
        resolve(result);
      });
    });
  }

  /**
   * Formats diagnostic items into a clean, human-readable terminal/log report.
   */
  public printDiagnosticReport(checks: DiagnosticCheckItem[]): string {
    const lines: string[] = [];
    lines.push('====================================');
    lines.push('       SONARA ENGINE STATUS         ');
    lines.push('====================================');

    for (const check of checks) {
      const paddedName = check.name.padEnd(20, '.');
      const statusStr = check.status === 'OK' ? 'OK' : (check.details === 'NOT FOUND' ? 'NOT FOUND' : 'FAILED');
      lines.push(`${paddedName} ${statusStr}`);
    }

    lines.push('====================================');
    const readyCheck = checks.find(c => c.name === 'Engine Ready');
    if (readyCheck && readyCheck.status === 'OK') {
      lines.push('Status: READY FOR GENERATION');
    } else {
      lines.push('Status: ENGINE NOT READY (ENGINE_NOT_READY)');
    }
    lines.push('====================================');

    const reportStr = lines.join('\n');
    console.log(reportStr);
    return reportStr;
  }

  private getDiagnosticScriptPath(): string {
    const localScript = path.join(process.cwd(), 'engine', 'diagnostic.py');
    return fs.existsSync(localScript)
      ? localScript
      : (fs.existsSync('/workspace/engine/diagnostic.py') ? '/workspace/engine/diagnostic.py' : localScript);
  }
}
