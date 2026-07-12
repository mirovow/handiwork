import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/api', () => ({
	api: {
		getThreadPalettes: vi.fn().mockResolvedValue([{ id: 'GAMMA', label: 'Gamma' }]),
		uploadImage: vi.fn()
	}
}));

describe('new pattern page', () => {
	beforeEach(() => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-url');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('uses compact pattern defaults', () => {
		render(Page);

		expect((screen.getByLabelText('Ширина (крестиков)') as HTMLInputElement).value).toBe('40');
		expect((screen.getByLabelText('Высота (крестиков)') as HTMLInputElement).value).toBe('40');
		expect((screen.getByLabelText('Количество цветов') as HTMLInputElement).value).toBe('10');
	});

	it('links to the gallery', () => {
		render(Page);

		expect(screen.getByRole('link', { name: '← В галерею' }).getAttribute('href')).toBe('/gallery');
	});

	it('shows an image preview after upload', async () => {
		render(Page);

		const fileInput = screen.getByLabelText('Загрузить файл') as HTMLInputElement;
		const image = new File(['image'], 'pattern.png', { type: 'image/png' });

		await fireEvent.change(fileInput, { target: { files: [image] } });

		const preview = screen.getByAltText('Предпросмотр загруженного изображения') as HTMLImageElement;
		expect(preview.src).toBe('blob:preview-url');
		expect(screen.getByText('pattern.png')).toBeTruthy();
	});
});
