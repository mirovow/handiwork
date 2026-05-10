<script lang="ts">
  import { page } from '$app/stores';
  import { api, type CompletedStitch } from '$lib/api';
  import { onMount } from 'svelte';

  type CellStitch = {
    id: string;
    kind: 'full_cross' | 'half_cross' | 'quarter_cross' | 'three_quarter_cross';
    threadCode: string;
    direction?: 'slash' | 'backslash';
    corner?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  };

  type PatternCell = {
    x: number;
    y: number;
    stitches: CellStitch[];
  };

  const patternId = $page.params.id ?? '';
  
  let pattern = $state(null as any);
  let progress = $state(null as any);
  let loading = $state(true);
  
  let completedStitchIds = $state(new Set<string>());
  
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
      
      if (progress && progress.completedStitches) {
        const newSet = new Set<string>();
        progress.completedStitches.forEach((completedStitch: CompletedStitch) => {
          newSet.add(completedStitch.stitchId);
        });
        completedStitchIds = newSet;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function getPrimaryStitch(cell: PatternCell) {
    return cell.stitches[0];
  }

  function toggleStitch(cell: PatternCell) {
    const stitch = getPrimaryStitch(cell);
    if (!stitch) return;

    const newSet = new Set(completedStitchIds);
    
    if (newSet.has(stitch.id)) {
      newSet.delete(stitch.id);
    } else {
      newSet.add(stitch.id);
    }
    
    completedStitchIds = newSet;
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    isSaving = true;
    
    saveTimeout = setTimeout(async () => {
      const completedStitches = Array.from(completedStitchIds).map((stitchId) => ({ stitchId }));
      
      try {
        await api.saveProgress(patternId, completedStitches);
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

  function getCellThreadCode(cell: PatternCell) {
    return getPrimaryStitch(cell)?.threadCode;
  }

  function getColorHex(cell: PatternCell) {
    const threadCode = getCellThreadCode(cell);
    if (!threadCode) return 'transparent';
    const color = pattern.palette.find((c: any) => (c.code ?? c.name) === threadCode);
    return color ? color.hex : '#ffffff';
  }

  function getStitchStrokeColor(cell: PatternCell) {
    const hex = getColorHex(cell);
    if (!hex.startsWith('#') || hex.length !== 7) return '#111827';

    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.55 ? '#111827' : '#ffffff';
  }

  function isStitchCompleted(cell: PatternCell) {
    const stitch = getPrimaryStitch(cell);
    return stitch ? completedStitchIds.has(stitch.id) : false;
  }

  function getTotalStitches() {
    return pattern.patternData.reduce(
      (acc: number, row: PatternCell[]) => acc + row.reduce((rowAcc, cell) => rowAcc + cell.stitches.length, 0),
      (pattern.backstitches?.length ?? 0) + (pattern.knots?.length ?? 0)
    );
  }

  function getOzonSearchUrl(color: any) {
    const manufacturer = color.manufacturer || pattern.settings.threadPalette || 'DMC';
    const code = color.code ?? color.name;
    const query = `нитки мулине ${manufacturer} ${code} вышивка крестом`;
    return `https://www.ozon.ru/search/?text=${encodeURIComponent(query)}`;
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
  {:else if pattern.schemaVersion !== 2}
    <div class="flex-1 flex justify-center items-center">
      <p class="text-red-600">Схема создана в старом формате, создайте ее заново.</p>
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
          Прогресс: {completedStitchIds.size} / {getTotalStitches()} крестиков
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
            <li class="flex items-center justify-between gap-3 text-sm">
              <span class="flex items-center min-w-0 gap-3">
                <span class="w-6 h-6 rounded-full border border-gray-300 shadow-sm shrink-0" style="background-color: {color.hex}"></span>
                <span class="min-w-0">
                  <span class="font-mono">{color.code ?? color.name}</span>
                  <span class="block text-xs text-gray-500 truncate">{color.name}</span>
                </span>
              </span>
              <a
                href={getOzonSearchUrl(color)}
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Купить
              </a>
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
                  class="relative w-full h-full border-r border-b border-gray-200 cursor-pointer flex items-center justify-center {cell.stitches.length === 0 ? 'bg-transparent border-transparent' : 'hover:opacity-80'}"
                  style="
                    background-color: {getColorHex(cell)};
                    border-left: {x === 0 ? '1px solid #e5e7eb' : 'none'};
                    border-top: {y === 0 ? '1px solid #e5e7eb' : 'none'};
                  "
                  onclick={() => toggleStitch(cell)}
                >
                  {#each cell.stitches.slice(0, 1) as stitch}
                    <svg
                      class="h-full w-full drop-shadow-sm"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={getStitchStrokeColor(cell)}
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      {#if stitch.kind === 'full_cross'}
                        <line x1="4" y1="4" x2="20" y2="20"></line>
                        <line x1="20" y1="4" x2="4" y2="20"></line>
                      {:else if stitch.kind === 'half_cross'}
                        {#if stitch.direction === 'backslash'}
                          <line x1="4" y1="4" x2="20" y2="20"></line>
                        {:else}
                          <line x1="4" y1="20" x2="20" y2="4"></line>
                        {/if}
                      {:else if stitch.kind === 'quarter_cross'}
                        {#if stitch.corner === 'top_right'}
                          <line x1="20" y1="4" x2="12" y2="12"></line>
                        {:else if stitch.corner === 'bottom_left'}
                          <line x1="4" y1="20" x2="12" y2="12"></line>
                        {:else if stitch.corner === 'bottom_right'}
                          <line x1="20" y1="20" x2="12" y2="12"></line>
                        {:else}
                          <line x1="4" y1="4" x2="12" y2="12"></line>
                        {/if}
                      {:else if stitch.kind === 'three_quarter_cross'}
                        {#if stitch.direction === 'backslash'}
                          <line x1="4" y1="4" x2="20" y2="20"></line>
                        {:else}
                          <line x1="4" y1="20" x2="20" y2="4"></line>
                        {/if}
                        {#if stitch.corner === 'top_right'}
                          <line x1="20" y1="4" x2="12" y2="12"></line>
                        {:else if stitch.corner === 'bottom_left'}
                          <line x1="4" y1="20" x2="12" y2="12"></line>
                        {:else if stitch.corner === 'bottom_right'}
                          <line x1="20" y1="20" x2="12" y2="12"></line>
                        {:else}
                          <line x1="4" y1="4" x2="12" y2="12"></line>
                        {/if}
                      {/if}
                    </svg>
                    {#if isStitchCompleted(cell)}
                      <span class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-white"></span>
                    {/if}
                  {/each}
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
