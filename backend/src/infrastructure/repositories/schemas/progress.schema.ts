import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProgressDocument = ProgressModel & Document;

@Schema({ timestamps: true })
export class ProgressModel {
  @Prop()
  patternId: string;

  @Prop({ type: [{ x: Number, y: Number }] })
  stitchedCoords: Array<{ x: number; y: number }>;
}

export const ProgressSchema = SchemaFactory.createForClass(ProgressModel);
