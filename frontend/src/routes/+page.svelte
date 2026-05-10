<script lang="ts">
  import { api } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  type ThreadPalette = {
    id: string;
    label: string;
  };

  let file: File | null = $state(null);
  let width = $state(100);
  let height = $state(100);
  let maxColors = $state(30);
  let threadPalette = $state('DMC');
  let threadPalettes = $state<ThreadPalette[]>([{ id: 'DMC', label: 'DMC' }]);
  let isUploading = $state(false);
  let error = $state('');

  onMount(async () => {
    try {
      const palettes = await api.getThreadPalettes();
      if (Array.isArray(palettes) && palettes.length > 0) {
        threadPalettes = palettes;
        threadPalette = palettes[0].id;
      }
    } catch (e) {
      console.error('Failed to load thread palettes', e);
    }
  });

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      file = input.files[0];
    }
  }

  async function handleSubmit() {
    if (!file) {
      error = 'Пожалуйста, выберите изображение';
      return;
    }
    
    try {
      isUploading = true;
      error = '';
      const result = await api.uploadImage(file, width, height, maxColors, threadPalette);
      if (result && result.id) {
        goto(`/workspace/${result.id}`);
      } else {
        error = 'Ошибка при создании схемы';
      }
    } catch (e) {
      error = 'Произошла ошибка при загрузке';
      console.error(e);
    } finally {
      isUploading = false;
    }
  }
</script>

<svelte:head>
  <title>Новая схема - CrossStitch</title>
</svelte:head>

<div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow">
  <h1 class="text-2xl font-bold text-gray-900 mb-6">Создать новую схему вышивки</h1>

  {#if error}
    <div class="bg-red-50 text-red-700 p-4 rounded-md mb-6">
      {error}
    </div>
  {/if}

  <div class="space-y-6">
    <div>
      <label for="image" class="block text-sm font-medium text-gray-700">Изображение (PNG, JPEG)</label>
      <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
        <div class="space-y-1 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div class="flex text-sm text-gray-600 justify-center">
            <label for="file-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
              <span>Загрузить файл</span>
              <input id="file-upload" name="file-upload" type="file" class="sr-only" accept="image/png, image/jpeg" onchange={handleFileChange}>
            </label>
          </div>
          <p class="text-xs text-gray-500">
            {file ? file.name : 'PNG, JPG до 10MB'}
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="width" class="block text-sm font-medium text-gray-700">Ширина (крестиков)</label>
        <input type="number" id="width" bind:value={width} min="10" max="500" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
      </div>
      <div>
        <label for="height" class="block text-sm font-medium text-gray-700">Высота (крестиков)</label>
        <input type="number" id="height" bind:value={height} min="10" max="500" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
      </div>
    </div>

    <div>
      <label for="max-colors" class="block text-sm font-medium text-gray-700">Количество цветов</label>
      <input type="number" id="max-colors" bind:value={maxColors} min="2" max="100" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
      <p class="mt-1 text-xs text-gray-500">Меньше цветов — проще схема, больше цветов — точнее изображение.</p>
    </div>

    <div>
      <label for="thread-palette" class="block text-sm font-medium text-gray-700">Палитра ниток</label>
      <select id="thread-palette" bind:value={threadPalette} class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
        {#each threadPalettes as palette}
          <option value={palette.id}>{palette.label}</option>
        {/each}
      </select>
      <p class="mt-1 text-xs text-gray-500">Выбранная палитра влияет на итоговые цвета схемы.</p>
    </div>

    <div class="pt-4">
      <button 
        onclick={handleSubmit} 
        disabled={isUploading || !file}
        class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
      >
        {isUploading ? 'Генерация...' : 'Создать схему'}
      </button>
    </div>
  </div>
</div>
