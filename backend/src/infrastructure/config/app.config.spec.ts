import { getBackendConfig, ensureUploadsDirectory } from './app.config';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('app config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses local development defaults', () => {
    delete process.env.MONGODB_URI;
    delete process.env.PORT;
    delete process.env.UPLOADS_DIR;
    delete process.env.MAX_UPLOAD_SIZE_BYTES;

    expect(getBackendConfig()).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017/cross_stitch',
      port: 3000,
      uploadsDir: 'uploads',
      maxUploadSizeBytes: 10 * 1024 * 1024,
      minPatternSize: 10,
      maxPatternSize: 500,
    });
  });

  it('reads configured environment values', () => {
    process.env.MONGODB_URI = 'mongodb://example/cross_stitch';
    process.env.PORT = '4000';
    process.env.UPLOADS_DIR = 'custom-uploads';
    process.env.MAX_UPLOAD_SIZE_BYTES = '2048';
    process.env.MIN_PATTERN_SIZE = '5';
    process.env.MAX_PATTERN_SIZE = '250';

    expect(getBackendConfig()).toMatchObject({
      mongoUri: 'mongodb://example/cross_stitch',
      port: 4000,
      uploadsDir: 'custom-uploads',
      maxUploadSizeBytes: 2048,
      minPatternSize: 5,
      maxPatternSize: 250,
    });
  });

  it('creates the uploads directory when it is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'cross-stitch-'));
    const uploadsDir = join(root, 'uploads');

    try {
      ensureUploadsDirectory(uploadsDir);
      expect(existsSync(uploadsDir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
