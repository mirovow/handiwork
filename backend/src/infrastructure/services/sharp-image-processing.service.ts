import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { IImageProcessingService } from '../../domain/ports/image-processing.service';
import type {
  CellStitch,
  PatternCell,
  StitchCorner,
  StitchDirection,
  StitchKind,
} from '../../domain/entities/pattern.entity';
import {
  getThreadPalette,
  isThreadPaletteId,
  type ThreadColor,
} from '../utils/thread-palettes';

@Injectable()
export class SharpImageProcessingService implements IImageProcessingService {
  async processImage(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    maxColors: number,
    threadPalette: string,
    selectedStitchKinds: StitchKind[] = ['full_cross'],
    stitchBackground = true,
  ) {
    if (!isThreadPaletteId(threadPalette)) {
      throw new Error(`Unknown thread palette: ${threadPalette}`);
    }

    const sourcePalette = getThreadPalette(threadPalette);
    const metadata = await sharp(inputPath).metadata();
    const { width: actualWidth, height: actualHeight } = this.calculatePatternSize(
      metadata.width ?? width,
      metadata.height ?? height,
      width,
      height,
    );
    const rawImage = await sharp(inputPath)
      .resize(actualWidth, actualHeight, {
        kernel: sharp.kernel.nearest // Nearest neighbor to keep pixel art style
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = rawImage;
    const backgroundMask = stitchBackground ? new Set<number>() : this.createBackgroundMask(data, info);
    const initialPatternData: string[][] = [];
    const paletteStats = new Map<string, { color: ThreadColor; count: number }>();

    for (let y = 0; y < info.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = info.channels === 4 ? data[offset + 3] : 255;

        // Skip transparent pixels or treat as white/empty
        if (a < 128 || backgroundMask.has(y * info.width + x)) {
          row.push('EMPTY');
          continue;
        }

        const nearestThreadColor = this.findNearestColor({ rgb: [r, g, b] }, sourcePalette);
        row.push(nearestThreadColor.code);

        const existingStat = paletteStats.get(nearestThreadColor.code);
        paletteStats.set(nearestThreadColor.code, {
          color: nearestThreadColor,
          count: (existingStat?.count ?? 0) + 1,
        });
      }
      initialPatternData.push(row);
    }

    const limitedPalette = Array.from(paletteStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, maxColors)
      .map((entry) => entry.color);
    const colorsByName = new Map(
      Array.from(paletteStats.values()).map((entry) => [entry.color.code, entry.color]),
    );
    const limitedPaletteByCode = new Map(limitedPalette.map((color) => [color.code, color]));
    const mappedThreadCodes = initialPatternData.map((row) =>
      row.map((threadCode) => {
        if (threadCode === 'EMPTY' || limitedPaletteByCode.has(threadCode)) {
          return threadCode;
        }

        const sourceColor = colorsByName.get(threadCode);
        if (!sourceColor) {
          return 'EMPTY';
        }

        return this.findNearestColor(sourceColor, limitedPalette).code;
      }),
    );
    const usedPaletteMap = new Map<string, ThreadColor>();
    for (const row of mappedThreadCodes) {
      for (const threadCode of row) {
        if (threadCode === 'EMPTY') {
          continue;
        }

        const color = limitedPaletteByCode.get(threadCode);
        if (color) {
          usedPaletteMap.set(threadCode, color);
        }
      }
    }
    const patternData: PatternCell[][] = mappedThreadCodes.map((row, y) =>
      row.map((threadCode, x) => ({
        x,
        y,
        stitches: threadCode === 'EMPTY'
          ? []
          : [this.createCellStitch(x, y, threadCode, mappedThreadCodes, selectedStitchKinds)],
      })),
    );

    // Generate preview image using the mapped thread colors.
    const outputData = Buffer.alloc(info.width * info.height * 3);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const threadCode = patternData[y][x].stitches[0]?.threadCode;
        const offset = (y * info.width + x) * 3;
        
        if (!threadCode) {
          outputData[offset] = 255;
          outputData[offset + 1] = 255;
          outputData[offset + 2] = 255;
        } else {
          const threadColor = usedPaletteMap.get(threadCode);
          if (!threadColor) {
            outputData[offset] = 255;
            outputData[offset + 1] = 255;
            outputData[offset + 2] = 255;
            continue;
          }

          outputData[offset] = threadColor.rgb[0];
          outputData[offset + 1] = threadColor.rgb[1];
          outputData[offset + 2] = threadColor.rgb[2];
        }
      }
    }

    await sharp(outputData, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 3
      }
    }).toFile(outputPath);

    return {
      width: info.width,
      height: info.height,
      patternData,
      palette: Array.from(usedPaletteMap.values()),
    };
  }

  private calculatePatternSize(
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number } {
    const sourceAspectRatio = sourceWidth / sourceHeight;
    const targetAspectRatio = maxWidth / maxHeight;

    if (sourceAspectRatio >= targetAspectRatio) {
      return {
        width: maxWidth,
        height: Math.max(1, Math.round(maxWidth / sourceAspectRatio)),
      };
    }

    return {
      width: Math.max(1, Math.round(maxHeight * sourceAspectRatio)),
      height: maxHeight,
    };
  }

  private createBackgroundMask(
    data: Buffer,
    info: { width: number; height: number; channels: number },
  ): Set<number> {
    const backgroundColor = this.findDominantEdgeColor(data, info);
    if (!backgroundColor) {
      return new Set<number>();
    }

    const mask = new Set<number>();
    const queue: Array<{ x: number; y: number }> = [];
    const enqueue = (x: number, y: number) => {
      const key = y * info.width + x;
      if (mask.has(key) || !this.isBackgroundLikePixel(data, info, x, y, backgroundColor)) {
        return;
      }

      mask.add(key);
      queue.push({ x, y });
    };

    for (let x = 0; x < info.width; x++) {
      enqueue(x, 0);
      enqueue(x, info.height - 1);
    }

    for (let y = 0; y < info.height; y++) {
      enqueue(0, y);
      enqueue(info.width - 1, y);
    }

    for (let index = 0; index < queue.length; index++) {
      const { x, y } = queue[index];
      if (x > 0) enqueue(x - 1, y);
      if (x < info.width - 1) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y < info.height - 1) enqueue(x, y + 1);
    }

    return mask;
  }

  private findDominantEdgeColor(
    data: Buffer,
    info: { width: number; height: number; channels: number },
  ): [number, number, number] | null {
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    const addPixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      const a = info.channels === 4 ? data[offset + 3] : 255;
      if (a < 128) {
        return;
      }

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const key = `${r >> 4}:${g >> 4}:${b >> 4}`;
      const existing = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
      buckets.set(key, existing);
    };

    for (let x = 0; x < info.width; x++) {
      addPixel(x, 0);
      addPixel(x, info.height - 1);
    }

    for (let y = 1; y < info.height - 1; y++) {
      addPixel(0, y);
      addPixel(info.width - 1, y);
    }

    const dominant = Array.from(buckets.values()).sort((a, b) => b.count - a.count)[0];
    if (!dominant) {
      return null;
    }

    return [
      Math.round(dominant.r / dominant.count),
      Math.round(dominant.g / dominant.count),
      Math.round(dominant.b / dominant.count),
    ];
  }

  private isBackgroundLikePixel(
    data: Buffer,
    info: { width: number; height: number; channels: number },
    x: number,
    y: number,
    backgroundColor: [number, number, number],
  ): boolean {
    const offset = (y * info.width + x) * info.channels;
    const a = info.channels === 4 ? data[offset + 3] : 255;
    if (a < 128) {
      return false;
    }

    const dr = data[offset] - backgroundColor[0];
    const dg = data[offset + 1] - backgroundColor[1];
    const db = data[offset + 2] - backgroundColor[2];
    return dr * dr + dg * dg + db * db <= 45 * 45;
  }

  private findNearestColor(
    sourceColor: { rgb: [number, number, number] },
    palette: ThreadColor[],
  ): ThreadColor {
    let minDistance = Infinity;
    let nearestColor = palette[0];

    for (const color of palette) {
      const dr = sourceColor.rgb[0] - color.rgb[0];
      const dg = sourceColor.rgb[1] - color.rgb[1];
      const db = sourceColor.rgb[2] - color.rgb[2];
      const distance = dr * dr + dg * dg + db * db;

      if (distance < minDistance) {
        minDistance = distance;
        nearestColor = color;
      }
    }

    return nearestColor;
  }

  private createCellStitch(
    x: number,
    y: number,
    threadCode: string,
    threadCodeGrid: string[][],
    selectedStitchKinds: StitchKind[],
  ): CellStitch {
    const kind = this.pickStitchKind(x, y, threadCode, threadCodeGrid, selectedStitchKinds);
    const stitch: CellStitch = {
      id: `${x}:${y}:${this.getStitchIdSuffix(kind)}`,
      kind,
      threadCode,
    };

    if (kind === 'half_cross' || kind === 'three_quarter_cross') {
      stitch.direction = this.pickDirection(x, y);
    }

    if (kind === 'quarter_cross' || kind === 'three_quarter_cross') {
      stitch.corner = this.pickCorner(x, y, threadCode, threadCodeGrid);
    }

    return stitch;
  }

  private pickStitchKind(
    x: number,
    y: number,
    threadCode: string,
    threadCodeGrid: string[][],
    selectedStitchKinds: StitchKind[],
  ): StitchKind {
    if (selectedStitchKinds.length === 1) {
      return selectedStitchKinds[0];
    }

    const boundarySides = this.getBoundarySides(x, y, threadCode, threadCodeGrid);
    const isCornerBoundary = this.hasCornerBoundary(boundarySides);

    if (isCornerBoundary && selectedStitchKinds.includes('three_quarter_cross')) {
      return 'three_quarter_cross';
    }

    if (isCornerBoundary && selectedStitchKinds.includes('quarter_cross')) {
      return 'quarter_cross';
    }

    if (boundarySides.length > 0 && selectedStitchKinds.includes('half_cross')) {
      return 'half_cross';
    }

    if (selectedStitchKinds.includes('full_cross')) {
      return 'full_cross';
    }

    return selectedStitchKinds[0];
  }

  private getBoundarySides(
    x: number,
    y: number,
    threadCode: string,
    threadCodeGrid: string[][],
  ): Array<'top' | 'right' | 'bottom' | 'left'> {
    const neighbors = [
      { side: 'top' as const, x, y: y - 1 },
      { side: 'right' as const, x: x + 1, y },
      { side: 'bottom' as const, x, y: y + 1 },
      { side: 'left' as const, x: x - 1, y },
    ];

    return neighbors
      .filter((neighbor) => threadCodeGrid[neighbor.y]?.[neighbor.x] !== threadCode)
      .map((neighbor) => neighbor.side);
  }

  private hasCornerBoundary(boundarySides: Array<'top' | 'right' | 'bottom' | 'left'>): boolean {
    return (
      (boundarySides.includes('top') && boundarySides.includes('left')) ||
      (boundarySides.includes('top') && boundarySides.includes('right')) ||
      (boundarySides.includes('bottom') && boundarySides.includes('left')) ||
      (boundarySides.includes('bottom') && boundarySides.includes('right'))
    );
  }

  private pickDirection(x: number, y: number): StitchDirection {
    return (x + y) % 2 === 0 ? 'slash' : 'backslash';
  }

  private pickCorner(
    x: number,
    y: number,
    threadCode: string,
    threadCodeGrid: string[][],
  ): StitchCorner {
    const boundarySides = this.getBoundarySides(x, y, threadCode, threadCodeGrid);

    if (boundarySides.includes('top') && boundarySides.includes('left')) return 'top_left';
    if (boundarySides.includes('top') && boundarySides.includes('right')) return 'top_right';
    if (boundarySides.includes('bottom') && boundarySides.includes('left')) return 'bottom_left';
    if (boundarySides.includes('bottom') && boundarySides.includes('right')) return 'bottom_right';

    return (x + y) % 2 === 0 ? 'top_left' : 'bottom_right';
  }

  private getStitchIdSuffix(kind: StitchKind): string {
    if (kind === 'full_cross') return 'full';
    if (kind === 'half_cross') return 'half';
    if (kind === 'quarter_cross') return 'quarter';
    return 'three-quarter';
  }
}
