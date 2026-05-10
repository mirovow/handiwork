export type ThreadColor = {
	manufacturer?: string;
	code?: string;
	name: string;
	hex: string;
};

type CellWithThread = {
	stitches?: Array<{
		threadCode?: string;
	}>;
};

export function getCellThreadColor(cell: CellWithThread | null | undefined, palette: ThreadColor[]) {
	const threadCode = cell?.stitches?.[0]?.threadCode;
	if (!threadCode) return null;

	return palette.find((color) => (color.code ?? color.name) === threadCode) ?? null;
}

export function buildThreadPurchaseUrl(color: ThreadColor, selectedPalette: string) {
	const manufacturer = color.manufacturer || selectedPalette || 'DMC';
	const code = color.code ?? color.name;
	const query = `нитки мулине ${manufacturer} ${code} вышивка крестом`;

	return `https://www.ozon.ru/search/?text=${encodeURIComponent(query)}`;
}
