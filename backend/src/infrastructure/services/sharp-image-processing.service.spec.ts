import sharp from 'sharp';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SharpImageProcessingService } from './sharp-image-processing.service';

describe('SharpImageProcessingService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cross-stitch-sharp-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('limits the generated palette to the requested number of colors', async () => {
    const inputPath = join(tempDir, 'input.png');
    const outputPath = join(tempDir, 'output.png');
    const image = Buffer.from([
      255, 0, 0,
      0, 255, 0,
      0, 0, 255,
      255, 255, 255,
    ]);

    await sharp(image, {
      raw: {
        width: 4,
        height: 1,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 4, 1, 2, 'DMC');

    expect(result.palette).toHaveLength(2);
    const threadCodes = result.patternData.flat().flatMap((cell) => cell.stitches.map((stitch) => stitch.threadCode));
    expect(new Set(threadCodes)).toHaveProperty('size', 2);
    expect(result.patternData.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stitches: [expect.objectContaining({ id: expect.stringMatching(/^\d+:\d+:full$/), kind: 'full_cross' })],
        }),
      ]),
    );
  });

  it('preserves source aspect ratio inside the requested pattern bounds', async () => {
    const inputPath = join(tempDir, 'wide-input.png');
    const outputPath = join(tempDir, 'wide-output.png');

    await sharp(Buffer.alloc(200 * 100 * 3, 255), {
      raw: {
        width: 200,
        height: 100,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 100, 100, 10, 'DMC');
    const outputMetadata = await sharp(outputPath).metadata();

    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.patternData).toHaveLength(50);
    expect(result.patternData[0]).toHaveLength(100);
    expect(outputMetadata.width).toBe(100);
    expect(outputMetadata.height).toBe(50);
  });

  it('uses the requested thread palette for generated colors', async () => {
    const inputPath = join(tempDir, 'anchor-input.png');
    const outputPath = join(tempDir, 'anchor-output.png');

    await sharp(Buffer.from([255, 255, 255]), {
      raw: {
        width: 1,
        height: 1,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 1, 1, 10, 'ANCHOR');

    expect(result.patternData).toEqual([
      [{ x: 0, y: 0, stitches: [{ id: '0:0:full', kind: 'full_cross', threadCode: '00001' }] }],
    ]);
    expect(result.palette).toEqual([
      expect.objectContaining({
        manufacturer: 'ANCHOR',
        code: '00001',
      }),
    ]);
  });

  it('uses a single selected stitch kind for every non-empty cell', async () => {
    const inputPath = join(tempDir, 'half-input.png');
    const outputPath = join(tempDir, 'half-output.png');

    await sharp(Buffer.from([255, 255, 255]), {
      raw: {
        width: 1,
        height: 1,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 1, 1, 10, 'ANCHOR', ['half_cross']);

    expect(result.patternData[0][0].stitches).toEqual([
      { id: '0:0:half', kind: 'half_cross', threadCode: '00001', direction: 'slash' },
    ]);
  });

  it('uses selected fractional stitches on color boundaries', async () => {
    const inputPath = join(tempDir, 'boundary-input.png');
    const outputPath = join(tempDir, 'boundary-output.png');
    const image = Buffer.from([
      0, 0, 0,
      255, 255, 255,
      255, 255, 255,
      255, 255, 255,
    ]);

    await sharp(image, {
      raw: {
        width: 2,
        height: 2,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 2, 2, 10, 'DMC', [
      'full_cross',
      'half_cross',
      'quarter_cross',
      'three_quarter_cross',
    ]);
    const stitchKinds = result.patternData.flat().map((cell) => cell.stitches[0]?.kind);

    expect(stitchKinds).toContain('three_quarter_cross');
  });

  it('creates empty pattern cells for transparent pixels', async () => {
    const inputPath = join(tempDir, 'transparent-input.png');
    const outputPath = join(tempDir, 'transparent-output.png');

    await sharp(Buffer.from([255, 0, 0, 0]), {
      raw: {
        width: 1,
        height: 1,
        channels: 4,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 1, 1, 10, 'DMC');

    expect(result.patternData).toEqual([[{ x: 0, y: 0, stitches: [] }]]);
    expect(result.palette).toEqual([]);
  });

  it('removes only edge-connected background when background stitching is disabled', async () => {
    const inputPath = join(tempDir, 'background-input.png');
    const outputPath = join(tempDir, 'background-output.png');
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    const image = Buffer.from([
      ...white, ...white, ...white, ...white, ...white,
      ...white, ...black, ...black, ...black, ...white,
      ...white, ...black, ...white, ...black, ...white,
      ...white, ...black, ...black, ...black, ...white,
      ...white, ...white, ...white, ...white, ...white,
    ]);

    await sharp(image, {
      raw: {
        width: 5,
        height: 5,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 5, 5, 10, 'DMC', ['full_cross'], false);

    expect(result.patternData[0][0].stitches).toEqual([]);
    expect(result.patternData[2][2].stitches).toEqual([
      expect.objectContaining({ kind: 'full_cross' }),
    ]);
  });

  it('keeps the background when background stitching is enabled', async () => {
    const inputPath = join(tempDir, 'stitched-background-input.png');
    const outputPath = join(tempDir, 'stitched-background-output.png');

    await sharp(Buffer.from([
      255, 255, 255,
      0, 0, 0,
    ]), {
      raw: {
        width: 2,
        height: 1,
        channels: 3,
      },
    }).png().toFile(inputPath);

    const service = new SharpImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, 2, 1, 10, 'DMC', ['full_cross'], true);

    expect(result.patternData[0][0].stitches).toHaveLength(1);
    expect(result.patternData[0][1].stitches).toHaveLength(1);
  });
});
