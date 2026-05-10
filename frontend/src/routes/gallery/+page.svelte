<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  type GalleryPattern = {
    id: string;
    patternImagePath: string;
    settings: {
      width: number;
      height: number;
    };
    createdAt: string;
  };

  let patterns = $state<GalleryPattern[]>([]);
  let isLoading = $state(true);
  let error = $state('');
  let deletingPatternId = $state<string | null>(null);

  onMount(async () => {
    try {
      patterns = await api.getPatterns();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Неизвестная ошибка';
    } finally {
      isLoading = false;
    }
  });

  async function deletePattern(patternId: string) {
    if (!confirm('Удалить эту схему? Это действие нельзя отменить.')) {
      return;
    }

    try {
      deletingPatternId = patternId;
      await api.deletePattern(patternId);
      patterns = patterns.filter((pattern) => pattern.id !== patternId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось удалить схему';
    } finally {
      deletingPatternId = null;
    }
  }
</script>

<svelte:head>
  <title>Галерея схем - CrossStitch</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Ваши схемы</h1>
    <a href="/" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium">Новая схема</a>
  </div>

  {#if isLoading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  {:else if error}
    <div class="bg-red-50 text-red-700 p-4 rounded-md">
      Ошибка при загрузке галереи: {error}
    </div>
  {:else}
    {#if patterns && patterns.length > 0}
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {#each patterns as pattern}
          <div class="bg-white rounded-lg shadow overflow-hidden flex flex-col">
            <div class="aspect-w-1 aspect-h-1 w-full bg-gray-200">
              <!-- Using the pattern image path as preview -->
              <img src={api.getImageUrl(pattern.patternImagePath)} alt="Preview" class="w-full h-48 object-cover" />
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between">
              <div>
                <p class="text-sm font-medium text-gray-900 mb-1">
                  Размер: {pattern.settings.width} x {pattern.settings.height}
                </p>
                <p class="text-xs text-gray-500 mb-4">
                  Создана: {new Date(pattern.createdAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <a href={`/workspace/${pattern.id}`} class="flex-1 text-center bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-2 rounded-md text-sm font-medium transition-colors">
                  Вышивать
                </a>
                <button
                  type="button"
                  onclick={() => deletePattern(pattern.id)}
                  disabled={deletingPatternId === pattern.id}
                  class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400"
                  aria-label="Удалить схему"
                >
                  <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M8.75 1A1.75 1.75 0 0 0 7 2.75V4H3.25a.75.75 0 0 0 0 1.5h.3l.77 10.007A2.75 2.75 0 0 0 7.062 18h5.876a2.75 2.75 0 0 0 2.742-2.493L16.45 5.5h.3a.75.75 0 0 0 0-1.5H13V2.75A1.75 1.75 0 0 0 11.25 1h-2.5ZM8.5 4h3V2.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V4Zm-.25 4.25a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm4.25.75a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0V9Z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-center py-12 bg-white rounded-lg shadow">
        <p class="text-gray-500 mb-4">У вас пока нет сохраненных схем</p>
        <a href="/" class="text-indigo-600 hover:text-indigo-500 font-medium">Создать первую схему &rarr;</a>
      </div>
    {/if}
  {/if}
</div>
