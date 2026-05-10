import { GetProgressUseCase } from './get-progress.use-case';
import { TrackProgressUseCase } from './track-progress.use-case';
import { IProgressRepository } from '../../domain/ports/progress.repository';
import { Progress } from '../../domain/entities/progress.entity';

describe('progress use cases', () => {
  let progressRepository: jest.Mocked<IProgressRepository>;

  beforeEach(() => {
    progressRepository = {
      findByPatternId: jest.fn(),
      save: jest.fn(async (progress: Progress) => progress),
    };
  });

  it('creates progress when none exists', async () => {
    progressRepository.findByPatternId.mockResolvedValue(null);
    const useCase = new TrackProgressUseCase(progressRepository);

    await useCase.execute('pattern-id', [{ x: 1, y: 2 }]);

    expect(progressRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: 'pattern-id',
        stitchedCoords: [{ x: 1, y: 2 }],
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('updates existing progress', async () => {
    const existing = new Progress({
      patternId: 'pattern-id',
      stitchedCoords: [{ x: 0, y: 0 }],
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    progressRepository.findByPatternId.mockResolvedValue(existing);
    const useCase = new TrackProgressUseCase(progressRepository);

    await useCase.execute('pattern-id', [{ x: 3, y: 4 }]);

    expect(progressRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: 'pattern-id',
        stitchedCoords: [{ x: 3, y: 4 }],
      }),
    );
  });

  it('gets progress by pattern id', async () => {
    const progress = new Progress({
      patternId: 'pattern-id',
      stitchedCoords: [],
      updatedAt: new Date(),
    });
    progressRepository.findByPatternId.mockResolvedValue(progress);
    const useCase = new GetProgressUseCase(progressRepository);

    await expect(useCase.execute('pattern-id')).resolves.toBe(progress);
  });
});
