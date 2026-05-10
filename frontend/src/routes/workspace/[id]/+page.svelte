<script lang="ts">
  import { page } from '$app/stores';
  import { api, type CompletedStitch } from '$lib/api';
  import { calculateProgressPercent, countTotalStitches } from '$lib/progress';
  import { tick } from 'svelte';
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
  let canvas = $state<HTMLCanvasElement>();
  let canvasContainer = $state<HTMLDivElement>();
  let viewScale = $state(1);
  let offsetX = $state(24);
  let offsetY = $state(24);
  let hoveredCell = $state<{ x: number; y: number } | null>(null);
  let isPaletteOpen = $state(false);
  let isPanning = false;
  let didPan = false;
  let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  let animationFrameId: number | null = null;
  let canvasCssSize = { width: 0, height: 0, dpr: 1 };
  let staticLayer: HTMLCanvasElement | null = null;
  let staticLayerKey = '';
  const cellSize = 15;
  const minScale = 0.2;
  const maxScale = 6;
  const maxStaticLayerPixels = 16_000_000;
  const totalStitches = $derived(countTotalStitches(pattern));
  const progressPercent = $derived(calculateProgressPercent(completedStitchIds.size, totalStitches));
  
  // Debounce saving
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let isSaving = $state(false);

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => scheduleDraw());

    async function loadWorkspace() {
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
        await tick();
        if (canvasContainer) {
          resizeObserver.observe(canvasContainer);
        }
        resetView();
      }
    }

    void loadWorkspace();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });

  $effect(() => {
    pattern;
    completedStitchIds;
    viewScale;
    offsetX;
    offsetY;
    hoveredCell;
    scheduleDraw();
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

  function getOzonSearchUrl(color: any) {
    const manufacturer = color.manufacturer || pattern.settings.threadPalette || 'DMC';
    const code = color.code ?? color.name;
    const query = `нитки мулине ${manufacturer} ${code} вышивка крестом`;
    return `https://www.ozon.ru/search/?text=${encodeURIComponent(query)}`;
  }

  function scheduleDraw() {
    if (animationFrameId !== null) return;

    animationFrameId = requestAnimationFrame(() => {
      animationFrameId = null;
      drawCanvas();
    });
  }

  function drawCanvas() {
    if (!canvas || !pattern || pattern.schemaVersion !== 2) return;

    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (!context || rect.width === 0 || rect.height === 0) return;

    ensureCanvasSize(rect);
    context.setTransform(canvasCssSize.dpr, 0, 0, canvasCssSize.dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#f3f4f6';
    context.fillRect(0, 0, rect.width, rect.height);

    const visibleRange = getVisibleRange(rect);

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(viewScale, viewScale);

    drawPatternBackground(context);
    const cachedLayer = getStaticLayer();
    if (cachedLayer) {
      context.drawImage(cachedLayer, 0, 0);
    } else {
      drawPatternCells(context, visibleRange);
    }
    drawCompletedMarkers(context, visibleRange);
    drawGrid(context, visibleRange);
    drawHover(context);
    context.restore();
  }

  function ensureCanvasSize(rect: DOMRect) {
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    if (canvas.width !== width || canvas.height !== height || canvasCssSize.dpr !== dpr) {
      canvas.width = width;
      canvas.height = height;
      canvasCssSize = { width: rect.width, height: rect.height, dpr };
    } else {
      canvasCssSize.width = rect.width;
      canvasCssSize.height = rect.height;
    }
  }

  function drawPatternBackground(context: CanvasRenderingContext2D) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pattern.settings.width * cellSize, pattern.settings.height * cellSize);
  }

  function getStaticLayer() {
    const patternWidth = pattern.settings.width * cellSize;
    const patternHeight = pattern.settings.height * cellSize;
    if (patternWidth * patternHeight > maxStaticLayerPixels) {
      staticLayer = null;
      staticLayerKey = '';
      return null;
    }

    const key = `${pattern.id}:${pattern.settings.width}:${pattern.settings.height}:${pattern.patternData.length}:${pattern.palette.length}`;
    if (staticLayer && staticLayerKey === key) {
      return staticLayer;
    }

    const layer = document.createElement('canvas');
    layer.width = patternWidth;
    layer.height = patternHeight;

    const layerContext = layer.getContext('2d');
    if (!layerContext) return null;

    drawPatternBackground(layerContext);
    drawPatternCells(layerContext, {
      startX: 0,
      endX: pattern.settings.width - 1,
      startY: 0,
      endY: pattern.settings.height - 1,
    });

    staticLayer = layer;
    staticLayerKey = key;
    return staticLayer;
  }

  type VisibleRange = {
    startX: number;
    endX: number;
    startY: number;
    endY: number;
  };

  function getVisibleRange(rect: DOMRect): VisibleRange {
    const startX = Math.max(0, Math.floor((-offsetX / viewScale) / cellSize) - 1);
    const startY = Math.max(0, Math.floor((-offsetY / viewScale) / cellSize) - 1);
    const endX = Math.min(
      pattern.settings.width - 1,
      Math.ceil(((rect.width - offsetX) / viewScale) / cellSize) + 1,
    );
    const endY = Math.min(
      pattern.settings.height - 1,
      Math.ceil(((rect.height - offsetY) / viewScale) / cellSize) + 1,
    );

    return { startX, endX, startY, endY };
  }

  function drawPatternCells(context: CanvasRenderingContext2D, visibleRange: VisibleRange) {
    for (let y = visibleRange.startY; y <= visibleRange.endY; y++) {
      const row = pattern.patternData[y] as PatternCell[] | undefined;
      if (!row) continue;

      for (let xIndex = visibleRange.startX; xIndex <= visibleRange.endX; xIndex++) {
        const cell = row[xIndex];
        if (!cell) continue;

        const stitch = getPrimaryStitch(cell);
        if (!stitch) continue;

        const x = cell.x * cellSize;
        const y = cell.y * cellSize;
        context.fillStyle = getColorHex(cell);
        context.fillRect(x, y, cellSize, cellSize);
        drawStitchSymbol(context, cell, stitch, x, y);

      }
    }
  }

  function drawCompletedMarkers(context: CanvasRenderingContext2D, visibleRange: VisibleRange) {
    if (completedStitchIds.size === 0) return;

    for (let y = visibleRange.startY; y <= visibleRange.endY; y++) {
      const row = pattern.patternData[y] as PatternCell[] | undefined;
      if (!row) continue;

      for (let xIndex = visibleRange.startX; xIndex <= visibleRange.endX; xIndex++) {
        const cell = row[xIndex];
        if (!cell || !isStitchCompleted(cell)) continue;

        drawCompletedMarker(context, cell.x * cellSize, cell.y * cellSize);
      }
    }
  }

  function drawStitchSymbol(
    context: CanvasRenderingContext2D,
    cell: PatternCell,
    stitch: CellStitch,
    x: number,
    y: number,
  ) {
    context.save();
    context.strokeStyle = getStitchStrokeColor(cell);
    context.lineWidth = 1.8;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (stitch.kind === 'full_cross') {
      drawLine(context, x + 3, y + 3, x + cellSize - 3, y + cellSize - 3);
      drawLine(context, x + cellSize - 3, y + 3, x + 3, y + cellSize - 3);
    } else if (stitch.kind === 'half_cross') {
      drawHalfLine(context, stitch, x, y);
    } else if (stitch.kind === 'quarter_cross') {
      drawQuarterLine(context, stitch, x, y);
    } else if (stitch.kind === 'three_quarter_cross') {
      drawHalfLine(context, stitch, x, y);
      drawQuarterLine(context, stitch, x, y);
    }

    context.restore();
  }

  function drawHalfLine(context: CanvasRenderingContext2D, stitch: CellStitch, x: number, y: number) {
    if (stitch.direction === 'backslash') {
      drawLine(context, x + 3, y + 3, x + cellSize - 3, y + cellSize - 3);
      return;
    }

    drawLine(context, x + 3, y + cellSize - 3, x + cellSize - 3, y + 3);
  }

  function drawQuarterLine(context: CanvasRenderingContext2D, stitch: CellStitch, x: number, y: number) {
    const centerX = x + cellSize / 2;
    const centerY = y + cellSize / 2;
    const corner = stitch.corner ?? 'top_left';

    if (corner === 'top_right') {
      drawLine(context, x + cellSize - 3, y + 3, centerX, centerY);
    } else if (corner === 'bottom_left') {
      drawLine(context, x + 3, y + cellSize - 3, centerX, centerY);
    } else if (corner === 'bottom_right') {
      drawLine(context, x + cellSize - 3, y + cellSize - 3, centerX, centerY);
    } else {
      drawLine(context, x + 3, y + 3, centerX, centerY);
    }
  }

  function drawLine(
    context: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) {
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
  }

  function drawCompletedMarker(context: CanvasRenderingContext2D, x: number, y: number) {
    context.save();
    context.fillStyle = '#34d399';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.22, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawGrid(context: CanvasRenderingContext2D, visibleRange: VisibleRange) {
    if (cellSize * viewScale < 5) return;

    const width = pattern.settings.width * cellSize;
    const height = pattern.settings.height * cellSize;
    context.save();
    context.strokeStyle = '#d1d5db';
    context.lineWidth = 1 / viewScale;
    context.beginPath();

    for (let x = visibleRange.startX; x <= visibleRange.endX + 1; x++) {
      const position = x * cellSize;
      context.moveTo(position, 0);
      context.lineTo(position, height);
    }

    for (let y = visibleRange.startY; y <= visibleRange.endY + 1; y++) {
      const position = y * cellSize;
      context.moveTo(0, position);
      context.lineTo(width, position);
    }

    context.stroke();
    context.restore();
  }

  function drawHover(context: CanvasRenderingContext2D) {
    if (!hoveredCell) return;

    context.save();
    context.strokeStyle = '#4f46e5';
    context.lineWidth = 2 / viewScale;
    context.strokeRect(hoveredCell.x * cellSize, hoveredCell.y * cellSize, cellSize, cellSize);
    context.restore();
  }

  function getCellFromPointer(event: PointerEvent | MouseEvent | WheelEvent) {
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - offsetX) / viewScale;
    const worldY = (event.clientY - rect.top - offsetY) / viewScale;
    const x = Math.floor(worldX / cellSize);
    const y = Math.floor(worldY / cellSize);

    if (x < 0 || y < 0 || x >= pattern.settings.width || y >= pattern.settings.height) {
      return null;
    }

    return { x, y };
  }

  function getCellAt(x: number, y: number): PatternCell | null {
    return pattern.patternData[y]?.[x] ?? null;
  }

  function handlePointerDown(event: PointerEvent) {
    if (!canvas) return;

    isPanning = true;
    didPan = false;
    panStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (isPanning) {
      const deltaX = event.clientX - panStart.x;
      const deltaY = event.clientY - panStart.y;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        didPan = true;
      }
      offsetX = panStart.offsetX + deltaX;
      offsetY = panStart.offsetY + deltaY;
      return;
    }

    hoveredCell = getCellFromPointer(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (isPanning) {
      canvas?.releasePointerCapture(event.pointerId);
      isPanning = false;
      if (!didPan) {
        const cellPosition = getCellFromPointer(event);
        if (!cellPosition) return;

        const cell = getCellAt(cellPosition.x, cellPosition.y);
        if (cell) toggleStitch(cell);
      }
    }
  }

  function handlePointerLeave() {
    hoveredCell = null;
    isPanning = false;
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 0.85);
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nextScale = Math.min(maxScale, Math.max(minScale, viewScale * factor));
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const worldX = (mouseX - offsetX) / viewScale;
    const worldY = (mouseY - offsetY) / viewScale;

    offsetX = mouseX - worldX * nextScale;
    offsetY = mouseY - worldY * nextScale;
    viewScale = nextScale;
  }

  function zoomFromCenter(factor: number) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function resetView() {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const patternWidth = pattern.settings.width * cellSize;
    const patternHeight = pattern.settings.height * cellSize;
    const fitScale = Math.min(
      1,
      (rect.width - 48) / patternWidth,
      (rect.height - 48) / patternHeight,
    );

    viewScale = Math.max(minScale, fitScale);
    offsetX = Math.max(24, (rect.width - patternWidth * viewScale) / 2);
    offsetY = Math.max(24, (rect.height - patternHeight * viewScale) / 2);
  }
</script>

<svelte:head>
  <title>Рабочая область - CrossStitch</title>
</svelte:head>

<div class="relative h-full w-full overflow-hidden bg-gray-100">
  {#if loading}
    <div class="flex h-full items-center justify-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  {:else if !pattern}
    <div class="flex h-full items-center justify-center">
      <p class="text-red-600">Схема не найдена.</p>
    </div>
  {:else if pattern.schemaVersion !== 2}
    <div class="flex h-full items-center justify-center">
      <p class="text-red-600">Схема создана в старом формате, создайте ее заново.</p>
    </div>
  {:else}
    <div bind:this={canvasContainer} class="absolute inset-0">
      <canvas
        bind:this={canvas}
        class="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointerleave={handlePointerLeave}
        onwheel={handleWheel}
      ></canvas>
    </div>

    <div class="pointer-events-none absolute left-4 right-4 top-4 z-20 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl bg-white/95 p-2 text-sm shadow-lg ring-1 ring-gray-200 backdrop-blur">
        <a href="/gallery" class="rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">&larr; В галерею</a>
        <a href="/" class="rounded-lg bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100">Новая схема</a>
        <div class="hidden h-6 w-px bg-gray-200 sm:block"></div>
        <div class="px-2 text-gray-700">
          <span class="font-medium text-gray-900">Схема</span>
          <span class="text-gray-500">({pattern.settings.width}x{pattern.settings.height})</span>
        </div>
      </div>

      <div class="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        <div class="rounded-xl bg-white/95 px-4 py-3 text-sm shadow-lg ring-1 ring-gray-200 backdrop-blur">
          <div class="font-medium text-gray-900">Прогресс: {progressPercent}%</div>
          <div class="text-xs text-gray-500">{completedStitchIds.size} / {totalStitches} крестиков</div>
        </div>
        <div class="rounded-xl bg-white/95 px-3 py-3 text-xs shadow-lg ring-1 ring-gray-200 backdrop-blur">
          {#if isSaving}
            <span class="text-yellow-600">Сохранение...</span>
          {:else}
            <span class="text-green-600">Сохранено</span>
          {/if}
        </div>
        <button
          type="button"
          class="rounded-xl bg-white/95 px-4 py-3 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-200 backdrop-blur hover:bg-white"
          aria-expanded={isPaletteOpen}
          onclick={() => (isPaletteOpen = !isPaletteOpen)}
        >
          {isPaletteOpen ? 'Закрыть палитру' : 'Палитра ниток'}
        </button>
      </div>
    </div>

    {#if isPaletteOpen}
      <aside class="absolute bottom-4 right-4 top-28 z-20 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white/95 shadow-2xl ring-1 ring-gray-200 backdrop-blur">
        <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 class="text-sm font-bold uppercase tracking-wider text-gray-700">Палитра {getThreadPaletteLabel()}</h2>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Закрыть палитру"
            onclick={() => (isPaletteOpen = false)}
          >
            Закрыть
          </button>
        </div>
        <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {#each pattern.palette as color}
            <li class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 items-center gap-3">
                <span class="h-6 w-6 shrink-0 rounded-full border border-gray-300 shadow-sm" style="background-color: {color.hex}"></span>
                <span class="min-w-0">
                  <span class="font-mono">{color.code ?? color.name}</span>
                  <span class="block truncate text-xs text-gray-500">{color.name}</span>
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
      </aside>
    {/if}

    <div class="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-xl bg-white/95 p-2 text-xs shadow-lg ring-1 ring-gray-200 backdrop-blur">
      <button
        type="button"
        class="rounded bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100"
        onclick={() => zoomFromCenter(1.2)}
      >
        +
      </button>
      <button
        type="button"
        class="rounded bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100"
        onclick={() => zoomFromCenter(0.8)}
      >
        -
      </button>
      <button
        type="button"
        class="rounded bg-gray-100 px-3 py-2 font-medium text-gray-700 hover:bg-gray-200"
        onclick={resetView}
      >
        Сброс
      </button>
      <span class="px-2 text-gray-500">{Math.round(viewScale * 100)}%</span>
    </div>
  {/if}
</div>

