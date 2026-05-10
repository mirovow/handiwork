import { Injectable, Inject } from '@nestjs/common';
import { PATTERN_REPOSITORY } from '../../domain/ports/pattern.repository';
import type { IPatternRepository } from '../../domain/ports/pattern.repository';
import { Pattern } from '../../domain/entities/pattern.entity';

@Injectable()
export class GetPatternsUseCase {
  constructor(
    @Inject(PATTERN_REPOSITORY)
    private readonly patternRepository: IPatternRepository,
  ) {}

  async execute(): Promise<Pattern[]> {
    return this.patternRepository.findAll();
  }

  async executeOne(id: string): Promise<Pattern | null> {
    return this.patternRepository.findById(id);
  }
}
