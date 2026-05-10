import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IProgressRepository } from '../../domain/ports/progress.repository';
import { Progress } from '../../domain/entities/progress.entity';
import { ProgressDocument, ProgressModel } from './schemas/progress.schema';

@Injectable()
export class ProgressMongoRepository implements IProgressRepository {
  constructor(
    @InjectModel(ProgressModel.name) private model: Model<ProgressDocument>,
  ) {}

  async findByPatternId(patternId: string): Promise<Progress | null> {
    const doc = await this.model.findOne({ patternId }).exec();
    if (!doc) return null;
    return new Progress(doc.toObject());
  }

  async save(progress: Progress): Promise<Progress> {
    const doc = await this.model.findOneAndUpdate(
      { patternId: progress.patternId },
      { schemaVersion: 2, completedStitches: progress.completedStitches, updatedAt: new Date() },
      { new: true, upsert: true }
    ).exec();
    return new Progress(doc.toObject());
  }
}
