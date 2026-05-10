import { describe, expect, it } from 'vitest';

import { buildThreadPurchaseUrl, getCellThreadColor } from './thread-color';

describe('thread color helpers', () => {
	it('finds the palette color for the first stitch in a cell', () => {
		const color = getCellThreadColor(
			{ stitches: [{ threadCode: '310' }] },
			[
				{ manufacturer: 'DMC', code: '321', name: 'Red', hex: '#c72b3b' },
				{ manufacturer: 'DMC', code: '310', name: 'Black', hex: '#000000' },
			],
		);

		expect(color).toEqual({ manufacturer: 'DMC', code: '310', name: 'Black', hex: '#000000' });
	});

	it('returns null for empty cells or unknown thread codes', () => {
		expect(getCellThreadColor({ stitches: [] }, [])).toBeNull();
		expect(getCellThreadColor({ stitches: [{ threadCode: '404' }] }, [{ code: '310', name: 'Black', hex: '#000000' }])).toBeNull();
	});

	it('builds a marketplace search URL with manufacturer, code and needlework context', () => {
		const url = buildThreadPurchaseUrl({ manufacturer: 'DMC', code: '310', name: 'Black', hex: '#000000' }, 'ANCHOR');

		expect(decodeURIComponent(url)).toContain('нитки мулине DMC 310 вышивка крестом');
	});

	it('falls back to the selected palette and color name when manufacturer or code is absent', () => {
		const url = buildThreadPurchaseUrl({ name: 'Black', hex: '#000000' }, 'ANCHOR');

		expect(decodeURIComponent(url)).toContain('нитки мулине ANCHOR Black вышивка крестом');
	});
});
