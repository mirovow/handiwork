import {
  getAvailableThreadPalettes,
  getThreadPalette,
  isThreadPaletteId,
} from './thread-palettes';

describe('thread palettes', () => {
  it('returns Gamma first, then DMC and Anchor as available palettes', () => {
    expect(getAvailableThreadPalettes()).toEqual([
      { id: 'GAMMA', label: 'Gamma' },
      { id: 'DMC', label: 'DMC' },
      { id: 'ANCHOR', label: 'Anchor' },
    ]);
  });

  it('returns normalized DMC colors without duplicate codes', () => {
    const dmcPalette = getThreadPalette('DMC');
    const codes = dmcPalette.map((color) => color.code);

    expect(dmcPalette).toHaveLength(489);
    expect(codes).toContain('310');
    expect(codes).toContain('B5200');
    expect(codes.filter((code) => code === '310')).toHaveLength(1);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('returns Anchor colors with manufacturer and codes', () => {
    expect(getThreadPalette('ANCHOR')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manufacturer: 'ANCHOR',
          code: '00001',
          name: 'White Bright',
          hex: '#ffffff',
          rgb: [255, 255, 255],
        }),
      ]),
    );
  });

  it('returns Gamma colors with manufacturer, Russian names and no duplicate codes', () => {
    const gammaPalette = getThreadPalette('GAMMA');
    const codes = gammaPalette.map((color) => color.code);

    expect(gammaPalette).toHaveLength(80);
    expect(new Set(codes).size).toBe(codes.length);
    expect(gammaPalette).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manufacturer: 'GAMMA',
          code: '0415',
          name: 'Белый',
          hex: '#ffffff',
          rgb: [255, 255, 255],
        }),
        expect.objectContaining({
          manufacturer: 'GAMMA',
          code: '0420',
          name: 'Черный',
          hex: '#010101',
          rgb: [1, 1, 1],
        }),
      ]),
    );
  });

  it('validates known palette ids', () => {
    expect(isThreadPaletteId('DMC')).toBe(true);
    expect(isThreadPaletteId('ANCHOR')).toBe(true);
    expect(isThreadPaletteId('GAMMA')).toBe(true);
    expect(isThreadPaletteId('UNKNOWN')).toBe(false);
  });
});
