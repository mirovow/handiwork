export const IMAGE_PROCESSING_SERVICE = 'IMAGE_PROCESSING_SERVICE';

export interface IImageProcessingService {
  processImage(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    maxColors: number,
    threadPalette: string,
  ): Promise<{
    patternData: string[][];
    palette: Array<{
      manufacturer: string;
      code: string;
      name: string;
      rgb: [number, number, number];
      hex: string;
    }>;
  }>;
}
