export class Progress {
  patternId: string;
  stitchedCoords: Array<{ x: number; y: number }>;
  updatedAt: Date;

  constructor(partial: Partial<Progress>) {
    Object.assign(this, partial);
  }
}
