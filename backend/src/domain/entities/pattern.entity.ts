export type StitchKind = 'full_cross' | 'half_cross' | 'quarter_cross' | 'three_quarter_cross';

export type StitchDirection = 'slash' | 'backslash';

export type StitchCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

export type CellStitch = {
  id: string;
  kind: StitchKind;
  threadCode: string;
  direction?: StitchDirection;
  corner?: StitchCorner;
};

export type PatternCell = {
  x: number;
  y: number;
  stitches: CellStitch[];
};

export type Backstitch = {
  id: string;
  threadCode: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type FrenchKnot = {
  id: string;
  threadCode: string;
  at: { x: number; y: number };
};

export const stitchKinds = ['full_cross', 'half_cross', 'quarter_cross', 'three_quarter_cross'] as const;

export function isStitchKind(value: string): value is StitchKind {
  return (stitchKinds as readonly string[]).includes(value);
}

export class Pattern {
  id: string;
  schemaVersion: 2;
  originalImagePath: string;
  patternImagePath: string;
  settings: {
    width: number;
    height: number;
    maxColors: number;
    threadPalette: string;
    selectedStitchKinds: StitchKind[];
    stitchBackground: boolean;
  };
  palette: Array<{
    manufacturer: string;
    code: string;
    name: string;
    rgb: [number, number, number];
    hex: string;
  }>;
  patternData: PatternCell[][];
  backstitches: Backstitch[];
  knots: FrenchKnot[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<Pattern>) {
    Object.assign(this, partial);
  }
}
