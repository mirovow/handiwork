type PatternCellLike = {
	stitches?: unknown[];
};

type PatternLike = {
	patternData?: PatternCellLike[][];
	backstitches?: unknown[];
	knots?: unknown[];
};

export function countTotalStitches(pattern: PatternLike | null | undefined) {
	if (!pattern) return 0;

	const cellStitches = (pattern.patternData ?? []).reduce(
		(total, row) => total + row.reduce((rowTotal, cell) => rowTotal + (cell.stitches?.length ?? 0), 0),
		0,
	);

	return cellStitches + (pattern.backstitches?.length ?? 0) + (pattern.knots?.length ?? 0);
}

export function calculateProgressPercent(completedCount: number, totalCount: number) {
	if (totalCount <= 0) return 0;

	return Math.round((completedCount / totalCount) * 100);
}
