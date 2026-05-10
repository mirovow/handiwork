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
        patternData: [['310']],
        palette: [{ name: '310', rgb: [0, 0, 0], hex: '#000000' }],
      }),
    };

    const useCase = new GeneratePatternUseCase(patternRepository, imageProcessingService);

    const result = await useCase.execute('uploads/source.png', {
      width: 20,
      height: 10,
      maxColors: 5,
    });

    expect(imageProcessingService.processImage).toHaveBeenCalledWith(
      'uploads/source.png',
      expect.stringMatching(/^uploads\/pattern_.+\.png$/),
      20,
      10,
      5,
    );
    expect(patternRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        originalImagePath: 'uploads/source.png',
        settings: { width: 20, height: 10, maxColors: 5 },
        patternData: [['310']],
      }),
    );
    expect(result.palette).toEqual([{ name: '310', rgb: [0, 0, 0], hex: '#000000' }]);
  });
});
