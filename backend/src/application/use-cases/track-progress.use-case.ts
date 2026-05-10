import { Injectable, Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY } from '../../domain/ports/progress.repository';
import type { IProgressRepository } from '../../domain/ports/progress.repository';
import { CompletedStitch, Progress } from '../../domain/entities/progress.entity';

@Injectable()
export class TrackProgressUseCase {
  constructor(
    @Inject(PROGRESS_REPOSITORY)
    private readonly progressRepository: IProgressRepository,
  ) {}

  async execute(patternId: string, completedStitches: CompletedStitch[]): Promise<Progress> {
    let progress = await this.progressRepository.findByPatternId(patternId);
    
    if (progress) {
      progress.schemaVersion = 2;
      progress.completedStitches = completedStitches;
    } else {
      progress = new Progress({
        patternId,
        schemaVersion: 2,
        completedStitches,
        updatedAt: new Date(),
      });
    }

    return this.progressRepository.save(progress);
  }
}
