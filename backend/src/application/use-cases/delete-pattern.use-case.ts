import { Inject, Injectable } from '@nestjs/common';
import { PATTERN_REPOSITORY } from '../../domain/ports/pattern.repository';
import type { IPatternRepository } from '../../domain/ports/pattern.repository';

@Injectable()
export class DeletePatternUseCase {
  constructor(
    @Inject(PATTERN_REPOSITORY)
    private readonly patternRepository: IPatternRepository,
  ) {}

  async execute(id: string): Promise<boolean> {
    return this.patternRepository.delete(id);
  }
}
