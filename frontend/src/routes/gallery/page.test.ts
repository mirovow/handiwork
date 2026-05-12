import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GalleryPage from './+page.svelte';
import { api } from '$lib/api';

vi.mock('$lib/api', () => ({
	api: {
		deletePattern: vi.fn(),
		getImageUrl: vi.fn((path: string) => `http://localhost:3000/${path}`),
		getPatterns: vi.fn(),
		getProgress: vi.fn()
	}
}));

const patterns = [
	{
		id: 'pattern-1',
		patternImagePath: 'uploads/pattern-1.png',
		settings: { width: 40, height: 40 },
		patternData: [[{ stitches: [{ id: 'stitch-1' }] }]],
		backstitches: [],
		knots: [],
		createdAt: '2026-05-10T12:00:00.000Z'
	},
	{
		id: 'pattern-2',
		patternImagePath: 'uploads/pattern-2.png',
		settings: { width: 50, height: 30 },
		patternData: [[{ stitches: [{ id: 'stitch-2' }, { id: 'stitch-3' }] }]],
		backstitches: [],
		knots: [],
		createdAt: '2026-05-09T12:00:00.000Z'
	}
];

describe('gallery page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.getPatterns).mockResolvedValue(patterns);
		vi.mocked(api.getProgress).mockImplementation(async (patternId: string) => {
			if (patternId === 'pattern-1') {
				return { completedStitches: [{ stitchId: 'stitch-1' }], elapsedSeconds: 3661 };
			}

			return { completedStitches: [{ stitchId: 'stitch-2' }], elapsedSeconds: 65 };
		});
		vi.mocked(api.deletePattern).mockResolvedValue(undefined);
		vi.spyOn(window, 'confirm').mockReturnValue(true);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('deletes a pattern after confirmation', async () => {
		render(GalleryPage);

		await screen.findByText('Размер: 40 x 40');
		expect(screen.queryByText('Удалить')).toBeNull();

		await fireEvent.click(screen.getAllByRole('button', { name: 'Удалить схему' })[0]);

		expect(window.confirm).toHaveBeenCalledWith('Удалить эту схему? Это действие нельзя отменить.');
		expect(api.deletePattern).toHaveBeenCalledWith('pattern-1');
		await waitFor(() => expect(screen.queryByText('Размер: 40 x 40')).toBeNull());
		expect(screen.getByText('Размер: 50 x 30')).toBeTruthy();
	});

	it('shows stitching progress, elapsed time, and completed marker', async () => {
		render(GalleryPage);

		await screen.findByText('Прогресс: 100.0%');
		expect(screen.getByText('Время: 1ч 01м 01с')).toBeTruthy();
		expect(screen.getByLabelText('Схема завершена')).toBeTruthy();
		expect(screen.getByText('Прогресс: 50.0%')).toBeTruthy();
		expect(screen.getByText('Время: 1м 05с')).toBeTruthy();
	});

	it('keeps a pattern when deletion is cancelled', async () => {
		vi.mocked(window.confirm).mockReturnValue(false);
		render(GalleryPage);

		await screen.findByText('Размер: 40 x 40');

		await fireEvent.click(screen.getAllByRole('button', { name: 'Удалить схему' })[0]);

		expect(api.deletePattern).not.toHaveBeenCalled();
		expect(screen.getByText('Размер: 40 x 40')).toBeTruthy();
	});
});
