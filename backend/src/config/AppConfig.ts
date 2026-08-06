import path from "path";

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const numberFromEnv = (
  name: string,
  fallback: number,
  min?: number
): number => {
  const raw = process.env[name];

  if (!raw) return fallback;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }

  if (min !== undefined && parsed < min) {
    throw new Error(
      `Environment variable ${name} must be greater than or equal to ${min}.`
    );
  }

  return parsed;
};

export const appConfig = Object.freeze({
  environment: process.env.NODE_ENV ?? "development",

  server: {
    port: numberFromEnv("PORT", 3000, 1)
  },

  aceStep: {
    apiUrl: required(
      "ACE_STEP_API_URL",
      "http://127.0.0.1:8000"
    ).replace(/\/+$/, ""),

    healthTimeoutMs: numberFromEnv(
      "ACE_STEP_HEALTH_TIMEOUT_MS",
      10000,
      1000
    ),

    generationTimeoutMs: numberFromEnv(
      "ACE_STEP_GENERATION_TIMEOUT_MS",
      300000,
      10000
    )
  },

  jobs: {
    completionTimeoutMs: numberFromEnv(
      "JOB_COMPLETION_TIMEOUT_MS",
      360000,
      10000
    ),

    pollingIntervalMs: numberFromEnv(
      "JOB_POLLING_INTERVAL_MS",
      300,
      100
    )
  },

  storage: {
    audioDirectory: path.join(
      process.cwd(),
      process.env.SONARA_AUDIO_DIR ?? "storage/audio"
    ),

    outputDirectory: path.join(
      process.cwd(),
      process.env.SONARA_OUTPUT_DIR ?? "output"
    )
  }
});

export type AppConfig = typeof appConfig;
