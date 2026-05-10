import type { PatternCell, StitchKind } from '../entities/pattern.entity';

export const IMAGE_PROCESSING_SERVICE = 'IMAGE_PROCESSING_SERVICE';

export interface IImageProcessingService {
  processImage(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    maxColors: number,
    threadPalette: string,
    selectedStitchKinds: StitchKind[],
  ): Promise<{
    patternData: PatternCell[][];
    palette: Array<{
      manufacturer: string;
      code: string;
      name: string;
      rgb: [number, number, number];
      hex: string;
    }>;
  }>;
}
