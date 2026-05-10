import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { TrackProgressUseCase } from '../../application/use-cases/track-progress.use-case';
import { GetProgressUseCase } from '../../application/use-cases/get-progress.use-case';

@Controller('progress')
export class ProgressController {
  constructor(
    private readonly trackProgressUseCase: TrackProgressUseCase,
    private readonly getProgressUseCase: GetProgressUseCase,
  ) {}

  @Post(':patternId')
  async trackProgress(
    @Param('patternId') patternId: string,
    @Body('stitchedCoords') stitchedCoords: Array<{ x: number; y: number }>,
  ) {
    return this.trackProgressUseCase.execute(patternId, stitchedCoords);
  }

  @Get(':patternId')
  async getProgress(@Param('patternId') patternId: string) {
    return this.getProgressUseCase.execute(patternId);
  }
}
