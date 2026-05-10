<script lang="ts">
  import { api, type StitchKind } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';

  type ThreadPalette = {
    id: string;
    label: string;
  };

  type StitchKindOption = {
    id: StitchKind;
    label: string;
    description: string;
  };

  const stitchKindOptions: StitchKindOption[] = [
    { id: 'full_cross', label: 'Обычный крестик', description: 'Полный X на всю клетку.' },
    { id: 'half_cross', label: 'Полукрест', description: 'Одна диагональ / или \\.' },
    { id: 'quarter_cross', label: 'Четверть крестика', description: 'Короткий стежок от угла к центру.' },
    { id: 'three_quarter_cross', label: 'Три четверти крестика', description: 'Диагональ плюс короткий стежок для сглаживания края.' },
  ];

  let file: File | null = $state(null);
  let imagePreviewUrl = $state<string | null>(null);
  let width = $state(40);
  let height = $state(40);
  let maxColors = $state(10);
  let threadPalette = $state('DMC');
  let selectedStitchKinds = $state<StitchKind[]>(['full_cross']);
  let stitchBackground = $state(true);
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

  onDestroy(() => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
  });

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }

      file = input.files[0];
      imagePreviewUrl = URL.createObjectURL(file);
    }
  }

  function isStitchKindSelected(stitchKind: StitchKind) {
    return selectedStitchKinds.includes(stitchKind);
  }

  function toggleStitchKind(stitchKind: StitchKind) {
    if (selectedStitchKinds.includes(stitchKind)) {
      if (selectedStitchKinds.length === 1) {
        error = 'Нужно выбрать хотя бы один вид крестиков';
        return;
      }

      selectedStitchKinds = selectedStitchKinds.filter((selected) => selected !== stitchKind);
      error = '';
      return;
    }

    selectedStitchKinds = [...selectedStitchKinds, stitchKind];
    error = '';
  }

  async function handleSubmit() {
    if (!file) {
      error = 'Пожалуйста, выберите изображение';
      return;
    }

    if (selectedStitchKinds.length === 0) {
      error = 'Нужно выбрать хотя бы один вид крестиков';
      return;
    }
    
    try {
      isUploading = true;
      error = '';
      const result = await api.uploadImage(
        file,
        width,
        height,
        maxColors,
        threadPalette,
        selectedStitchKinds,
        stitchBackground,
      );
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

<div class="glass-card mx-auto max-w-2xl p-8">
  <div class="mb-8">
    <a href="/gallery" class="mb-5 inline-flex items-center text-sm font-medium text-violet-600 transition hover:text-violet-500">
      &larr; В галерею
    </a>
    <div>
      <h1 class="mb-2 text-3xl font-bold tracking-tight text-gray-950">Создать новую схему вышивки</h1>
      <p class="text-sm text-gray-600">Загрузите изображение и настройте параметры будущей схемы.</p>
    </div>
  </div>

  {#if error}
    <div class="mb-6 rounded-2xl border border-red-100 bg-red-50/80 p-4 text-red-700 shadow-sm backdrop-blur-xl">
      {error}
    </div>
  {/if}

  <div class="space-y-6">
    <div>
      <label for="image" class="block text-sm font-medium text-gray-700">Изображение (PNG, JPEG)</label>
      <div class="mt-2 flex justify-center rounded-3xl border-2 border-dashed border-white/55 bg-white/20 px-6 pb-6 pt-5 shadow-inner shadow-white/40 ring-1 ring-violet-950/5 backdrop-blur-xl">
        <div class="space-y-1 text-center">
          {#if imagePreviewUrl}
            <img
              src={imagePreviewUrl}
              alt="Предпросмотр загруженного изображения"
              class="mx-auto max-h-64 rounded-2xl object-contain shadow-lg"
            >
          {:else}
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {/if}
          <div class="flex text-sm text-gray-600 justify-center">
            <label for="file-upload" class="relative cursor-pointer rounded-xl bg-white/35 px-3 py-1 font-medium text-violet-600 shadow-sm ring-1 ring-white/50 backdrop-blur-xl hover:bg-white/50 hover:text-violet-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-violet-300">
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
        <input type="number" id="width" bind:value={width} min="10" max="500" class="glass-input mt-1">
      </div>
      <div>
        <label for="height" class="block text-sm font-medium text-gray-700">Высота (крестиков)</label>
        <input type="number" id="height" bind:value={height} min="10" max="500" class="glass-input mt-1">
      </div>
    </div>

    <div>
      <label for="max-colors" class="block text-sm font-medium text-gray-700">Количество цветов</label>
      <input type="number" id="max-colors" bind:value={maxColors} min="2" max="100" class="glass-input mt-1">
      <p class="mt-1 text-xs text-gray-500">Меньше цветов — проще схема, больше цветов — точнее изображение.</p>
    </div>

    <div>
      <label for="thread-palette" class="block text-sm font-medium text-gray-700">Палитра ниток</label>
      <select id="thread-palette" bind:value={threadPalette} class="glass-input mt-1">
        {#each threadPalettes as palette}
          <option value={palette.id}>{palette.label}</option>
        {/each}
      </select>
      <p class="mt-1 text-xs text-gray-500">Выбранная палитра влияет на итоговые цвета схемы.</p>
    </div>

    <fieldset>
      <legend class="block text-sm font-medium text-gray-700">Виды крестиков в схеме</legend>
      <p class="mt-1 text-xs text-gray-500">
        Если выбрать несколько видов, обычные крестики будут использоваться внутри цветовых областей, а дробные — на границах для сглаживания.
      </p>
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {#each stitchKindOptions as stitchKind}
          <label class="glass-choice">
            <input
              type="checkbox"
              checked={isStitchKindSelected(stitchKind.id)}
              onchange={() => toggleStitchKind(stitchKind.id)}
              class="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            >
            <span>
              <span class="block text-sm font-medium text-gray-900">{stitchKind.label}</span>
              <span class="block text-xs text-gray-500">{stitchKind.description}</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="glass-choice">
      <input
        type="checkbox"
        bind:checked={stitchBackground}
        class="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
      >
      <span>
        <span class="block text-sm font-medium text-gray-900">Вышивать фон</span>
        <span class="block text-xs text-gray-500">
          Если выключить, внешний однотонный фон будет исключен из схемы, но похожие области внутри изображения сохранятся.
        </span>
      </span>
    </label>

    <div class="pt-4">
      <button 
        onclick={handleSubmit} 
        disabled={isUploading || !file}
        class="glass-button-primary w-full"
      >
        {isUploading ? 'Генерация...' : 'Создать схему'}
      </button>
    </div>
  </div>
</div>
