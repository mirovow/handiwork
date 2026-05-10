import { DeletePatternUseCase } from './delete-pattern.use-case';
import { IPatternRepository } from '../../domain/ports/pattern.repository';

describe('DeletePatternUseCase', () => {
  it('deletes a pattern by id', async () => {
    const patternRepository: jest.Mocked<IPatternRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    const useCase = new DeletePatternUseCase(patternRepository);

    await expect(useCase.execute('pattern-id')).resolves.toBe(true);

    expect(patternRepository.delete).toHaveBeenCalledWith('pattern-id');
  });
});
