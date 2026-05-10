import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { PATTERN_REPOSITORY } from '../../domain/ports/pattern.repository';
import type { IPatternRepository } from '../../domain/ports/pattern.repository';
import { IMAGE_PROCESSING_SERVICE } from '../../domain/ports/image-processing.service';
import type { IImageProcessingService } from '../../domain/ports/image-processing.service';
import { Pattern, type StitchKind } from '../../domain/entities/pattern.entity';

@Injectable()
export class GeneratePatternUseCase {
  constructor(
    @Inject(PATTERN_REPOSITORY)
    private readonly patternRepository: IPatternRepository,
    @Inject(IMAGE_PROCESSING_SERVICE)
    private readonly imageProcessingService: IImageProcessingService,
    private readonly uploadsDir = 'uploads',
  ) {}

  async execute(
    inputImagePath: string,
    settings: {
      width: number;
      height: number;
      maxColors: number;
      threadPalette: string;
      selectedStitchKinds: StitchKind[];
    },
  ): Promise<Pattern> {
    const id = randomUUID();
    const patternFileName = `pattern_${id}.png`;
    const outputPath = join(this.uploadsDir, patternFileName);
    const patternImagePath = `uploads/${patternFileName}`;

    const { patternData, palette } = await this.imageProcessingService.processImage(
      inputImagePath,
      outputPath,
      settings.width,
      settings.height,
      settings.maxColors,
      settings.threadPalette,
      settings.selectedStitchKinds,
    );

    const pattern = new Pattern({
      id,
      schemaVersion: 2,
      originalImagePath: inputImagePath,
      patternImagePath,
      settings,
      palette,
      patternData,
      backstitches: [],
      knots: [],
      createdAt: new Date(),
    });

    return this.patternRepository.create(pattern);
  }
}
