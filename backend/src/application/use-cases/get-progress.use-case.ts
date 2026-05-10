import { Injectable, Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY } from '../../domain/ports/progress.repository';
import type { IProgressRepository } from '../../domain/ports/progress.repository';
import { Progress } from '../../domain/entities/progress.entity';

@Injectable()
export class GetProgressUseCase {
  constructor(
    @Inject(PROGRESS_REPOSITORY)
    private readonly progressRepository: IProgressRepository,
  ) {}

  async execute(patternId: string): Promise<Progress | null> {
    return this.progressRepository.findByPatternId(patternId);
  }
}
