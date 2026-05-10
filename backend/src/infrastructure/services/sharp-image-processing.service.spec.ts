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
    const result = await service.processImage(inputPath, outputPath, 4, 1, 2);

    expect(result.palette).toHaveLength(2);
    expect(new Set(result.patternData.flat())).toHaveProperty('size', 2);
  });
});
