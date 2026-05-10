import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProgressDocument = ProgressModel & Document;

@Schema({ timestamps: true })
export class ProgressModel {
  @Prop()
  patternId: string;

  @Prop({ default: 2 })
  schemaVersion: 2;

  @Prop({ type: [{ stitchId: String, completedAt: String }], default: [] })
  completedStitches: Array<{ stitchId: string; completedAt?: string }>;
}

export const ProgressSchema = SchemaFactory.createForClass(ProgressModel);
