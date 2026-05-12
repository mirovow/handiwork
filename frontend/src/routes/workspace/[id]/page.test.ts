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

function createPattern(width: number, height: number) {
	return {
		id: 'pattern-1',
		schemaVersion: 2,
		settings: { width, height, threadPalette: 'DMC' },
		palette: [{ manufacturer: 'DMC', code: '743', name: 'Yellow Medium', hex: '#f8c85a' }],
		patternData: Array.from({ length: height }, (_, y) =>
			Array.from({ length: width }, (_, x) => ({
				x,
				y,
				stitches: [{ id: `stitch-${x}-${y}`, kind: 'full_cross', threadCode: '743' }]
			}))
		),
		backstitches: [],
		knots: []
	};
}

describe('workspace page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
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
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('turns the palette button into a panel and back', async () => {
		render(WorkspacePage);

		const paletteButton = await screen.findByRole('button', { name: 'Палитра ниток' });
		expect(screen.getByText('Прогресс: 0.0% · 0 / 1 крестиков')).toBeTruthy();
		expect(paletteButton.className).toContain('hover:bg-white/60');

		await fireEvent.click(paletteButton);

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Палитра ниток' })).toBeNull());
		expect(screen.getByRole('heading', { name: 'Палитра DMC' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Палитра DMC' }).closest('.z-30')).toBeTruthy();

		const closeButton = screen.getByRole('button', { name: 'Закрыть' });
		expect(closeButton.className).toContain('hover:bg-white/60');

		await fireEvent.click(closeButton);

		await waitFor(() => expect(screen.getByRole('button', { name: 'Палитра ниток' })).toBeTruthy());
		expect(screen.queryByRole('heading', { name: 'Палитра DMC' })).toBeNull();
	});

	it('shows paper-like navigation controls for large patterns', async () => {
		vi.mocked(api.getPattern).mockResolvedValueOnce(createPattern(40, 33));
		render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 1320 крестиков');

		expect(screen.queryByRole('link', { name: 'Новая схема' })).toBeNull();
		expect(screen.queryByText('Центр: 20 x 17')).toBeNull();
		expect(screen.queryByText('Секции: 50 x 50')).toBeNull();
		expect(screen.getByRole('img', { name: 'Мини-карта схемы' })).toBeTruthy();
		expect(screen.queryByText('Мини-карта')).toBeNull();
		expect(screen.queryByText('Цветная схема и текущая область')).toBeNull();
		expect(screen.getByRole('button', { name: 'Перейти по мини-карте' }).className).not.toContain(
			'rounded'
		);
		expect(screen.queryByRole('button', { name: 'Сброс' })).toBeNull();
		expect(screen.getByRole('button', { name: 'К центру' })).toBeTruthy();
		expect(screen.getByLabelText('Навигация по схеме').textContent).toContain('Сохранено');
	});

	it('shows hovered cell coordinates in the navigation controls', async () => {
		vi.mocked(api.getPattern).mockResolvedValueOnce(createPattern(40, 33));
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 1320 крестиков');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await fireEvent.mouseMove(canvas!, { clientX: 180, clientY: 150 });

		await waitFor(() => {
			const navigationText = screen.getByLabelText('Навигация по схеме').textContent;
			expect(navigationText).toMatch(/\d+ x \d+/);
			expect(navigationText).not.toContain('Координаты');
		});
	});

	it('renders a color overview in the minimap for very large patterns', async () => {
		vi.mocked(api.getPattern).mockResolvedValueOnce(createPattern(150, 150));
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 22500 крестиков');

		const colorCells = container.querySelectorAll(
			'svg[aria-label="Мини-карта схемы"] rect[fill="#f8c85a"]'
		);
		expect(colorCells.length).toBeGreaterThan(0);
	});

	it('toggles a stitch with a single touch tap', async () => {
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 1 крестиков');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 1, clientX: 150, clientY: 150 });

		await waitFor(() => {
			expect(screen.getByText('Прогресс: 100.0% · 1 / 1 крестиков')).toBeTruthy();
		});
		expect(screen.getByText('Ты умничка!')).toBeTruthy();
		expect(screen.getByText('Время вышивки: 0с')).toBeTruthy();
	});

	it('freezes elapsed time after completing the pattern', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 1 крестиков');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await vi.advanceTimersByTimeAsync(3000);
		await screen.findByText('Время: 3с');

		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 1, clientX: 150, clientY: 150 });
		await screen.findByText('Время вышивки: 3с');

		await vi.advanceTimersByTimeAsync(5000);

		expect(screen.getByText('Время вышивки: 3с')).toBeTruthy();
		expect(screen.queryByText('Время вышивки: 8с')).toBeNull();
	});

	it('does not start the timer when the pattern is already complete on load', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
		vi.mocked(api.getProgress).mockResolvedValueOnce({
			completedStitches: [{ stitchId: 'stitch-1' }],
			elapsedSeconds: 1583
		});

		render(WorkspacePage);

		await screen.findByText('Прогресс: 100.0% · 1 / 1 крестиков');
		await screen.findByText('Время: 26м 23с');
		await screen.findByText('Время вышивки: 26м 23с');

		await vi.advanceTimersByTimeAsync(5000);

		expect(screen.getByText('Время: 26м 23с')).toBeTruthy();
		expect(screen.getByText('Время вышивки: 26м 23с')).toBeTruthy();
		expect(screen.queryByText('Время: 26м 28с')).toBeNull();
	});

	it('resumes the timer when a completed pattern becomes incomplete again', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
		vi.mocked(api.getProgress).mockResolvedValueOnce({
			completedStitches: [{ stitchId: 'stitch-1' }],
			elapsedSeconds: 1583
		});
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 100.0% · 1 / 1 крестиков');
		await screen.findByText('Время: 26м 23с');
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();

		await dispatchPointerEvent(canvas!, 'pointerdown', { pointerId: 1, clientX: 150, clientY: 150 });
		await dispatchPointerEvent(canvas!, 'pointerup', { pointerId: 1, clientX: 150, clientY: 150 });
		await screen.findByText('Прогресс: 0.0% · 0 / 1 крестиков');

		await vi.advanceTimersByTimeAsync(5000);

		expect(screen.getByText('Время: 26м 28с')).toBeTruthy();
		expect(screen.queryByText('Ты умничка!')).toBeNull();
	});

	it('pinch-zooms with two touch pointers without toggling a stitch', async () => {
		const { container } = render(WorkspacePage);

		await screen.findByText('Прогресс: 0.0% · 0 / 1 крестиков');
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
			expect(screen.getByText('Прогресс: 0.0% · 0 / 1 крестиков')).toBeTruthy();
		});
		expect(api.saveProgress).not.toHaveBeenCalled();
	});
});
