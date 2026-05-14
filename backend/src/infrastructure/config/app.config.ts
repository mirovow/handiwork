import { existsSync, mkdirSync } from 'fs';
import { isAbsolute, join } from 'path';

export interface BackendConfig {
  mongoUri: string;
  host: string;
  port: number;
  uploadsDir: string;
  maxUploadSizeBytes: number;
  minPatternSize: number;
  maxPatternSize: number;
}

function parseIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
): number {
  const rawValue = env[key];
  if (rawValue === undefined || rawValue === '') {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

export function getBackendConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const minPatternSize = parseIntegerEnv(env, 'MIN_PATTERN_SIZE', 10);
  const maxPatternSize = parseIntegerEnv(env, 'MAX_PATTERN_SIZE', 500);

  if (minPatternSize > maxPatternSize) {
    throw new Error('MIN_PATTERN_SIZE must be less than or equal to MAX_PATTERN_SIZE');
  }

  return {
    mongoUri: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cross_stitch',
    host: env.HOST ?? '0.0.0.0',
    port: parseIntegerEnv(env, 'PORT', 3000),
    uploadsDir: env.UPLOADS_DIR ?? 'uploads',
    maxUploadSizeBytes: parseIntegerEnv(env, 'MAX_UPLOAD_SIZE_BYTES', 10 * 1024 * 1024),
    minPatternSize,
    maxPatternSize,
  };
}

export function getUploadsPath(config: BackendConfig = getBackendConfig()): string {
  return isAbsolute(config.uploadsDir)
    ? config.uploadsDir
    : join(process.cwd(), config.uploadsDir);
}

export function ensureUploadsDirectory(uploadsPath: string): void {
  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }
}
