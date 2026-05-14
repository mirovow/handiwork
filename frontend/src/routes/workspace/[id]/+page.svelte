<script lang="ts">
  import { page } from '$app/stores';
  import { api, type CompletedStitch } from '$lib/api';
  import { calculateProgressPercent, countTotalStitches, formatProgressPercent } from '$lib/progress';
  import { buildThreadPurchaseUrl, getCellThreadColor, type ThreadColor } from '$lib/thread-color';
  import { formatElapsedTime } from '$lib/time';
  import { onMount, tick } from 'svelte';

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

  type PointerPosition = {
    x: number;
    y: number;
  };

  type InteractionMode = 'idle' | 'pan' | 'pinch';

  type PinchStart = {
    centerX: number;
    centerY: number;
    distance: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  };

  type ThreadLegendItem = {
    color: ThreadColor;
    threadCode: string;
    totalStitches: number;
    completedStitches: number;
    progressPercent: number;
  };

  type SortableThreadLegendItem = ThreadLegendItem & {
    originalIndex: number;
  };

  const patternId = $page.params.id ?? '';
  
  let pattern = $state(null as any);
  let progress = $state(null as any);
  let loading = $state(true);
  
  let completedStitchIds = $state(new Set<string>());
  let persistedElapsedSeconds = $state(0);
  let sessionElapsedSeconds = $state(0);
  let canvas = $state<HTMLCanvasElement>();
  let canvasContainer = $state<HTMLDivElement>();
  let viewScale = $state(1);
  let offsetX = $state(24);
  let offsetY = $state(24);
  let hoveredCell = $state<{ x: number; y: number } | null>(null);
  let threadTooltipCell = $state<{ x: number; y: number } | null>(null);
  let isPaletteOpen = $state(false);
  let selectedThreadCode = $state<string | null>(null);
  let interactionMode: InteractionMode = 'idle';
  let didPan = false;
  let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  let pinchStart: PinchStart | null = null;
  const activePointers = new Map<number, PointerPosition>();
  let animationFrameId: number | null = null;
  let canvasCssSize = { width: 0, height: 0, dpr: 1 };
  let staticLayer: HTMLCanvasElement | null = null;
  let staticLayerKey = '';
  const cellSize = 15;
  const minScale = 0.2;
  const maxScale = 6;
  const maxStaticLayerPixels = 16_000_000;
  const timeFlushIntervalSeconds = 1;
  const majorGridStep = 10;
  const sectionSize = 50;
  const rulerHeight = 24;
  const rulerWidth = 32;
  const minimapMaxWidth = 128;
  const minimapMaxHeight = 96;
  const minimapRenderCellLimit = 6000;
  const desktopSidePanelWidth = 384;
  const totalStitches = $derived(countTotalStitches(pattern));
  const progressPercent = $derived(calculateProgressPercent(completedStitchIds.size, totalStitches));
  const isPatternComplete = $derived(totalStitches > 0 && completedStitchIds.size >= totalStitches);
  const totalElapsedSeconds = $derived(persistedElapsedSeconds + sessionElapsedSeconds);
  const tooltipPatternCell = $derived(threadTooltipCell ? getCellAt(threadTooltipCell.x, threadTooltipCell.y) : null);
  const tooltipThreadColor = $derived(getCellThreadColor(tooltipPatternCell, pattern?.palette ?? []));
  const threadLegendItems = $derived(getThreadLegendItems());
  const selectedThreadLegendItem = $derived(
    selectedThreadCode ? threadLegendItems.find((item) => item.threadCode === selectedThreadCode) : null,
  );
  
  // Debounce saving
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let sessionStartedAt = 0;
  let persistedSessionSeconds = 0;
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
        const backendElapsedSeconds = progress?.elapsedSeconds ?? 0;
        const storedElapsedSeconds = readStoredElapsedSeconds();
        persistedElapsedSeconds = Math.max(backendElapsedSeconds, storedElapsedSeconds);
        if (storedElapsedSeconds > backendElapsedSeconds) {
          void api.addProgressTime(patternId, storedElapsedSeconds - backendElapsedSeconds).catch((e) => {
            console.error('Failed to sync locally stored stitching time', e);
          });
        }
        
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
        if (pattern?.schemaVersion === 2) {
          startSessionTimer();
        }
      }
    }

    void loadWorkspace();
    window.addEventListener('beforeunload', persistSessionTimeOnUnload);
    window.addEventListener('pagehide', persistSessionTimeOnUnload);

    return () => {
      persistSessionTimeOnUnload();
      window.removeEventListener('beforeunload', persistSessionTimeOnUnload);
      window.removeEventListener('pagehide', persistSessionTimeOnUnload);
      resizeObserver.disconnect();
      if (timerInterval) {
        clearInterval(timerInterval);
      }
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
    threadTooltipCell;
    selectedThreadCode;
    scheduleDraw();
  });

  $effect(() => {
    if (isPatternComplete) {
      stopSessionTimer();
      return;
    }

    if (!loading && pattern?.schemaVersion === 2 && !timerInterval && !sessionStartedAt) {
      startSessionTimer();
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

  function startSessionTimer() {
    if (isPatternComplete) {
      sessionStartedAt = 0;
      sessionElapsedSeconds = 0;
      return;
    }

    sessionStartedAt = Date.now();
    persistedSessionSeconds = 0;
    sessionElapsedSeconds = 0;
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      sessionElapsedSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
      writeStoredElapsedSeconds(persistedElapsedSeconds + sessionElapsedSeconds);
      if (getUnpersistedSessionSeconds() >= timeFlushIntervalSeconds) {
        void persistSessionTime();
      }
    }, 1000);
  }

  function stopSessionTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (!sessionStartedAt) return;

    const completedSessionSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
    const unpersistedSeconds = getUnpersistedSessionSeconds();
    persistedElapsedSeconds += Math.max(0, completedSessionSeconds);
    sessionElapsedSeconds = 0;
    sessionStartedAt = 0;
    persistedSessionSeconds = 0;
    writeStoredElapsedSeconds(persistedElapsedSeconds);

    if (unpersistedSeconds > 0) {
      void api.addProgressTime(patternId, unpersistedSeconds).catch((e) => {
        console.error('Failed to save final stitching time', e);
      });
    }
  }

  function getUnpersistedSessionSeconds() {
    if (!sessionStartedAt) return 0;

    const currentSessionSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
    return Math.max(0, currentSessionSeconds - persistedSessionSeconds);
  }

  async function persistSessionTime() {
    const elapsedSeconds = getUnpersistedSessionSeconds();
    if (elapsedSeconds <= 0) return;

    persistedSessionSeconds += elapsedSeconds;
    try {
      await api.addProgressTime(patternId, elapsedSeconds);
    } catch (e) {
      persistedSessionSeconds -= elapsedSeconds;
      console.error('Failed to save stitching time', e);
    }
  }

  function persistSessionTimeOnUnload() {
    const elapsedSeconds = getUnpersistedSessionSeconds();
    if (elapsedSeconds <= 0) return;

    persistedSessionSeconds += elapsedSeconds;
    writeStoredElapsedSeconds(persistedElapsedSeconds + persistedSessionSeconds);
    if (!api.sendProgressTime(patternId, elapsedSeconds)) {
      void api.addProgressTime(patternId, elapsedSeconds, true).catch((e) => {
        console.error('Failed to save stitching time', e);
      });
    }
  }

  function getElapsedStorageKey() {
    return `crossstitch:${patternId}:elapsedSeconds`;
  }

  function readStoredElapsedSeconds() {
    const storedValue = window.localStorage.getItem(getElapsedStorageKey());
    const parsedValue = Number(storedValue);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 0;
  }

  function writeStoredElapsedSeconds(elapsedSeconds: number) {
    window.localStorage.setItem(getElapsedStorageKey(), Math.max(0, Math.floor(elapsedSeconds)).toString());
  }

  function getThreadPaletteLabel() {
    return pattern.settings.threadPalette || pattern.palette[0]?.manufacturer || 'DMC';
  }

  function getCellThreadCode(cell: PatternCell) {
    return getPrimaryStitch(cell)?.threadCode;
  }

  function getThreadCode(color: ThreadColor) {
    return color.code ?? color.name;
  }

  function getThreadLegendItems(): ThreadLegendItem[] {
    if (!pattern?.palette) return [];

    const stats = new Map<string, { totalStitches: number; completedStitches: number }>();
    for (const row of pattern.patternData ?? []) {
      for (const cell of row as PatternCell[]) {
        for (const stitch of cell.stitches ?? []) {
          const threadCode = stitch.threadCode;
          const current = stats.get(threadCode) ?? { totalStitches: 0, completedStitches: 0 };
          current.totalStitches += 1;
          if (completedStitchIds.has(stitch.id)) {
            current.completedStitches += 1;
          }
          stats.set(threadCode, current);
        }
      }
    }

    const items: SortableThreadLegendItem[] = pattern.palette.map((color: ThreadColor, index: number) => {
        const threadCode = getThreadCode(color);
        const colorStats = stats.get(threadCode) ?? { totalStitches: 0, completedStitches: 0 };

        return {
          color,
          threadCode,
          totalStitches: colorStats.totalStitches,
          completedStitches: colorStats.completedStitches,
          progressPercent: calculateProgressPercent(colorStats.completedStitches, colorStats.totalStitches),
          originalIndex: index,
        };
      });

    return items
      .sort((first, second) => second.totalStitches - first.totalStitches || first.originalIndex - second.originalIndex)
      .map((item) => ({
        color: item.color,
        threadCode: item.threadCode,
        totalStitches: item.totalStitches,
        completedStitches: item.completedStitches,
        progressPercent: item.progressPercent,
      }));
  }

  function getColorHex(cell: PatternCell) {
    const threadCode = getCellThreadCode(cell);
    if (!threadCode) return 'transparent';
    const color = getCellThreadColor(cell, pattern.palette);
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

  function isCellDimmedByThreadFilter(cell: PatternCell) {
    return Boolean(selectedThreadCode && getCellThreadCode(cell) !== selectedThreadCode);
  }

  function getOzonSearchUrl(color: ThreadColor) {
    return buildThreadPurchaseUrl(color, pattern.settings.threadPalette);
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
    drawSectionBoundaries(context, visibleRange);
    drawCenterGuide(context);
    drawHover(context);
    context.restore();
    drawCoordinateRulers(context, visibleRange, rect);
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
    if (selectedThreadCode) {
      staticLayer = null;
      staticLayerKey = '';
      return null;
    }

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
        const isDimmed = isCellDimmedByThreadFilter(cell);
        if (isDimmed) {
          context.save();
          context.globalAlpha = 0.18;
        }

        context.fillStyle = getColorHex(cell);
        context.fillRect(x, y, cellSize, cellSize);
        drawStitchSymbol(context, cell, stitch, x, y);

        if (isDimmed) {
          context.restore();
        }
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

    context.strokeStyle = '#6b7280';
    context.lineWidth = 1.4 / viewScale;
    context.beginPath();

    const firstMajorX = Math.max(0, Math.ceil(visibleRange.startX / majorGridStep) * majorGridStep);
    for (let x = firstMajorX; x <= visibleRange.endX + 1; x += majorGridStep) {
      const position = x * cellSize;
      context.moveTo(position, 0);
      context.lineTo(position, height);
    }

    const firstMajorY = Math.max(0, Math.ceil(visibleRange.startY / majorGridStep) * majorGridStep);
    for (let y = firstMajorY; y <= visibleRange.endY + 1; y += majorGridStep) {
      const position = y * cellSize;
      context.moveTo(0, position);
      context.lineTo(width, position);
    }

    context.stroke();
    context.restore();
  }

  function drawSectionBoundaries(context: CanvasRenderingContext2D, visibleRange: VisibleRange) {
    const width = pattern.settings.width * cellSize;
    const height = pattern.settings.height * cellSize;
    context.save();
    context.strokeStyle = '#7c3aed';
    context.lineWidth = 2 / viewScale;
    context.setLineDash([6 / viewScale, 4 / viewScale]);
    context.beginPath();

    const firstSectionX = Math.max(sectionSize, Math.ceil(visibleRange.startX / sectionSize) * sectionSize);
    for (let x = firstSectionX; x < pattern.settings.width; x += sectionSize) {
      const position = x * cellSize;
      context.moveTo(position, 0);
      context.lineTo(position, height);
    }

    const firstSectionY = Math.max(sectionSize, Math.ceil(visibleRange.startY / sectionSize) * sectionSize);
    for (let y = firstSectionY; y < pattern.settings.height; y += sectionSize) {
      const position = y * cellSize;
      context.moveTo(0, position);
      context.lineTo(width, position);
    }

    context.stroke();
    context.restore();
  }

  function drawCenterGuide(context: CanvasRenderingContext2D) {
    const centerX = getPatternCenterGridX() * cellSize;
    const centerY = getPatternCenterGridY() * cellSize;
    const width = pattern.settings.width * cellSize;
    const height = pattern.settings.height * cellSize;

    context.save();
    context.strokeStyle = '#db2777';
    context.lineWidth = 2 / viewScale;
    context.setLineDash([3 / viewScale, 5 / viewScale]);
    context.beginPath();
    context.moveTo(centerX, 0);
    context.lineTo(centerX, height);
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.stroke();
    context.restore();
  }

  function drawCoordinateRulers(context: CanvasRenderingContext2D, visibleRange: VisibleRange, rect: DOMRect) {
    context.save();
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.fillRect(0, 0, rect.width, rulerHeight);
    context.fillRect(0, 0, rulerWidth, rect.height);
    context.strokeStyle = 'rgba(107, 114, 128, 0.45)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, rulerHeight);
    context.lineTo(rect.width, rulerHeight);
    context.moveTo(rulerWidth, 0);
    context.lineTo(rulerWidth, rect.height);
    context.stroke();

    context.fillStyle = '#374151';
    context.font = '10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const firstMajorX = Math.max(0, Math.ceil(visibleRange.startX / majorGridStep) * majorGridStep);
    for (let x = firstMajorX; x <= visibleRange.endX + 1; x += majorGridStep) {
      const screenX = offsetX + x * cellSize * viewScale;
      if (screenX < rulerWidth || screenX > rect.width) continue;
      context.fillText(String(x), screenX, rulerHeight / 2);
    }

    context.textAlign = 'right';
    const firstMajorY = Math.max(0, Math.ceil(visibleRange.startY / majorGridStep) * majorGridStep);
    for (let y = firstMajorY; y <= visibleRange.endY + 1; y += majorGridStep) {
      const screenY = offsetY + y * cellSize * viewScale;
      if (screenY < rulerHeight || screenY > rect.height) continue;
      context.fillText(String(y), rulerWidth - 6, screenY);
    }

    context.restore();
  }

  function drawHover(context: CanvasRenderingContext2D) {
    const highlightedCell = threadTooltipCell ?? hoveredCell;
    if (!highlightedCell) return;

    context.save();
    context.strokeStyle = '#4f46e5';
    context.lineWidth = 2 / viewScale;
    context.strokeRect(highlightedCell.x * cellSize, highlightedCell.y * cellSize, cellSize, cellSize);
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

  function getThreadTooltipStyle() {
    if (!threadTooltipCell || !canvas) return '';

    const rect = canvas.getBoundingClientRect();
    const cellRight = offsetX + (threadTooltipCell.x + 1) * cellSize * viewScale;
    const cellTop = offsetY + threadTooltipCell.y * cellSize * viewScale;
    const preferredLeft = cellRight + 12;
    const preferredTop = cellTop;
    const maxLeft = Math.max(16, rect.width - 272);
    const maxTop = Math.max(16, rect.height - 172);
    const left = Math.min(Math.max(16, preferredLeft), maxLeft);
    const top = Math.min(Math.max(16, preferredTop), maxTop);

    return `left: ${left}px; top: ${top}px;`;
  }

  function handlePointerDown(event: PointerEvent) {
    if (!canvas) return;
    if (event.button !== 0) return;

    event.preventDefault();
    threadTooltipCell = null;
    activePointers.set(event.pointerId, getPointerPosition(event));
    capturePointer(event.pointerId);

    if (activePointers.size === 1) {
      interactionMode = 'pan';
      didPan = false;
      panStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    } else {
      beginPinchGesture();
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (activePointers.has(event.pointerId)) {
      event.preventDefault();
      activePointers.set(event.pointerId, getPointerPosition(event));
    }

    if (interactionMode === 'pinch') {
      applyPinchGesture();
      return;
    }

    if (interactionMode === 'pan' && activePointers.has(event.pointerId)) {
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

  function handleMouseMove(event: MouseEvent) {
    if (activePointers.size > 0) return;

    hoveredCell = getCellFromPointer(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (!activePointers.has(event.pointerId)) return;

    event.preventDefault();
    activePointers.delete(event.pointerId);
    releasePointer(event.pointerId);

    if (interactionMode === 'pinch') {
      rebaseGestureAfterPointerChange();
      return;
    }

    if (interactionMode === 'pan' && !didPan) {
      const cellPosition = getCellFromPointer(event);
      if (!cellPosition) {
        rebaseGestureAfterPointerChange();
        return;
      }

      const cell = getCellAt(cellPosition.x, cellPosition.y);
      if (cell) toggleStitch(cell);
    }

    rebaseGestureAfterPointerChange();
  }

  function handlePointerCancel(event: PointerEvent) {
    if (!activePointers.has(event.pointerId)) return;

    activePointers.delete(event.pointerId);
    releasePointer(event.pointerId);
    rebaseGestureAfterPointerChange();
  }

  function handlePointerLeave() {
    hoveredCell = null;
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();

    const cellPosition = getCellFromPointer(event);
    if (!cellPosition) {
      threadTooltipCell = null;
      return;
    }

    const cell = getCellAt(cellPosition.x, cellPosition.y);
    const color = getCellThreadColor(cell, pattern?.palette ?? []);
    threadTooltipCell = color ? cellPosition : null;
    hoveredCell = cellPosition;
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 0.85);
  }

  function getPointerPosition(event: PointerEvent): PointerPosition {
    return { x: event.clientX, y: event.clientY };
  }

  function getFirstTwoPointers() {
    const pointers = Array.from(activePointers.values());
    if (pointers.length < 2) return null;

    return [pointers[0], pointers[1]] as const;
  }

  function getPointerDistance(first: PointerPosition, second: PointerPosition) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function getPointerCenter(first: PointerPosition, second: PointerPosition) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function beginPinchGesture() {
    const pointers = getFirstTwoPointers();
    if (!pointers) return;

    const [first, second] = pointers;
    const distance = getPointerDistance(first, second);
    if (distance === 0) return;

    const center = getPointerCenter(first, second);
    pinchStart = {
      centerX: center.x,
      centerY: center.y,
      distance,
      offsetX,
      offsetY,
      scale: viewScale,
    };
    interactionMode = 'pinch';
    didPan = true;
    hoveredCell = null;
  }

  function applyPinchGesture() {
    if (!canvas || !pinchStart) return;

    const pointers = getFirstTwoPointers();
    if (!pointers) return;

    const [first, second] = pointers;
    const distance = getPointerDistance(first, second);
    if (distance === 0) return;

    const rect = canvas.getBoundingClientRect();
    const center = getPointerCenter(first, second);
    const nextScale = Math.min(maxScale, Math.max(minScale, pinchStart.scale * (distance / pinchStart.distance)));
    const startWorldX = (pinchStart.centerX - rect.left - pinchStart.offsetX) / pinchStart.scale;
    const startWorldY = (pinchStart.centerY - rect.top - pinchStart.offsetY) / pinchStart.scale;

    offsetX = center.x - rect.left - startWorldX * nextScale;
    offsetY = center.y - rect.top - startWorldY * nextScale;
    viewScale = nextScale;
  }

  function rebaseGestureAfterPointerChange() {
    pinchStart = null;

    if (activePointers.size >= 2) {
      beginPinchGesture();
      return;
    }

    if (activePointers.size === 1) {
      const [remainingPointer] = activePointers.values();
      interactionMode = 'pan';
      didPan = true;
      panStart = { x: remainingPointer.x, y: remainingPointer.y, offsetX, offsetY };
      return;
    }

    interactionMode = 'idle';
    didPan = false;
  }

  function capturePointer(pointerId: number) {
    try {
      canvas?.setPointerCapture(pointerId);
    } catch {
      // Some test and embedded browser environments do not support pointer capture.
    }
  }

  function releasePointer(pointerId: number) {
    if (!canvas) return;

    try {
      if (!canvas.hasPointerCapture || canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture may already be gone after cancellation or platform gestures.
    }
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

  function focusPatternCenter() {
    if (!canvas || !pattern) return;

    const rect = canvas.getBoundingClientRect();
    centerViewOnWorld(getPatternCenterGridX() * cellSize, getPatternCenterGridY() * cellSize, rect);
  }

  function centerViewOnWorld(worldX: number, worldY: number, rect: DOMRect) {
    const viewCenter = getUsableViewCenter(rect);
    offsetX = viewCenter.x - worldX * viewScale;
    offsetY = viewCenter.y - worldY * viewScale;
  }

  function getUsableViewCenter(rect: DOMRect) {
    const usableWidth = getUsableCanvasWidth(rect);
    return {
      x: usableWidth / 2,
      y: rect.height / 2,
    };
  }

  function getUsableCanvasWidth(rect: DOMRect) {
    if (rect.width < 768) return rect.width;

    return Math.max(360, rect.width - desktopSidePanelWidth);
  }

  function resetView() {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const usableWidth = getUsableCanvasWidth(rect);
    const patternWidth = pattern.settings.width * cellSize;
    const patternHeight = pattern.settings.height * cellSize;
    const fitScale = Math.min(
      1,
      (usableWidth - 48) / patternWidth,
      (rect.height - 48) / patternHeight,
    );

    viewScale = Math.max(minScale, fitScale);
    offsetX = Math.max(24, (usableWidth - patternWidth * viewScale) / 2);
    offsetY = Math.max(24, (rect.height - patternHeight * viewScale) / 2);
  }

  function getPatternCenterLabel() {
    return `${getPatternCenterGridX()} x ${getPatternCenterGridY()}`;
  }

  function getPatternCenterGridX() {
    return Math.ceil(pattern.settings.width / 2);
  }

  function getPatternCenterGridY() {
    return Math.ceil(pattern.settings.height / 2);
  }

  function getMinimapDimensions() {
    const patternWidth = pattern.settings.width;
    const patternHeight = pattern.settings.height;
    const scale = Math.min(minimapMaxWidth / patternWidth, minimapMaxHeight / patternHeight);

    return {
      width: Math.max(36, Math.round(patternWidth * scale)),
      height: Math.max(36, Math.round(patternHeight * scale)),
    };
  }

  function getMinimapStyle() {
    const { width, height } = getMinimapDimensions();
    return `width: ${width}px; height: ${height}px;`;
  }

  function getMinimapViewportBox() {
    if (!canvas || !pattern) {
      return { x: 0, y: 0, width: pattern.settings.width, height: pattern.settings.height };
    }

    const rect = canvas.getBoundingClientRect();
    const patternWidth = pattern.settings.width * cellSize;
    const patternHeight = pattern.settings.height * cellSize;
    const visibleLeft = Math.min(patternWidth, Math.max(0, -offsetX / viewScale));
    const visibleTop = Math.min(patternHeight, Math.max(0, -offsetY / viewScale));
    const visibleRight = Math.min(patternWidth, Math.max(0, (rect.width - offsetX) / viewScale));
    const visibleBottom = Math.min(patternHeight, Math.max(0, (rect.height - offsetY) / viewScale));

    return {
      x: visibleLeft / cellSize,
      y: visibleTop / cellSize,
      width: Math.max(0.5, (visibleRight - visibleLeft) / cellSize),
      height: Math.max(0.5, (visibleBottom - visibleTop) / cellSize),
    };
  }

  function getMinimapCenterStyle() {
    return [
      `left: ${(0.5 * 100).toFixed(2)}%`,
      `top: ${(0.5 * 100).toFixed(2)}%`,
    ].join('; ');
  }

  function handleMinimapClick(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (!canvas || !pattern) return;

    const minimapRect = event.currentTarget.getBoundingClientRect();
    const patternWorldWidth = pattern.settings.width * cellSize;
    const patternWorldHeight = pattern.settings.height * cellSize;
    const ratioX = Math.min(1, Math.max(0, (event.clientX - minimapRect.left) / minimapRect.width));
    const ratioY = Math.min(1, Math.max(0, (event.clientY - minimapRect.top) / minimapRect.height));

    centerViewOnWorld(ratioX * patternWorldWidth, ratioY * patternWorldHeight, canvas.getBoundingClientRect());
  }

  function selectThread(threadCode: string) {
    selectedThreadCode = selectedThreadCode === threadCode ? null : threadCode;
    threadTooltipCell = null;
  }

  function clearThreadFilter() {
    selectedThreadCode = null;
  }

  function getMinimapCells() {
    const totalCells = pattern.settings.width * pattern.settings.height;
    const sampleStep = Math.max(1, Math.ceil(Math.sqrt(totalCells / minimapRenderCellLimit)));
    const cells: Array<{ x: number; y: number; width: number; height: number; color: string }> = [];

    for (let y = 0; y < pattern.settings.height; y += sampleStep) {
      const row = pattern.patternData[y] as PatternCell[] | undefined;
      if (!row) continue;

      for (let x = 0; x < pattern.settings.width; x += sampleStep) {
        const cell = row[x];
        if (!cell || !getPrimaryStitch(cell)) continue;

        cells.push({
          x: cell.x,
          y: cell.y,
          width: Math.min(sampleStep, pattern.settings.width - cell.x),
          height: Math.min(sampleStep, pattern.settings.height - cell.y),
          color: getColorHex(cell),
        });
      }
    }

    return cells;
  }
</script>

<svelte:head>
  <title>Рабочая область - CrossStitch</title>
</svelte:head>

<div class="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.28),transparent_28rem),radial-gradient(circle_at_bottom_right,rgba(216,180,254,0.22),transparent_26rem),linear-gradient(135deg,#fbf7ff,#f3edff_45%,#f8fafc)]">
  {#if loading}
    <div class="flex h-full items-center justify-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
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
        onmousemove={handleMouseMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerCancel}
        onpointerleave={handlePointerLeave}
        onwheel={handleWheel}
        oncontextmenu={handleContextMenu}
      ></canvas>
    </div>

    {#if threadTooltipCell && tooltipThreadColor}
      <div
        class="glass-panel absolute z-30 w-64 border-transparent p-4 text-sm ring-0"
        style={getThreadTooltipStyle()}
        role="tooltip"
      >
        <div class="flex items-start gap-3">
          <span
            class="mt-0.5 h-9 w-9 shrink-0 rounded-lg border border-gray-300 shadow-sm"
            style="background-color: {tooltipThreadColor.hex}"
          ></span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-gray-900">{tooltipThreadColor.name}</div>
            <div class="mt-1 font-mono text-xs text-gray-500">
              {tooltipThreadColor.manufacturer || getThreadPaletteLabel()} {tooltipThreadColor.code ?? tooltipThreadColor.name}
            </div>
          </div>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Закрыть подсказку"
            onclick={() => (threadTooltipCell = null)}
          >
            X
          </button>
        </div>
        <a
          href={getOzonSearchUrl(tooltipThreadColor)}
          target="_blank"
          rel="noopener noreferrer"
          class="glass-button-primary mt-3 w-full"
        >
          Купить
        </a>
      </div>
    {/if}

    <div class="pointer-events-none absolute left-12 right-4 top-9 z-30 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="glass-panel pointer-events-auto flex flex-wrap items-center gap-2 border-transparent p-2 text-sm ring-0">
        <a href="/gallery" class="rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">&larr; В галерею</a>
        <div class="hidden h-6 w-px bg-gray-200 sm:block"></div>
        <div class="px-2 text-gray-700">
          <span class="font-medium text-gray-900">Схема</span>
          <span class="text-gray-500">({pattern.settings.width}x{pattern.settings.height})</span>
        </div>
      </div>

      <div class="pointer-events-auto flex w-full flex-col items-stretch gap-2 sm:w-[26rem] md:w-[28rem]">
        <div class="glass-panel border-transparent px-4 py-3 text-right text-sm ring-0">
          <div class="font-medium text-gray-900">Прогресс: {formatProgressPercent(progressPercent)}% · {completedStitchIds.size} / {totalStitches} крестиков</div>
          <div class="mt-1 text-xs text-gray-500">Время: {formatElapsedTime(totalElapsedSeconds)}</div>
        </div>
        {#if isPaletteOpen}
          <section
            class="glass-panel palette-transform flex max-h-[calc(100vh-9rem)] flex-col border-transparent ring-0"
          >
            <div class="flex items-center justify-between gap-3 border-b border-violet-100/25 px-4 py-3">
              <h2 class="text-sm font-bold uppercase tracking-wider text-gray-700">Палитра {getThreadPaletteLabel()}</h2>
              <button
                type="button"
                class="rounded-lg bg-white/35 px-2 py-1 text-sm font-medium text-violet-700 ring-1 ring-violet-100/80 hover:bg-white/60"
                onclick={() => (isPaletteOpen = false)}
              >
                Закрыть
              </button>
            </div>
            <div class="border-b border-violet-100/25 px-4 py-3 text-xs text-gray-600">
              {#if selectedThreadLegendItem}
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-gray-800">
                    Фильтр: {selectedThreadLegendItem.threadCode}
                  </span>
                  <button
                    type="button"
                    class="rounded-lg bg-white/35 px-2 py-1 font-medium text-violet-700 ring-1 ring-violet-100/80 hover:bg-white/60"
                    onclick={clearThreadFilter}
                  >
                    Показать все цвета
                  </button>
                </div>
              {:else}
                <span>Выбери цвет, чтобы приглушить остальные цвета на схеме</span>
              {/if}
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_3.75rem_4.5rem_3.75rem] gap-3 border-b border-violet-100/25 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-gray-500">
              <span>Цвет</span>
              <span>Код</span>
              <span class="text-right">Прогресс</span>
              <span class="text-right">Нитки</span>
            </div>
            <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {#each threadLegendItems as item}
                <li class="grid grid-cols-[minmax(0,1fr)_3.75rem_4.5rem_3.75rem] items-center gap-3 text-sm">
                  <button
                    type="button"
                    class={`contents ${selectedThreadCode === item.threadCode ? 'text-violet-800' : 'text-gray-700'}`}
                    aria-label={`${item.threadCode} ${item.color.name}`}
                    aria-pressed={selectedThreadCode === item.threadCode}
                    onclick={() => selectThread(item.threadCode)}
                  >
                    <span class="flex min-w-0 items-center gap-3 text-left">
                      <span class="h-6 w-6 shrink-0 rounded-full border border-gray-300 shadow-sm" style="background-color: {item.color.hex}"></span>
                      <span class="min-w-0">
                        <span class="block font-medium leading-snug">{item.color.name}</span>
                        <span class="block truncate text-xs text-gray-500">{item.color.manufacturer || getThreadPaletteLabel()}</span>
                      </span>
                    </span>
                    <span class="font-mono">{item.threadCode}</span>
                    <span class="text-right text-xs">
                      <span class="block font-medium text-gray-800">{item.completedStitches} / {item.totalStitches}</span>
                      <span class="block text-gray-500">{formatProgressPercent(item.progressPercent)}%</span>
                    </span>
                  </button>
                  <a
                    href={getOzonSearchUrl(item.color)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="justify-self-end rounded-lg bg-white/25 px-2 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200/70 hover:bg-white/55 hover:text-violet-700"
                  >
                    Купить
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {:else}
          <button
            type="button"
            class="glass-panel palette-transform border-transparent bg-white/35 px-4 py-3 text-sm font-medium text-violet-700 ring-1 ring-violet-100/80 hover:bg-white/60"
            aria-expanded="false"
            onclick={() => (isPaletteOpen = true)}
          >
            Палитра ниток
          </button>
        {/if}
      </div>
    </div>

    {#if isPatternComplete}
      <div class="pointer-events-none absolute inset-x-4 top-28 z-30 flex justify-center">
        <div class="completion-celebration glass-panel relative overflow-hidden border-transparent px-6 py-5 text-center ring-0">
          <div class="completion-confetti" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <h2 class="text-lg font-bold text-gray-950">Ты умничка!</h2>
          <p class="mt-2 text-sm text-gray-600">Время вышивки: {formatElapsedTime(totalElapsedSeconds)}</p>
        </div>
      </div>
    {/if}

    <div class="glass-panel absolute bottom-4 right-4 z-20 border-transparent p-2 text-xs ring-0">
      <button
        type="button"
        class="relative block overflow-hidden border border-white/70 bg-white/55 shadow-inner"
        style={getMinimapStyle()}
        aria-label="Перейти по мини-карте"
        onclick={handleMinimapClick}
      >
        <svg
          class="h-full w-full"
          role="img"
          aria-label="Мини-карта схемы"
          viewBox={`0 0 ${pattern.settings.width} ${pattern.settings.height}`}
          preserveAspectRatio="none"
        >
          <rect width={pattern.settings.width} height={pattern.settings.height} fill="#ffffff" />
          {#each getMinimapCells() as cell}
            <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill={cell.color} />
          {/each}
          <line x1={getPatternCenterGridX()} y1="0" x2={getPatternCenterGridX()} y2={pattern.settings.height} stroke="#db2777" stroke-width="0.35" stroke-dasharray="1 1" />
          <line x1="0" y1={getPatternCenterGridY()} x2={pattern.settings.width} y2={getPatternCenterGridY()} stroke="#db2777" stroke-width="0.35" stroke-dasharray="1 1" />
          <rect
            x={getMinimapViewportBox().x}
            y={getMinimapViewportBox().y}
            width={getMinimapViewportBox().width}
            height={getMinimapViewportBox().height}
            fill="rgba(124, 58, 237, 0.16)"
            stroke="#7c3aed"
            stroke-width="0.7"
          />
        </svg>
        <span class="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 ring-2 ring-white" style={getMinimapCenterStyle()} aria-hidden="true"></span>
      </button>
    </div>

    <div
      class="glass-panel absolute bottom-4 left-12 z-20 flex items-center gap-2 border-transparent p-2 text-xs ring-0"
      aria-label="Навигация по схеме"
    >
      <button
        type="button"
        class="rounded-lg bg-white/35 px-3 py-2 font-medium text-violet-700 ring-1 ring-violet-100/80 hover:bg-white/60"
        onclick={() => zoomFromCenter(1.2)}
      >
        +
      </button>
      <button
        type="button"
        class="rounded-lg bg-white/35 px-3 py-2 font-medium text-violet-700 ring-1 ring-violet-100/80 hover:bg-white/60"
        onclick={() => zoomFromCenter(0.8)}
      >
        -
      </button>
      <button
        type="button"
        class="rounded-lg bg-white/30 px-3 py-2 font-medium text-gray-700 ring-1 ring-white/50 hover:bg-white/55"
        onclick={focusPatternCenter}
      >
        К центру
      </button>
      <span class="px-2 text-gray-500">{Math.round(viewScale * 100)}%</span>
      {#if hoveredCell}
        <span class="px-2 text-gray-500">{hoveredCell.x} x {hoveredCell.y}</span>
      {/if}
      <span class="h-6 w-px bg-gray-200" aria-hidden="true"></span>
      {#if isSaving}
        <span class="rounded-lg bg-white/30 px-3 py-2 font-medium text-yellow-600 ring-1 ring-white/50">Сохранение...</span>
      {:else}
        <span class="rounded-lg bg-white/30 px-3 py-2 font-medium text-green-600 ring-1 ring-white/50">Сохранено</span>
      {/if}
    </div>
  {/if}
</div>

