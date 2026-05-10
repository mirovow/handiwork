import { PatternMongoRepository } from './pattern-mongo.repository';

describe('PatternMongoRepository', () => {
  it('returns patterns sorted by latest activity first', async () => {
    const aggregate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          id: 'recent-progress',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'new-pattern',
          createdAt: new Date('2026-01-03T00:00:00Z'),
          updatedAt: new Date('2026-01-03T00:00:00Z'),
        },
      ]),
    });
    const patternModel = { aggregate };
    const progressModel = { collection: { name: 'progressmodels' } };
    const repository = new PatternMongoRepository(patternModel as never, progressModel as never);

    const result = await repository.findAll();

    expect(result.map((pattern) => pattern.id)).toEqual(['recent-progress', 'new-pattern']);
    expect(aggregate).toHaveBeenCalledWith([
      {
        $lookup: {
          from: 'progressmodels',
          localField: 'id',
          foreignField: 'patternId',
          as: 'progressRecords',
        },
      },
      {
        $addFields: {
          latestProgressUpdatedAt: { $max: '$progressRecords.updatedAt' },
        },
      },
      {
        $addFields: {
          lastActivityAt: {
            $max: [
              { $ifNull: ['$updatedAt', '$createdAt'] },
              { $ifNull: ['$latestProgressUpdatedAt', '$createdAt'] },
            ],
          },
        },
      },
      { $sort: { lastActivityAt: -1, createdAt: -1 } },
      { $project: { progressRecords: 0, latestProgressUpdatedAt: 0, lastActivityAt: 0 } },
    ]);
  });
});
