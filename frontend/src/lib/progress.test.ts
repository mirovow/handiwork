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

	it('calculates completed stitch percentage to tenths without rounding up', () => {
		expect(calculateProgressPercent(1, 3)).toBe(33.3);
		expect(calculateProgressPercent(2, 3)).toBe(66.6);
		expect(calculateProgressPercent(356, 357)).toBe(99.7);
		expect(calculateProgressPercent(357, 357)).toBe(100);
		expect(calculateProgressPercent(358, 357)).toBe(100);
		expect(calculateProgressPercent(0, 0)).toBe(0);
	});
});
