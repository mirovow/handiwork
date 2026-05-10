import { describe, expect, it } from 'vitest';

import { formatElapsedTime } from './time';

describe('time helpers', () => {
	it('formats elapsed seconds as hours, minutes and seconds', () => {
		expect(formatElapsedTime(0)).toBe('0с');
		expect(formatElapsedTime(59)).toBe('59с');
		expect(formatElapsedTime(60)).toBe('1м 00с');
		expect(formatElapsedTime(3661)).toBe('1ч 01м 01с');
	});

	it('does not format negative time', () => {
		expect(formatElapsedTime(-30)).toBe('0с');
	});
});
