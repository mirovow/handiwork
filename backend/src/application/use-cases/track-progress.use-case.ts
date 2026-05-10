import { Injectable, Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY } from '../../domain/ports/progress.repository';
import type { IProgressRepository } from '../../domain/ports/progress.repository';
import { Progress } from '../../domain/entities/progress.entity';

@Injectable()
export class TrackProgressUseCase {
  constructor(
    @Inject(PROGRESS_REPOSITORY)
    private readonly progressRepository: IProgressRepository,
  ) {}

  async execute(patternId: string, stitchedCoords: Array<{ x: number; y: number }>): Promise<Progress> {
    let progress = await this.progressRepository.findByPatternId(patternId);
    
    if (progress) {
      progress.stitchedCoords = stitchedCoords;
    } else {
      progress = new Progress({
        patternId,
        stitchedCoords,
        updatedAt: new Date(),
      });
    }

    return this.progressRepository.save(progress);
  }
}
