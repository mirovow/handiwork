import { GeneratePatternUseCase } from './generate-pattern.use-case';
import { IPatternRepository } from '../../domain/ports/pattern.repository';
import { IImageProcessingService } from '../../domain/ports/image-processing.service';
import { Pattern } from '../../domain/entities/pattern.entity';

describe('GeneratePatternUseCase', () => {
  it('processes the image and persists the generated pattern', async () => {
    const patternRepository: jest.Mocked<IPatternRepository> = {
      create: jest.fn(async (pattern: Pattern) => pattern),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    };
    const imageProcessingService: jest.Mocked<IImageProcessingService> = {
      processImage: jest.fn().mockResolvedValue({
        width: 16,
        height: 8,
        patternData: [[{ x: 0, y: 0, stitches: [{ id: '0:0:full', kind: 'full_cross', threadCode: '310' }] }]],
        palette: [{ manufacturer: 'DMC', code: '310', name: 'Black', rgb: [0, 0, 0], hex: '#000000' }],
      }),
    };

    const useCase = new GeneratePatternUseCase(patternRepository, imageProcessingService);

    const result = await useCase.execute('uploads/source.png', {
      width: 20,
      height: 10,
      maxColors: 5,
      threadPalette: 'ANCHOR',
      selectedStitchKinds: ['full_cross', 'half_cross'],
      stitchBackground: false,
    });

    expect(imageProcessingService.processImage).toHaveBeenCalledWith(
      'uploads/source.png',
      expect.stringMatching(/^uploads\/pattern_.+\.png$/),
      20,
      10,
      5,
      'ANCHOR',
      ['full_cross', 'half_cross'],
      false,
    );
    expect(patternRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        originalImagePath: 'uploads/source.png',
        schemaVersion: 2,
        settings: {
          width: 16,
          height: 8,
          maxColors: 5,
          threadPalette: 'ANCHOR',
          selectedStitchKinds: ['full_cross', 'half_cross'],
          stitchBackground: false,
        },
        patternData: [[{ x: 0, y: 0, stitches: [{ id: '0:0:full', kind: 'full_cross', threadCode: '310' }] }]],
        backstitches: [],
        knots: [],
      }),
    );
    expect(result.palette).toEqual([
      { manufacturer: 'DMC', code: '310', name: 'Black', rgb: [0, 0, 0], hex: '#000000' },
    ]);
  });
});
