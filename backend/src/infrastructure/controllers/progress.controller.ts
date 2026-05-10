import { BadRequestException, Controller, Post, Get, Param, Body } from '@nestjs/common';
import { TrackProgressUseCase } from '../../application/use-cases/track-progress.use-case';
import { GetProgressUseCase } from '../../application/use-cases/get-progress.use-case';
import { AddProgressTimeUseCase } from '../../application/use-cases/add-progress-time.use-case';
import type { CompletedStitch } from '../../domain/entities/progress.entity';

@Controller('progress')
export class ProgressController {
  constructor(
    private readonly trackProgressUseCase: TrackProgressUseCase,
    private readonly getProgressUseCase: GetProgressUseCase,
    private readonly addProgressTimeUseCase: AddProgressTimeUseCase,
  ) {}

  @Post(':patternId')
  async trackProgress(
    @Param('patternId') patternId: string,
    @Body('completedStitches') completedStitches: CompletedStitch[],
  ) {
    return this.trackProgressUseCase.execute(patternId, completedStitches);
  }

  @Get(':patternId')
  async getProgress(@Param('patternId') patternId: string) {
    return this.getProgressUseCase.execute(patternId);
  }

  @Post(':patternId/time')
  async addElapsedTime(
    @Param('patternId') patternId: string,
    @Body('elapsedSeconds') elapsedSeconds: number,
  ) {
    const parsedElapsedSeconds = Number(elapsedSeconds);
    if (!Number.isInteger(parsedElapsedSeconds) || parsedElapsedSeconds <= 0) {
      throw new BadRequestException('elapsedSeconds must be a positive integer');
    }

    return this.addProgressTimeUseCase.execute(patternId, parsedElapsedSeconds);
  }
}
