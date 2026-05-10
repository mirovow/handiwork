# План учета типов стежков

## Цель

Добавить в приложение поддержку разных типов стежков в схемах вышивки и подготовить модель прогресса так, чтобы пользователь мог отмечать выполнение не только всей клетки, но и отдельного стежка внутри клетки.

## Самопроверка

Перед документированием я перепроверил текущую модель проекта и предметную область.

Текущее состояние кода:

1. `Pattern.patternData` сейчас имеет тип `string[][]`.
   - Значение клетки: код нитки выбранной палитры или `EMPTY`.
   - Тип стежка нигде не хранится.

2. `SharpImageProcessingService` сейчас работает по принципу:
   - изображение масштабируется до размера схемы;
   - каждый пиксель мапится в ближайший цвет выбранной палитры;
   - в `patternData[y][x]` записывается только `threadCode`.

3. `Progress.stitchedCoords` сейчас имеет тип `{ x, y }[]`.
   - Прогресс бинарный: клетка отмечена или нет.
   - Нельзя отметить отдельный half/quarter/backstitch внутри одной клетки.

4. Workspace сейчас рисует одну DOM-клетку на один элемент `patternData`.
   - Цвет берется по `threadCode`.
   - Отметка выполнения рисуется одним SVG-крестиком поверх всей клетки.

Предметная область:

1. В схемах обычно встречаются:
   - full cross stitch;
   - half stitch;
   - quarter stitch;
   - three-quarter stitch;
   - backstitch;
   - french knot.

2. Backstitch и french knot лучше моделировать отдельными слоями, а не как обычную клетку.
   - Backstitch — это линия между точками сетки.
   - French knot — это точка/узел на схеме.

3. Автоматически надежно вывести все типы стежков из обычной картинки сложно.
   - Full cross получается естественно из пикселя.
   - Half/quarter можно пробовать генерировать эвристиками на границах цветов, но это отдельная сложная задача.
   - Backstitch и french knot из обычного изображения лучше не генерировать автоматически на первом этапе.

## Рекомендуемый подход

Не добавлять типы стежков поверх текущего `string[][]`. Сначала нужно перейти на версионированную модель схемы.

Первый технический инкремент должен сохранить текущее поведение визуально, но поменять структуру данных:

1. Новые схемы получают `schemaVersion: 2`.
2. `patternData` становится массивом объектов клеток.
3. Каждая клетка может содержать список стежков.
4. Прогресс хранится по `stitchId`, а не по координате клетки.
5. Генератор пока создает только `full_cross` и пустые клетки.

## Новая модель Pattern

```ts
type Pattern = {
  id: string;
  schemaVersion: 2;
  settings: {
    width: number;
    height: number;
    maxColors: number;
    threadPalette: string;
  };
  palette: ThreadColor[];
  patternData: PatternCell[][];
  backstitches: Backstitch[];
  knots: FrenchKnot[];
  createdAt: Date;
};
```

```ts
type PatternCell = {
  x: number;
  y: number;
  stitches: CellStitch[];
};
```

```ts
type CellStitch = {
  id: string;
  kind: 'full_cross' | 'half_cross' | 'quarter_cross' | 'three_quarter_cross';
  threadCode: string;
  direction?: 'slash' | 'backslash';
  corner?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
};
```

Пояснения:

1. `full_cross` не требует `direction` или `corner`.
2. `half_cross` требует `direction`.
3. `quarter_cross` требует `corner`.
4. `three_quarter_cross` может требовать и `direction`, и `corner`, если понадобится точная геометрия.
5. Пустая клетка может быть `{ x, y, stitches: [] }`.

## Backstitch

Backstitch лучше хранить отдельным массивом:

```ts
type Backstitch = {
  id: string;
  threadCode: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};
```

Координаты `from` и `to` должны относиться к узлам сетки, а не к центрам клеток. Например, линия вокруг клетки может идти от `{ x: 10, y: 5 }` до `{ x: 11, y: 5 }`.

## French Knot

French knot тоже лучше хранить отдельным массивом:

```ts
type FrenchKnot = {
  id: string;
  threadCode: string;
  at: { x: number; y: number };
};
```

Координата `at` может быть либо узлом сетки, либо центром клетки. Это нужно выбрать заранее. Для первого инкремента лучше считать `at` центром клетки, если knots появятся позже.

## Новая модель Progress

Текущий прогресс:

```ts
stitchedCoords: Array<{ x: number; y: number }>;
```

Новый прогресс:

```ts
type Progress = {
  patternId: string;
  schemaVersion: 2;
  completedStitches: Array<{
    stitchId: string;
    completedAt?: string;
  }>;
  updatedAt: Date;
};
```

Почему так:

1. Одна клетка может содержать несколько стежков.
2. Backstitch не является клеткой.
3. French knot не является полным крестиком.
4. `stitchId` дает единый способ отмечать выполнение любого типа стежка.

## Генерация

Первый инкремент генерации:

1. Для каждого непрозрачного пикселя создать `CellStitch`:

```ts
{
  id: `${x}:${y}:full`,
  kind: 'full_cross',
  threadCode
}
```

2. Для прозрачного пикселя создать пустую клетку:

```ts
{
  x,
  y,
  stitches: []
}
```

3. `palette` и `maxColors` работают как сейчас.
4. Preview PNG можно пока строить по первому `full_cross` стежку клетки.

Что не делать в первом инкременте:

1. Не генерировать half/quarter автоматически.
2. Не генерировать backstitch автоматически.
3. Не генерировать french knot автоматически.

## UI Workspace

Workspace должен перейти к renderer-подходу.

Для первого инкремента:

1. Если в клетке есть `full_cross`, показывать ее как сейчас.
2. Если `stitches.length === 0`, показывать пустую клетку.
3. При клике по full-cross клетке отмечать конкретный `stitchId`.
4. Прогресс считать как:

```ts
completedStitches.length / totalStitches
```

Где `totalStitches` — сумма всех `cell.stitches.length` плюс будущие `backstitches.length` и `knots.length`.

Для будущих типов:

1. `half_cross` рисовать SVG-диагональю или треугольником.
2. `quarter_cross` рисовать четвертью клетки.
3. `three_quarter_cross` рисовать комбинацией четверти и диагонали.
4. `backstitch` рисовать SVG overlay поверх всей сетки.
5. `french_knot` рисовать точкой overlay.

## API изменения

Backend:

1. `POST /patterns` должен возвращать `schemaVersion: 2`.
2. `GET /patterns/:id` должен возвращать новую структуру.
3. `POST /progress/:patternId` должен принимать `completedStitches`, а не `stitchedCoords`.

Frontend:

1. `api.saveProgress()` должен отправлять `completedStitches`.
2. Workspace должен хранить `Set<string>` из `stitchId`, а не `Set<string>` из `"x,y"`.

## Обратная совместимость

Так как текущие канвы тестовые, можно не делать сложную миграцию.

Рекомендуемый путь:

1. Новые схемы создаются только в `schemaVersion: 2`.
2. Старые схемы можно удалить из MongoDB.
3. Если старую схему все же открыть, можно показать сообщение: `Схема создана в старом формате, создайте ее заново`.

## Порядок реализации

1. Добавить backend tests на новую модель `Pattern` и `Progress`.
2. Обновить domain entities и Mongoose schemas.
3. Обновить `IImageProcessingService` и `SharpImageProcessingService`.
4. Обновить `GeneratePatternUseCase`.
5. Обновить progress use cases/repository/controller.
6. Обновить frontend API types.
7. Обновить workspace renderer под `PatternCell`.
8. Запустить backend tests/build и frontend check/build.

## Риски

1. Размер данных в MongoDB вырастет.
   - Вместо одной строки на клетку будет объект с массивом стежков.
   - Для больших схем это может быть существенно.

2. DOM-rendering станет тяжелее.
   - Сейчас уже есть риск с большими схемами.
   - После SVG-рендера partial stitches риск выше.
   - В будущем лучше перейти на canvas/SVG overlay или виртуализацию.

3. Автоматическая генерация partial stitches может ухудшить качество.
   - Нужны отдельные эвристики и UX-настройка.
   - Не стоит добавлять ее одновременно с миграцией модели.

4. Прогресс несовместим со старым форматом.
   - Это приемлемо, если старые тестовые канвы удаляются.

## Рекомендуемый следующий инкремент

Сначала сделать только миграцию модели на `schemaVersion: 2`, но оставить визуальное поведение прежним: генератор создает только `full_cross`, workspace отображает клетки как сейчас, прогресс хранится по `stitchId`.

После этого можно отдельно добавлять:

1. half stitch;
2. quarter stitch;
3. three-quarter stitch;
4. backstitch layer;
5. french knot layer;
6. ручной редактор стежков.
