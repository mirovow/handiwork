import { describe, expect, it } from 'vitest';

import { calculateProgressPercent, countTotalStitches } from './progress';

describe('workspace progress helpers', () => {
	it('counts stitch-like work from cells, backstitches and knots', () => {
		const pattern = {
			patternData: [
				[{ stitches: [{ id: 'a' }, { id: 'b' }] }, { stitches: [] }],
				[{ stitches: [{ id: 'c' }] }],
			],
			backstitches: [{ id: 'backstitch-1' }],
			knots: [{ id: 'knot-1' }, { id: 'knot-2' }],
		};

		expect(countTotalStitches(pattern)).toBe(6);
	});

	it('rounds completed stitch percentage and handles empty patterns', () => {
		expect(calculateProgressPercent(1, 3)).toBe(33);
		expect(calculateProgressPercent(2, 3)).toBe(67);
		expect(calculateProgressPercent(0, 0)).toBe(0);
	});
});
