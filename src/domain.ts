import type {
  AccessEvaluation,
  AccessRoute,
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  PathPreview,
  RoutePoint,
  OverlapIssue,
} from './types';

export const MIN_CHANNEL = 1.2;

// 通行评估寻路参数：网格分辨率、净宽采样步长、通道归属判定余量
const ROUTE_RESOLUTION = 0.25;
const CLEAR_WIDTH_STEP = 0.1;
const CHANNEL_EPSILON = 0.01;

export const ROUTE_COLORS = ['#ef795f', '#5b8def', '#5cc49b', '#a574e8', '#e8ae58', '#4fb3c8'];

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const createStarterDocument = (): LayoutDocument => ({
  version: 1,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
});

export const createElement = (kind: ElementKind, index: number, field: FieldSize): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  const offset = Math.min(index * 0.65, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset)),
    y: Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset)),
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement) => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const overlapX = intersectionSize(first.left, first.right, second.left, second.right);
      const overlapY = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      if (overlapX > 0 && overlapY > 0) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount: Number((overlapX * overlapY).toFixed(1)) });
      }
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: Number(overflow.toFixed(1)) }] : [];
  });

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ChannelRegion extends Box {
  width: number;
}

// 两个元素之间的通道：投影有重叠、间隔为正时成立，宽度即边缘到边缘的净距。
// findNarrowChannels 与通行评估的沿途净宽都从这里取数，保证两处口径一致。
const pairChannelBetween = (first: Box, second: Box): ChannelRegion | null => {
  const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
  const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
  if (verticalOverlap > 0) {
    if (first.right <= second.left && second.left - first.right > 0) {
      return { left: first.right, right: second.left, top: Math.max(first.top, second.top), bottom: Math.min(first.bottom, second.bottom), width: second.left - first.right };
    }
    if (second.right <= first.left && first.left - second.right > 0) {
      return { left: second.right, right: first.left, top: Math.max(first.top, second.top), bottom: Math.min(first.bottom, second.bottom), width: first.left - second.right };
    }
    return null;
  }
  if (horizontalOverlap > 0) {
    if (first.bottom <= second.top && second.top - first.bottom > 0) {
      return { top: first.bottom, bottom: second.top, left: Math.max(first.left, second.left), right: Math.min(first.right, second.right), width: second.top - first.bottom };
    }
    if (second.bottom <= first.top && first.top - second.bottom > 0) {
      return { top: second.bottom, bottom: first.top, left: Math.max(first.left, second.left), right: Math.min(first.right, second.right), width: first.top - second.bottom };
    }
  }
  return null;
};

// 元素与场地边界之间的通道，口径与元素间通道一致（边缘到边缘净距）
const wallChannelsBetween = (box: Box, field: FieldSize): ChannelRegion[] => {
  const channels: ChannelRegion[] = [];
  if (box.left > 0) channels.push({ left: 0, right: box.left, top: box.top, bottom: box.bottom, width: box.left });
  if (box.right < field.width) channels.push({ left: box.right, right: field.width, top: box.top, bottom: box.bottom, width: field.width - box.right });
  if (box.top > 0) channels.push({ left: box.left, right: box.right, top: 0, bottom: box.top, width: box.top });
  if (box.bottom < field.height) channels.push({ left: box.left, right: box.right, top: box.bottom, bottom: field.height, width: field.height - box.bottom });
  return channels;
};

export const findNarrowChannels = (elements: ExpoElement[]): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const channel = pairChannelBetween(first, getBoundingBox(elements[j]));
      if (channel && channel.width < MIN_CHANNEL) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(channel.width.toFixed(1)) });
    }
  }
  return issues;
};

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);

const resolveRouteTarget = (elements: ExpoElement[]): ExpoElement | null =>
  elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance') ?? null;

export const createPathPreview = (elements: ExpoElement[]): PathPreview | null => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = resolveRouteTarget(elements);
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  const start = { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 };
  const end = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
  const elbow = { x: end.x, y: start.y };
  return { points: [start, elbow, end], distance: Number((distance(start, elbow) + distance(elbow, end)).toFixed(1)), fromName: entrance.name, toName: target.name };
};

// 线段与轴对齐盒的相交检测（含贴边），返回进入盒子的参数 t，不相交返回 null
const segmentBoxEntry = (a: RoutePoint, b: RoutePoint, box: Box): number | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (a.x < box.left || a.x > box.right) return null;
  } else {
    let t1 = (box.left - a.x) / dx;
    let t2 = (box.right - a.x) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (a.y < box.top || a.y > box.bottom) return null;
  } else {
    let t1 = (box.top - a.y) / dy;
    let t2 = (box.bottom - a.y) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
};

// 网格 A*：把场地离散成格子，元素占地为障碍，求绕开障碍的最短可行路线
const findGridRoute = (field: FieldSize, obstacles: Box[], start: RoutePoint, goal: RoutePoint): RoutePoint[] | null => {
  const resolution = Math.max(ROUTE_RESOLUTION, Math.sqrt((field.width * field.height) / 1_000_000));
  const cols = Math.max(1, Math.ceil(field.width / resolution));
  const rows = Math.max(1, Math.ceil(field.height / resolution));
  const toIndex = (cx: number, cy: number) => cy * cols + cx;
  const toCell = (point: RoutePoint) => ({
    cx: Math.min(cols - 1, Math.max(0, Math.floor(point.x / resolution))),
    cy: Math.min(rows - 1, Math.max(0, Math.floor(point.y / resolution))),
  });
  const blocked = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const left = cx * resolution;
      const top = cy * resolution;
      if (obstacles.some((box) => left < box.right && left + resolution > box.left && top < box.bottom && top + resolution > box.top)) blocked[toIndex(cx, cy)] = 1;
    }
  }
  const startCell = toCell(start);
  const goalCell = toCell(goal);
  const startIndex = toIndex(startCell.cx, startCell.cy);
  const goalIndex = toIndex(goalCell.cx, goalCell.cy);
  blocked[startIndex] = 0;
  blocked[goalIndex] = 0;

  const gScore = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const heuristic = (cx: number, cy: number) => {
    const dx = Math.abs(cx - goalCell.cx);
    const dy = Math.abs(cy - goalCell.cy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap: Array<{ f: number; i: number }> = [];
  const push = (item: { f: number; i: number }) => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].f <= heap[index].f) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };
  const pop = (): { f: number; i: number } => {
    const top = heap[0];
    const last = heap.pop() as { f: number; i: number };
    if (heap.length > 0) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left;
        if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
        index = smallest;
      }
    }
    return top;
  };

  gScore[startIndex] = 0;
  push({ f: heuristic(startCell.cx, startCell.cy), i: startIndex });
  const steps: Array<[number, number, number]> = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length > 0) {
    const { i } = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goalIndex) break;
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    for (const [dx, dy, cost] of steps) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = toIndex(nx, ny);
      if (blocked[ni] || closed[ni]) continue;
      if (dx !== 0 && dy !== 0 && (blocked[toIndex(cx + dx, cy)] || blocked[toIndex(cx, cy + dy)])) continue;
      const tentative = gScore[i] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        cameFrom[ni] = i;
        push({ f: tentative + heuristic(nx, ny), i: ni });
      }
    }
  }
  if (goalIndex !== startIndex && cameFrom[goalIndex] === -1) return null;
  const cells: number[] = [];
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) cells.push(i);
  cells.reverse();
  const points = cells.map((i) => ({ x: (i % cols + 0.5) * resolution, y: (Math.floor(i / cols) + 0.5) * resolution }));
  points[0] = start;
  points[points.length - 1] = goal;
  return points;
};

// 视线拉直：在不相交任何障碍的前提下跳过中间点，让路线更贴近真实走法
const smoothRoute = (points: RoutePoint[], obstacles: Box[]): RoutePoint[] => {
  if (points.length <= 2) return points;
  const smoothed: RoutePoint[] = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (next > anchor + 1 && obstacles.some((box) => segmentBoxEntry(points[anchor], points[next], box) !== null)) next -= 1;
    smoothed.push(points[next]);
    anchor = next;
  }
  return smoothed;
};

// 路线在到达重点区域边缘时收尾，不画进区域内部
const trimRouteAtBox = (points: RoutePoint[], box: Box): RoutePoint[] => {
  const inside = (point: RoutePoint) => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
  for (let i = 0; i < points.length; i += 1) {
    if (!inside(points[i])) continue;
    if (i === 0) return [points[0]];
    const entry = segmentBoxEntry(points[i - 1], points[i], box);
    if (entry === null) return points.slice(0, i + 1);
    const a = points[i - 1];
    const b = points[i];
    return [...points.slice(0, i), { x: a.x + (b.x - a.x) * entry, y: a.y + (b.y - a.y) * entry }];
  }
  return points;
};

const routeLength = (points: RoutePoint[]) => points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);

// 沿路线采样，取途经通道（元素间 + 元素与边界间）的最小净宽，并圈出偏窄路段
const measureClearWidth = (points: RoutePoint[], obstacles: Box[], field: FieldSize): { minClearWidth: number | null; narrowSpans: RoutePoint[][] } => {
  const channels: ChannelRegion[] = [];
  for (let i = 0; i < obstacles.length; i += 1) {
    channels.push(...wallChannelsBetween(obstacles[i], field));
    for (let j = i + 1; j < obstacles.length; j += 1) {
      const channel = pairChannelBetween(obstacles[i], obstacles[j]);
      if (channel) channels.push(channel);
    }
  }
  let min = Number.POSITIVE_INFINITY;
  const narrowSpans: RoutePoint[][] = [];
  let currentSpan: RoutePoint[] | null = null;
  const closeSpan = () => {
    if (!currentSpan) return;
    if (currentSpan.length === 1) currentSpan.push(currentSpan[0]);
    narrowSpans.push(currentSpan);
    currentSpan = null;
  };
  const visit = (point: RoutePoint) => {
    let width = Number.POSITIVE_INFINITY;
    for (const channel of channels) {
      if (point.x > channel.left + CHANNEL_EPSILON && point.x < channel.right - CHANNEL_EPSILON && point.y > channel.top + CHANNEL_EPSILON && point.y < channel.bottom - CHANNEL_EPSILON && channel.width < width) width = channel.width;
    }
    if (width < min) min = width;
    if (width < MIN_CHANNEL) {
      if (currentSpan) currentSpan.push(point);
      else currentSpan = [point];
    } else {
      closeSpan();
    }
  };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const steps = Math.max(1, Math.ceil(distance(a, b) / CLEAR_WIDTH_STEP));
    for (let s = 0; s <= steps; s += 1) visit({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  closeSpan();
  return { minClearWidth: min === Number.POSITIVE_INFINITY ? null : Number(min.toFixed(1)), narrowSpans };
};

const centerOf = (box: Box): RoutePoint => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

// 通行评估：每个入口分别作为起点，绕开所有元素到达重点区域，
// 输出路线、长度与沿途最窄净宽；缺入口或缺重点区域时如实标注。
export const evaluateAccess = (field: FieldSize, elements: ExpoElement[]): AccessEvaluation => {
  const entrances = elements.filter((element) => element.kind === 'entrance');
  const target = resolveRouteTarget(elements);
  const missingEntrance = entrances.length === 0;
  const missingTarget = target === null;
  if (missingEntrance || !target) return { routes: [], missingEntrance, missingTarget };
  const targetBox = getBoundingBox(target);
  const routes: AccessRoute[] = entrances.map((entrance) => {
    const base = { entranceId: entrance.id, entranceName: entrance.name, targetId: target.id, targetName: target.name };
    const obstacles = elements.filter((element) => element.id !== entrance.id && element.id !== target.id).map((element) => getBoundingBox(element));
    const raw = findGridRoute(field, obstacles, centerOf(getBoundingBox(entrance)), centerOf(targetBox));
    if (!raw) return { ...base, reachable: false, points: [], distance: null, minClearWidth: null, narrowSpans: [] };
    const route = trimRouteAtBox(smoothRoute(raw, obstacles), targetBox);
    const { minClearWidth, narrowSpans } = measureClearWidth(route, obstacles, field);
    return { ...base, reachable: true, points: route, distance: Number(routeLength(route).toFixed(1)), minClearWidth, narrowSpans };
  });
  return { routes, missingEntrance, missingTarget };
};

export const analyzeLayout = (document: LayoutDocument): Analysis => ({
  overlaps: findOverlaps(document.elements),
  bounds: findBoundsIssues(document.field, document.elements),
  channels: findNarrowChannels(document.elements),
  path: createPathPreview(document.elements),
  access: evaluateAccess(document.field, document.elements),
});

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
