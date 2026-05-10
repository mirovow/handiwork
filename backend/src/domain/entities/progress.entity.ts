export type CompletedStitch = {
  stitchId: string;
  completedAt?: string;
};

export class Progress {
  patternId: string;
  schemaVersion: 2;
  completedStitches: CompletedStitch[];
  updatedAt: Date;

  constructor(partial: Partial<Progress>) {
    Object.assign(this, partial);
  }
}
