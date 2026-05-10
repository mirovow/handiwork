import { Pattern } from '../entities/pattern.entity';

export const PATTERN_REPOSITORY = 'PATTERN_REPOSITORY';

export interface IPatternRepository {
  create(pattern: Pattern): Promise<Pattern>;
  findById(id: string): Promise<Pattern | null>;
  findAll(): Promise<Pattern[]>;
  update(id: string, pattern: Partial<Pattern>): Promise<Pattern | null>;
}
