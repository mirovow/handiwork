import { Progress } from '../entities/progress.entity';

export const PROGRESS_REPOSITORY = 'PROGRESS_REPOSITORY';

export interface IProgressRepository {
  findByPatternId(patternId: string): Promise<Progress | null>;
  save(progress: Progress): Promise<Progress>;
}
