import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { IImageProcessingService } from '../../domain/ports/image-processing.service';
import { findNearestDMC } from '../utils/dmc-palette';

type DmcColor = {
  name: string;
  hex: string;
  rgb: [number, number, number];
};

@Injectable()
export class SharpImageProcessingService implements IImageProcessingService {
  async processImage(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    maxColors: number,
  ) {
    const rawImage = await sharp(inputPath)
      .resize(width, height, {
        fit: 'contain',
        kernel: sharp.kernel.nearest // Nearest neighbor to keep pixel art style
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = rawImage;
    const initialPatternData: string[][] = [];
    const paletteStats = new Map<string, { color: DmcColor; count: number }>();

    for (let y = 0; y < info.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = info.channels === 4 ? data[offset + 3] : 255;

        // Skip transparent pixels or treat as white/empty
        if (a < 128) {
          row.push('EMPTY');
          continue;
        }

        const nearestDmc = findNearestDMC(r, g, b);
        row.push(nearestDmc.name);

        const existingStat = paletteStats.get(nearestDmc.name);
        paletteStats.set(nearestDmc.name, {
          color: nearestDmc as DmcColor,
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
      Array.from(paletteStats.values()).map((entry) => [entry.color.name, entry.color]),
    );
    const limitedPaletteByName = new Map(limitedPalette.map((color) => [color.name, color]));
    const patternData = initialPatternData.map((row) =>
      row.map((dmcName) => {
        if (dmcName === 'EMPTY' || limitedPaletteByName.has(dmcName)) {
          return dmcName;
        }

        const sourceColor = colorsByName.get(dmcName);
        if (!sourceColor) {
          return 'EMPTY';
        }

        return this.findNearestColor(sourceColor, limitedPalette).name;
      }),
    );
    const usedPaletteMap = new Map<string, DmcColor>();
    for (const row of patternData) {
      for (const dmcName of row) {
        if (dmcName === 'EMPTY') {
          continue;
        }

        const color = limitedPaletteByName.get(dmcName);
        if (color) {
          usedPaletteMap.set(dmcName, color);
        }
      }
    }

    // Generate preview image using the mapped DMC colors
    const outputData = Buffer.alloc(info.width * info.height * 3);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const dmcName = patternData[y][x];
        const offset = (y * info.width + x) * 3;
        
        if (dmcName === 'EMPTY') {
          outputData[offset] = 255;
          outputData[offset + 1] = 255;
          outputData[offset + 2] = 255;
        } else {
          const dmcColor = usedPaletteMap.get(dmcName);
          if (!dmcColor) {
            outputData[offset] = 255;
            outputData[offset + 1] = 255;
            outputData[offset + 2] = 255;
            continue;
          }

          outputData[offset] = dmcColor.rgb[0];
          outputData[offset + 1] = dmcColor.rgb[1];
          outputData[offset + 2] = dmcColor.rgb[2];
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
      patternData,
      palette: Array.from(usedPaletteMap.values()),
    };
  }

  private findNearestColor(sourceColor: DmcColor, palette: DmcColor[]): DmcColor {
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
}
