import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { GeneratePatternUseCase } from '../../application/use-cases/generate-pattern.use-case';
import { GetPatternsUseCase } from '../../application/use-cases/get-patterns.use-case';
import { randomUUID } from 'crypto';
import {
  ensureUploadsDirectory,
  getBackendConfig,
  getUploadsPath,
} from '../config/app.config';
import {
  getAvailableThreadPalettes,
  isThreadPaletteId,
  type ThreadPaletteId,
} from '../utils/thread-palettes';

const backendConfig = getBackendConfig();
const uploadsPath = getUploadsPath(backendConfig);
const allowedImageMimeTypes = new Set(['image/png', 'image/jpeg']);
const defaultMaxColors = 30;
const minMaxColors = 2;
const maxMaxColors = 100;
const defaultThreadPalette: ThreadPaletteId = 'DMC';
ensureUploadsDirectory(uploadsPath);

@Controller('patterns')
export class PatternController {
  constructor(
    private readonly generatePatternUseCase: GeneratePatternUseCase,
    private readonly getPatternsUseCase: GetPatternsUseCase,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: uploadsPath,
        filename: (req, file, cb) => {
          const uniqueSuffix = randomUUID() + extname(file.originalname);
          cb(null, uniqueSuffix);
        },
      }),
      limits: {
        fileSize: backendConfig.maxUploadSizeBytes,
      },
      fileFilter: (req, file, cb) => {
        if (!allowedImageMimeTypes.has(file.mimetype)) {
          cb(new BadRequestException('Only PNG and JPEG images are supported'), false);
          return;
        }

        cb(null, true);
      },
    }),
  )
  async createPattern(
    @UploadedFile() file: Express.Multer.File,
    @Body('width') width: string,
    @Body('height') height: string,
    @Body('maxColors') maxColors: string | undefined,
    @Body('threadPalette') threadPalette: string | undefined,
  ) {
    this.validateImageFile(file);
    const settings = this.parsePatternSettings(width, height, maxColors, threadPalette);

    return this.generatePatternUseCase.execute(file.path, {
      width: settings.width,
      height: settings.height,
      maxColors: settings.maxColors,
      threadPalette: settings.threadPalette,
    });
  }

  @Get('thread-palettes')
  getThreadPalettes() {
    return getAvailableThreadPalettes();
  }

  @Get()
  async getPatterns() {
    return this.getPatternsUseCase.execute();
  }

  @Get(':id')
  async getPattern(@Param('id') id: string) {
    return this.getPatternsUseCase.executeOne(id);
  }

  private validateImageFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!allowedImageMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Only PNG and JPEG images are supported');
    }

    if (file.size > backendConfig.maxUploadSizeBytes) {
      throw new BadRequestException('Image file is too large');
    }
  }

  private parsePatternSettings(
    width: string,
    height: string,
    maxColors: string | undefined,
    threadPalette: string | undefined,
  ): { width: number; height: number; maxColors: number; threadPalette: ThreadPaletteId } {
    return {
      width: this.parsePatternDimension('width', width),
      height: this.parsePatternDimension('height', height),
      maxColors: this.parseMaxColors(maxColors),
      threadPalette: this.parseThreadPalette(threadPalette),
    };
  }

  private parsePatternDimension(name: string, value: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`${name} must be an integer`);
    }

    if (parsed < backendConfig.minPatternSize || parsed > backendConfig.maxPatternSize) {
      throw new BadRequestException(
        `${name} must be between ${backendConfig.minPatternSize} and ${backendConfig.maxPatternSize}`,
      );
    }

    return parsed;
  }

  private parseMaxColors(value: string | undefined): number {
    if (value === undefined || value === '') {
      return defaultMaxColors;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('maxColors must be an integer');
    }

    if (parsed < minMaxColors || parsed > maxMaxColors) {
      throw new BadRequestException(
        `maxColors must be between ${minMaxColors} and ${maxMaxColors}`,
      );
    }

    return parsed;
  }

  private parseThreadPalette(value: string | undefined): ThreadPaletteId {
    if (value === undefined || value === '') {
      return defaultThreadPalette;
    }

    if (!isThreadPaletteId(value)) {
      throw new BadRequestException('Unknown thread palette');
    }

    return value;
  }
}
