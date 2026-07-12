import { BadRequestException } from '@nestjs/common';
import { PatternController } from './pattern.controller';
import { GeneratePatternUseCase } from '../../application/use-cases/generate-pattern.use-case';
import { GetPatternsUseCase } from '../../application/use-cases/get-patterns.use-case';
import { DeletePatternUseCase } from '../../application/use-cases/delete-pattern.use-case';

describe('PatternController', () => {
  let generatePatternUseCase: jest.Mocked<Pick<GeneratePatternUseCase, 'execute'>>;
  let getPatternsUseCase: jest.Mocked<Pick<GetPatternsUseCase, 'execute' | 'executeOne'>>;
  let deletePatternUseCase: jest.Mocked<Pick<DeletePatternUseCase, 'execute'>>;
  let controller: PatternController;

  const validFile = {
    path: 'uploads/source.png',
    mimetype: 'image/png',
    size: 1024,
  } as Express.Multer.File;

  beforeEach(() => {
    generatePatternUseCase = {
      execute: jest.fn().mockResolvedValue({ id: 'pattern-id' }),
    };
    getPatternsUseCase = {
      execute: jest.fn(),
      executeOne: jest.fn(),
    };
    deletePatternUseCase = {
      execute: jest.fn(),
    };
    controller = new PatternController(
      generatePatternUseCase as unknown as GeneratePatternUseCase,
      getPatternsUseCase as unknown as GetPatternsUseCase,
      deletePatternUseCase as unknown as DeletePatternUseCase,
    );
  });

  it('rejects a missing image file', async () => {
    await expect(
      controller.createPattern(undefined as unknown as Express.Multer.File, '100', '100', '30', 'DMC', undefined, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported image MIME types', async () => {
    const file = { ...validFile, mimetype: 'image/gif' } as Express.Multer.File;

    await expect(controller.createPattern(file, '100', '100', '30', 'DMC', undefined, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each([
    ['abc', '100'],
    ['9', '100'],
    ['501', '100'],
    ['100', 'abc'],
    ['100', '9'],
    ['100', '501'],
  ])('rejects invalid pattern dimensions %s x %s', async (width, height) => {
    await expect(controller.createPattern(validFile, width, height, '30', 'DMC', undefined, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each(['abc', '1', '101'])('rejects invalid max colors %s', async (maxColors) => {
    await expect(
      controller.createPattern(validFile, '100', '100', maxColors, 'DMC', undefined, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown thread palettes', async () => {
    await expect(
      controller.createPattern(validFile, '100', '100', '30', 'UNKNOWN', undefined, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns available thread palettes with Gamma first', () => {
    expect(controller.getThreadPalettes()).toEqual([
      { id: 'GAMMA', label: 'Gamma' },
      { id: 'DMC', label: 'DMC' },
      { id: 'ANCHOR', label: 'Anchor' },
    ]);
  });

  it('uses the default max colors and Gamma palette when they are omitted', async () => {
    await controller.createPattern(validFile, '120', '80', undefined, undefined, undefined, undefined);

    expect(generatePatternUseCase.execute).toHaveBeenCalledWith('uploads/source.png', {
      width: 120,
      height: 80,
      maxColors: 30,
      threadPalette: 'GAMMA',
      selectedStitchKinds: ['full_cross'],
      stitchBackground: true,
    });
  });

  it('passes validated dimensions and file path to the use case', async () => {
    await controller.createPattern(validFile, '120', '80', '24', 'ANCHOR', 'full_cross,half_cross', 'false');

    expect(generatePatternUseCase.execute).toHaveBeenCalledWith('uploads/source.png', {
      width: 120,
      height: 80,
      maxColors: 24,
      threadPalette: 'ANCHOR',
      selectedStitchKinds: ['full_cross', 'half_cross'],
      stitchBackground: false,
    });
  });

  it('rejects an empty selected stitch kind list', async () => {
    await expect(
      controller.createPattern(validFile, '100', '100', '30', 'DMC', '', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown selected stitch kinds', async () => {
    await expect(
      controller.createPattern(validFile, '100', '100', '30', 'DMC', 'full_cross,unknown', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid background stitching values', async () => {
    await expect(
      controller.createPattern(validFile, '100', '100', '30', 'DMC', 'full_cross', 'maybe'),
    ).rejects.toThrow(BadRequestException);
  });

  it('deletes a pattern by id', async () => {
    deletePatternUseCase.execute.mockResolvedValue(true);

    await controller.deletePattern('pattern-id');

    expect(deletePatternUseCase.execute).toHaveBeenCalledWith('pattern-id');
  });
});
