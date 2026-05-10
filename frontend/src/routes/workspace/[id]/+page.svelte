<script lang="ts">
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  const patternId = $page.params.id ?? '';
  
  let pattern = $state(null as any);
  let progress = $state(null as any);
  let loading = $state(true);
  
  // Set to store stitched coordinates as strings "x,y" for O(1) lookup
  let stitchedSet = $state(new Set<string>());
  
  // Debounce saving
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let isSaving = $state(false);

  onMount(async () => {
    try {
      const [patternData, progressData] = await Promise.all([
        api.getPattern(patternId),
        api.getProgress(patternId)
      ]);
      pattern = patternData;
      progress = progressData;
      
      if (progress && progress.stitchedCoords) {
        const newSet = new Set<string>();
        progress.stitchedCoords.forEach((coord: {x: number, y: number}) => {
          newSet.add(`${coord.x},${coord.y}`);
        });
        stitchedSet = newSet;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function toggleStitch(x: number, y: number) {
    if (pattern.patternData[y][x] === 'EMPTY') return; // Cannot stitch empty cells

    const key = `${x},${y}`;
    const newSet = new Set(stitchedSet);
    
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    
    stitchedSet = newSet;
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    isSaving = true;
    
    saveTimeout = setTimeout(async () => {
      const coordsArray = Array.from(stitchedSet).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      });
      
      try {
        await api.saveProgress(patternId, coordsArray);
      } catch (e) {
        console.error('Failed to save progress', e);
      } finally {
        isSaving = false;
      }
    }, 1000); // 1 second debounce
  }

  function getThreadPaletteLabel() {
    return pattern.settings.threadPalette || pattern.palette[0]?.manufacturer || 'DMC';
  }

  // Get color hex for a given thread code
  function getColorHex(threadCode: string) {
    if (threadCode === 'EMPTY') return 'transparent';
    const color = pattern.palette.find((c: any) => (c.code ?? c.name) === threadCode);
    return color ? color.hex : '#ffffff';
  }
</script>

<svelte:head>
  <title>Рабочая область - CrossStitch</title>
</svelte:head>

<div class="h-full flex flex-col -m-8"> <!-- Negative margin to offset layout padding and use full height -->
  {#if loading}
    <div class="flex-1 flex justify-center items-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  {:else if !pattern}
    <div class="flex-1 flex justify-center items-center">
      <p class="text-red-600">Схема не найдена.</p>
    </div>
  {:else}
    <!-- Top toolbar -->
    <div class="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center z-10 shadow-sm">
      <div class="flex items-center space-x-4">
        <a href="/gallery" class="text-gray-500 hover:text-gray-700">&larr; В галерею</a>
        <h1 class="text-lg font-medium text-gray-900">
          Схема ({pattern.settings.width}x{pattern.settings.height})
        </h1>
      </div>
      <div class="flex items-center space-x-4 text-sm">
        <div class="text-gray-500">
          Прогресс: {stitchedSet.size} / {
            pattern.patternData.reduce((acc: number, row: string[]) => acc + row.filter(c => c !== 'EMPTY').length, 0)
          } крестиков
        </div>
        <div class="text-xs">
          {#if isSaving}
            <span class="text-yellow-600">Сохранение...</span>
          {:else}
            <span class="text-green-600">Сохранено</span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Main workspace area -->
    <div class="flex-1 flex overflow-hidden bg-gray-100">
      
      <!-- Palette Sidebar -->
      <div class="w-64 bg-white border-r border-gray-200 overflow-y-auto p-4 hidden md:block">
        <h2 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Палитра {getThreadPaletteLabel()}</h2>
        <ul class="space-y-2">
          {#each pattern.palette as color}
            <li class="flex items-center space-x-3 text-sm">
              <span class="w-6 h-6 rounded-full border border-gray-300 shadow-sm" style="background-color: {color.hex}"></span>
              <span>
                <span class="font-mono">{color.code ?? color.name}</span>
                <span class="block text-xs text-gray-500">{color.name}</span>
              </span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Grid Area -->
      <div class="flex-1 overflow-auto p-4 md:p-8">
        <div class="inline-block bg-white p-4 shadow-lg rounded-lg">
          <div 
            class="grid" 
            style="
              grid-template-columns: repeat({pattern.settings.width}, 15px);
              grid-template-rows: repeat({pattern.settings.height}, 15px);
            "
          >
            {#each pattern.patternData as row, y}
              {#each row as cell, x}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  class="w-full h-full border-r border-b border-gray-200 cursor-pointer flex items-center justify-center {cell === 'EMPTY' ? 'bg-transparent border-transparent' : 'hover:opacity-80'}"
                  style="
                    background-color: {cell === 'EMPTY' ? 'transparent' : getColorHex(cell)};
                    border-left: {x === 0 ? '1px solid #e5e7eb' : 'none'};
                    border-top: {y === 0 ? '1px solid #e5e7eb' : 'none'};
                  "
                  onclick={() => toggleStitch(x, y)}
                >
                  {#if stitchedSet.has(`${x},${y}`)}
                    <svg class="w-3 h-3 text-white drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  {/if}
                </div>
              {/each}
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Base styles for the grid */
  .grid > div {
    box-sizing: border-box;
  }
</style>
