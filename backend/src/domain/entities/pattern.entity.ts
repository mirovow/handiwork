export class Pattern {
  id: string;
  originalImagePath: string;
  patternImagePath: string;
  settings: {
    width: number;
    height: number;
    maxColors: number;
  };
  palette: Array<{
    name: string;
    rgb: [number, number, number];
    hex: string;
  }>;
  patternData: Array<Array<string>>; // 2D array of hex strings or DMC names representing the pattern
  createdAt: Date;

  constructor(partial: Partial<Pattern>) {
    Object.assign(this, partial);
  }
}
