import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');

	return {
		page: readable({
			params: { id: 'pattern-1' },
			url: new URL('http://localhost/workspace/pattern-1')
		})
	};
});

vi.mock('$lib/api', () => ({
	api: {
		addProgressTime: vi.fn().mockResolvedValue({}),
		getPattern: vi.fn().mockResolvedValue({
			id: 'pattern-1',
			schemaVersion: 2,
			settings: { width: 1, height: 1, threadPalette: 'DMC' },
			palette: [
				{ manufacturer: 'DMC', code: '743', name: 'Yellow Medium', hex: '#f8c85a' }
			],
			patternData: [
				[
					{
						x: 0,
						y: 0,
						stitches: [{ id: 'stitch-1', kind: 'full_cross', threadCode: '743' }]
					}
				]
			],
			backstitches: [],
			knots: []
		}),
		getProgress: vi.fn().mockResolvedValue({ completedStitches: [], elapsedSeconds: 0 }),
		saveProgress: vi.fn().mockResolvedValue({}),
		sendProgressTime: vi.fn().mockReturnValue(false)
	}
}));

import WorkspacePage from './+page.svelte';
import { api } from '$lib/api';

class ResizeObserverMock {
	observe = vi.fn();
	disconnect = vi.fn();
}

function dispatchPointerEvent(
	element: Element,
	type: string,
	init: {
		pointerId: number;
		clientX: number;
		clientY: number;
		button?: number;
		pointerType?: string;
	}
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.entries({
		button: 0,
		pointerType: 'touch',
		...init
	}).forEach(([key, value]) => {
		Object.defineProperty(event, key, { value, configurable: true });
	});

	return fireEvent(element, event);
}

describe('workspace page', () => {
	beforeEach(() => {
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		HTMLCanvasElement.prototype.setPointerCapture ??= () => {};
		HTMLCanvasElement.prototype.releasePointerCapture ??= () => {};
		vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 300,
			bottom: 300,
			width: 300,
			height: 300,
			toJSON: () => ({})
		});
		vi.spyOn(HTMLCanvasElement.prototype, 'setPointerCapture').mockImplementation(() => {});
		vi.spyOn(HTMLCanvasElement.prototype, 'releasePointerCapture').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('turns the palette button into a panel and back', async () => {
		render(WorkspacePage);

		const paletteButton = await screen.findByRole('button', { name: 'Палитра ниток' });
		expect(screen.getByText('Прогресс: 0% · 0 / 1 крестиков')).toBeTruthy();
		expect(paletteButton.className).toContain('hover:bg-white/60');

		await fireEvent.click(paletteButton);

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Палитра ниток' })).toBeNull());
		expect(screen.getByRole('heading', { name: 'Палитра DMC' })).toBeTruthy();

		const closeButton = screen.getByRole('button', { name: 'Закрыть' });
		expect(closeButton.className).toContain('hover:bg-white/60');

		await fireEvent.click(closeButton);

		await waitFor(() => expect(screen.getByRole('button', { name: 'Палитра ниток' })).toBeTruthy());
		expect(screen.queryByRole('heading', { name: 'Палитра DMC' })).toBeNull();
	});

	it('toggles a stitch with a single touch tap', async () => {
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0% · 0 / 1 крестиков');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 1, clientX: 150, clientY: 150 });

		await waitFor(() => {
			expect(screen.getByText('Прогресс: 100% · 1 / 1 крестиков')).toBeTruthy();
		});
	});

	it('pinch-zooms with two touch pointers without toggling a stitch', async () => {
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0% · 0 / 1 крестиков');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointermove', { pointerId: 1, clientX: 50, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointermove', { pointerId: 2, clientX: 250, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 1, clientX: 50, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 2, clientX: 250, clientY: 150 });

		await waitFor(() => {
			expect(screen.getByText('200%')).toBeTruthy();
			expect(screen.getByText('Прогресс: 0% · 0 / 1 крестиков')).toBeTruthy();
		});
		expect(api.saveProgress).not.toHaveBeenCalled();
	});
});
