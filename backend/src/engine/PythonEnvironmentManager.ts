import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface EnvironmentAuditResult {
  virtualEnv: boolean;
  pythonVersion: string;
  pythonVersionOk: boolean;
  pythonBinary: string;
  packages: Record<string, { status: 'OK' | 'MISSING'; version?: string | null }>;
  missingPackages: string[];
  checkpointStatus: string;
  installRequired: boolean;
  isReady: boolean;
  status: 'READY' | 'INSTALL REQUIRED' | 'ERROR';
  rawOutput?: string;
}

export class PythonEnvironmentManager {
  private static instance: PythonEnvironmentManager | null = null;
  private cachedAudit: EnvironmentAuditResult | null = null;
  private lastAuditTime: number = 0;
  private readonly CACHE_TTL = 5000;

  public static getInstance(): PythonEnvironmentManager {
    if (!PythonEnvironmentManager.instance) {
      PythonEnvironmentManager.instance = new PythonEnvironmentManager();
    }
    return PythonEnvironmentManager.instance;
  }

  /**
   * Returns the absolute path to the dedicated project Python binary.
   * NEVER returns global system `/usr/bin/python3`.
   */
  public getPythonBinaryPath(): string {
    const cwd = process.cwd();
    const primaryEnv = path.join(cwd, 'python_env', 'bin', 'python');
    const secondaryEnv = path.join(cwd, 'venv', 'bin', 'python');

    if (fs.existsSync(primaryEnv)) {
      return primaryEnv;
    }
    if (fs.existsSync(secondaryEnv)) {
      return secondaryEnv;
    }

    // Fallback: return python_env path so execution targets dedicated env
    return primaryEnv;
  }

  /**
   * Verifies virtual environment integrity, Python version, dependencies and checkpoints.
   */
  public async verifyEnvironment(forceRefresh = false): Promise<EnvironmentAuditResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedAudit && (now - this.lastAuditTime) < this.CACHE_TTL) {
      return this.cachedAudit;
    }

    const pythonBin = this.getPythonBinaryPath();
    const verifyScript = this.getVerifyScriptPath();

    if (!fs.existsSync(pythonBin)) {
      console.error(`[PythonEnvironmentManager] Dedicated Python environment binary missing at ${pythonBin}`);
      console.log('[PythonEnvironmentManager] INSTALL REQUIRED');
      const errRes: EnvironmentAuditResult = {
        virtualEnv: false,
        pythonVersion: 'UNKNOWN',
        pythonVersionOk: false,
        pythonBinary: pythonBin,
        packages: {},
        missingPackages: ['python_env'],
        checkpointStatus: 'UNAVAILABLE',
        installRequired: true,
        isReady: false,
        status: 'INSTALL REQUIRED'
      };
      this.cachedAudit = errRes;
      this.lastAuditTime = now;
      return errRes;
    }

    return new Promise((resolve) => {
      execFile(pythonBin, [verifyScript], { cwd: process.cwd() }, (error, stdout, stderr) => {
        try {
          const match = stdout.match(/JSON_START(.*?)JSON_END/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            const installReq = parsed.install_required || (parsed.missing_packages && parsed.missing_packages.length > 0);
            
            if (installReq) {
              console.warn(`[PythonEnvironmentManager] INSTALL REQUIRED - Missing packages: ${parsed.missing_packages?.join(', ')}`);
            }

            const res: EnvironmentAuditResult = {
              virtualEnv: parsed.virtual_env,
              pythonVersion: parsed.python_version,
              pythonVersionOk: parsed.python_version_ok,
              pythonBinary: parsed.python_binary,
              packages: parsed.packages || {},
              missingPackages: parsed.missing_packages || [],
              checkpointStatus: parsed.checkpoint_status || 'UNKNOWN',
              installRequired: installReq,
              isReady: !installReq && parsed.python_version_ok,
              status: installReq ? 'INSTALL REQUIRED' : 'READY',
              rawOutput: stdout
            };

            this.cachedAudit = res;
            this.lastAuditTime = now;
            return resolve(res);
          }
        } catch (e) {
          console.error('[PythonEnvironmentManager] Error parsing verify_environment output:', e);
        }

        console.warn(`[PythonEnvironmentManager] INSTALL REQUIRED - Verification process output failed: ${stderr.trim() || error?.message}`);
        const fallbackRes: EnvironmentAuditResult = {
          virtualEnv: true,
          pythonVersion: '3.10',
          pythonVersionOk: true,
          pythonBinary: pythonBin,
          packages: {},
          missingPackages: ['torch', 'torchaudio', 'transformers', 'audiocraft'],
          checkpointStatus: 'UNAVAILABLE',
          installRequired: true,
          isReady: false,
          status: 'INSTALL REQUIRED'
        };

        this.cachedAudit = fallbackRes;
        this.lastAuditTime = now;
        resolve(fallbackRes);
      });
    });
  }

  private getVerifyScriptPath(): string {
    const localScript = path.join(process.cwd(), 'engine', 'verify_environment.py');
    return fs.existsSync(localScript)
      ? localScript
      : (fs.existsSync('/workspace/engine/verify_environment.py') ? '/workspace/engine/verify_environment.py' : localScript);
  }
}
