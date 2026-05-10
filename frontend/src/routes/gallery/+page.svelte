<script lang="ts">
  import { api } from '$lib/api';
</script>

<svelte:head>
  <title>Галерея схем - CrossStitch</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Ваши схемы</h1>
    <a href="/" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium">Новая схема</a>
  </div>

  {#await api.getPatterns()}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  {:then patterns}
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
              <a href={`/workspace/${pattern.id}`} class="w-full text-center bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-2 rounded-md text-sm font-medium transition-colors">
                Вышивать
              </a>
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
  {:catch error}
    <div class="bg-red-50 text-red-700 p-4 rounded-md">
      Ошибка при загрузке галереи: {error.message}
    </div>
  {/await}
</div>
