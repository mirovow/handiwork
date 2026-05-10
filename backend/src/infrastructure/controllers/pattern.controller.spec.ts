import { BadRequestException } from '@nestjs/common';
import { PatternController } from './pattern.controller';
import { GeneratePatternUseCase } from '../../application/use-cases/generate-pattern.use-case';
import { GetPatternsUseCase } from '../../application/use-cases/get-patterns.use-case';

describe('PatternController', () => {
  let generatePatternUseCase: jest.Mocked<Pick<GeneratePatternUseCase, 'execute'>>;
  let getPatternsUseCase: jest.Mocked<Pick<GetPatternsUseCase, 'execute' | 'executeOne'>>;
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
    controller = new PatternController(
      generatePatternUseCase as unknown as GeneratePatternUseCase,
      getPatternsUseCase as unknown as GetPatternsUseCase,
    );
  });

  it('rejects a missing image file', async () => {
    await expect(
      controller.createPattern(undefined as unknown as Express.Multer.File, '100', '100', '30'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported image MIME types', async () => {
    const file = { ...validFile, mimetype: 'image/gif' } as Express.Multer.File;

    await expect(controller.createPattern(file, '100', '100', '30')).rejects.toThrow(
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
    await expect(controller.createPattern(validFile, width, height, '30')).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each(['abc', '1', '101'])('rejects invalid max colors %s', async (maxColors) => {
    await expect(
      controller.createPattern(validFile, '100', '100', maxColors),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses the default max colors when it is omitted', async () => {
    await controller.createPattern(validFile, '120', '80', undefined);

    expect(generatePatternUseCase.execute).toHaveBeenCalledWith('uploads/source.png', {
      width: 120,
      height: 80,
      maxColors: 30,
    });
  });

  it('passes validated dimensions and file path to the use case', async () => {
    await controller.createPattern(validFile, '120', '80', '24');

    expect(generatePatternUseCase.execute).toHaveBeenCalledWith('uploads/source.png', {
      width: 120,
      height: 80,
      maxColors: 24,
    });
  });
});
