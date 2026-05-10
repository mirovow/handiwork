import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { Backstitch, FrenchKnot, PatternCell, StitchKind } from '../../../domain/entities/pattern.entity';

export type PatternDocument = PatternModel & Document;

@Schema({ timestamps: true })
export class PatternModel {
  @Prop()
  id: string;

  @Prop({ default: 2 })
  schemaVersion: 2;

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
    selectedStitchKinds: StitchKind[];
    stitchBackground: boolean;
  };

  @Prop({ type: Array })
  palette: Array<{
    manufacturer: string;
    code: string;
    name: string;
    rgb: [number, number, number];
    hex: string;
  }>;

  @Prop({
    type: [[{
      x: Number,
      y: Number,
      stitches: [{
        id: String,
        kind: String,
        threadCode: String,
        direction: String,
        corner: String,
      }],
    }]],
  })
  patternData: PatternCell[][];

  @Prop({ type: Array, default: [] })
  backstitches: Backstitch[];

  @Prop({ type: Array, default: [] })
  knots: FrenchKnot[];
}

export const PatternSchema = SchemaFactory.createForClass(PatternModel);
