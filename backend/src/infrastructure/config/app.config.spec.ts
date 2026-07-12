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
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.UPLOADS_DIR;
    delete process.env.MAX_UPLOAD_SIZE_BYTES;
    delete process.env.BASIC_AUTH_USERNAME;
    delete process.env.BASIC_AUTH_PASSWORD;
    delete process.env.NODE_ENV;

    expect(getBackendConfig()).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017/cross_stitch',
      host: '0.0.0.0',
      port: 3000,
      uploadsDir: 'uploads',
      maxUploadSizeBytes: 10 * 1024 * 1024,
      minPatternSize: 10,
      maxPatternSize: 500,
      basicAuth: undefined,
    });
  });

  it('reads configured environment values', () => {
    process.env.MONGODB_URI = 'mongodb://example/cross_stitch';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4000';
    process.env.UPLOADS_DIR = 'custom-uploads';
    process.env.MAX_UPLOAD_SIZE_BYTES = '2048';
    process.env.MIN_PATTERN_SIZE = '5';
    process.env.MAX_PATTERN_SIZE = '250';
    process.env.BASIC_AUTH_USERNAME = 'admin';
    process.env.BASIC_AUTH_PASSWORD = 'secret';

    expect(getBackendConfig()).toMatchObject({
      mongoUri: 'mongodb://example/cross_stitch',
      host: '127.0.0.1',
      port: 4000,
      uploadsDir: 'custom-uploads',
      maxUploadSizeBytes: 2048,
      minPatternSize: 5,
      maxPatternSize: 250,
      basicAuth: {
        username: 'admin',
        password: 'secret',
      },
    });
  });

  it('rejects partial basic auth configuration', () => {
    process.env.BASIC_AUTH_USERNAME = 'admin';
    delete process.env.BASIC_AUTH_PASSWORD;

    expect(() => getBackendConfig()).toThrow(
      'BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be configured together',
    );
  });

  it('requires basic auth credentials in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BASIC_AUTH_USERNAME;
    delete process.env.BASIC_AUTH_PASSWORD;

    expect(() => getBackendConfig()).toThrow(
      'BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD are required in production',
    );
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
