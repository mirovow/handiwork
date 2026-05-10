import { BadRequestException } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { TrackProgressUseCase } from '../../application/use-cases/track-progress.use-case';
import { GetProgressUseCase } from '../../application/use-cases/get-progress.use-case';
import { AddProgressTimeUseCase } from '../../application/use-cases/add-progress-time.use-case';

describe('ProgressController', () => {
  let addProgressTimeUseCase: jest.Mocked<Pick<AddProgressTimeUseCase, 'execute'>>;
  let controller: ProgressController;

  beforeEach(() => {
    addProgressTimeUseCase = {
      execute: jest.fn().mockResolvedValue({ patternId: 'pattern-id', elapsedSeconds: 60 }),
    };
    controller = new ProgressController(
      { execute: jest.fn() } as unknown as TrackProgressUseCase,
      { execute: jest.fn() } as unknown as GetProgressUseCase,
      addProgressTimeUseCase as unknown as AddProgressTimeUseCase,
    );
  });

  it('adds elapsed stitching time', async () => {
    await controller.addElapsedTime('pattern-id', 60);

    expect(addProgressTimeUseCase.execute).toHaveBeenCalledWith('pattern-id', 60);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid elapsed time %s', async (elapsedSeconds) => {
    await expect(controller.addElapsedTime('pattern-id', elapsedSeconds)).rejects.toThrow(BadRequestException);
  });
});
