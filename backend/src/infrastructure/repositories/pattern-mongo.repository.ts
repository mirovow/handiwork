import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPatternRepository } from '../../domain/ports/pattern.repository';
import { Pattern } from '../../domain/entities/pattern.entity';
import { PatternDocument, PatternModel } from './schemas/pattern.schema';
import { ProgressDocument, ProgressModel } from './schemas/progress.schema';

@Injectable()
export class PatternMongoRepository implements IPatternRepository {
  constructor(
    @InjectModel(PatternModel.name) private model: Model<PatternDocument>,
    @InjectModel(ProgressModel.name) private progressModel: Model<ProgressDocument>,
  ) {}

  async create(pattern: Pattern): Promise<Pattern> {
    const created = new this.model(pattern);
    const saved = await created.save();
    return new Pattern(saved.toObject());
  }

  async findById(id: string): Promise<Pattern | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return new Pattern(doc.toObject());
  }

  async findAll(): Promise<Pattern[]> {
    const docs = await this.model.aggregate([
      {
        $lookup: {
          from: this.progressModel.collection.name,
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
    ]).exec();
    return docs.map((doc) => new Pattern(doc));
  }

  async update(id: string, pattern: Partial<Pattern>): Promise<Pattern | null> {
    const updated = await this.model.findOneAndUpdate({ id }, pattern, { new: true }).exec();
    if (!updated) return null;
    return new Pattern(updated.toObject());
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.model.findOneAndDelete({ id }).exec();
    if (!deleted) return false;

    await this.progressModel.deleteMany({ patternId: id }).exec();
    return true;
  }
}
