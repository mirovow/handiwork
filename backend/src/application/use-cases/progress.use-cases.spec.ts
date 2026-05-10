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

    await useCase.execute('pattern-id', [{ stitchId: '1:2:full', completedAt: '2026-01-02T00:00:00.000Z' }]);

    expect(progressRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: 'pattern-id',
        schemaVersion: 2,
        completedStitches: [{ stitchId: '1:2:full', completedAt: '2026-01-02T00:00:00.000Z' }],
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('updates existing progress', async () => {
    const existing = new Progress({
      patternId: 'pattern-id',
      schemaVersion: 2,
      completedStitches: [{ stitchId: '0:0:full' }],
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    progressRepository.findByPatternId.mockResolvedValue(existing);
    const useCase = new TrackProgressUseCase(progressRepository);

    await useCase.execute('pattern-id', [{ stitchId: '3:4:full' }]);

    expect(progressRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: 'pattern-id',
        schemaVersion: 2,
        completedStitches: [{ stitchId: '3:4:full' }],
      }),
    );
  });

  it('gets progress by pattern id', async () => {
    const progress = new Progress({
      patternId: 'pattern-id',
      schemaVersion: 2,
      completedStitches: [],
      updatedAt: new Date(),
    });
    progressRepository.findByPatternId.mockResolvedValue(progress);
    const useCase = new GetProgressUseCase(progressRepository);

    await expect(useCase.execute('pattern-id')).resolves.toBe(progress);
  });
});
