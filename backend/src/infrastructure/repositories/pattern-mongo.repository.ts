import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPatternRepository } from '../../domain/ports/pattern.repository';
import { Pattern } from '../../domain/entities/pattern.entity';
import { PatternDocument, PatternModel } from './schemas/pattern.schema';

@Injectable()
export class PatternMongoRepository implements IPatternRepository {
  constructor(
    @InjectModel(PatternModel.name) private model: Model<PatternDocument>,
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
    const docs = await this.model.find().exec();
    return docs.map(doc => new Pattern(doc.toObject()));
  }

  async update(id: string, pattern: Partial<Pattern>): Promise<Pattern | null> {
    const updated = await this.model.findOneAndUpdate({ id }, pattern, { new: true }).exec();
    if (!updated) return null;
    return new Pattern(updated.toObject());
  }
}
