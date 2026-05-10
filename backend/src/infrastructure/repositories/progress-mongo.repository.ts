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
      {
        $set: {
          schemaVersion: 2,
          completedStitches: progress.completedStitches,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          elapsedSeconds: progress.elapsedSeconds ?? 0,
        },
      },
      { new: true, upsert: true }
    ).exec();
    return new Progress(doc.toObject());
  }

  async addElapsedSeconds(patternId: string, elapsedSeconds: number): Promise<Progress> {
    const doc = await this.model.findOneAndUpdate(
      { patternId },
      {
        $set: { schemaVersion: 2, updatedAt: new Date() },
        $setOnInsert: { completedStitches: [] },
        $inc: { elapsedSeconds },
      },
      { new: true, upsert: true },
    ).exec();
    return new Progress(doc.toObject());
  }
}
