export const IMAGE_PROCESSING_SERVICE = 'IMAGE_PROCESSING_SERVICE';

export interface IImageProcessingService {
  processImage(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    maxColors: number,
  ): Promise<{
    patternData: string[][];
    palette: Array<{ name: string; rgb: [number, number, number]; hex: string }>;
  }>;
}
