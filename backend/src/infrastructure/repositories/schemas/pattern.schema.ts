import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PatternDocument = PatternModel & Document;

@Schema({ timestamps: true })
export class PatternModel {
  @Prop()
  id: string;

  @Prop()
  originalImagePath: string;

  @Prop()
  patternImagePath: string;

  @Prop({ type: Object })
  settings: {
    width: number;
    height: number;
    maxColors: number;
    threadPalette: string;
  };

  @Prop({ type: Array })
  palette: Array<{
    manufacturer: string;
    code: string;
    name: string;
    rgb: [number, number, number];
    hex: string;
  }>;

  @Prop({ type: [[String]] })
  patternData: string[][];
}

export const PatternSchema = SchemaFactory.createForClass(PatternModel);
