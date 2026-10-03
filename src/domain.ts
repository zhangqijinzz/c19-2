import type {
  AccessAssessment,
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  EntranceRoute,
  ExpoElement,
  FieldSize,
  LayoutDocument,
  PathPreview,
  Point,
  RouteSegment,
  OverlapIssue,
} from './types';

export const MIN_CHANNEL = 1.2;

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

interface ElementBox {
  element: ExpoElement;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const toBox = (element: ExpoElement): ElementBox => {
  const box = getBoundingBox(element);
  return { element, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
};

/**
 * 两个元素之间的通道净宽（米）：投影在一个轴上重叠时，取另一轴上的间距；
 * 任何方向都不夹出通道（重叠、对角错开）时返回 null。
 * 窄通道判断与通行评估共用此口径，保证两处结论一致。
 */
export const pairChannelGap = (first: ExpoElement, second: ExpoElement): number | null => {
  const a = toBox(first);
  const b = toBox(second);
  const verticalOverlap = intersectionSize(a.top, a.bottom, b.top, b.bottom);
  const horizontalOverlap = intersectionSize(a.left, a.right, b.left, b.right);
  // 两轴投影都重叠即为元素重叠，不属于"夹道"，不能给出净宽结论
  if (verticalOverlap > 0 && horizontalOverlap > 0) return null;
  const horizontalGap = a.right <= b.left ? b.left - a.right : b.right <= a.left ? a.left - b.right : 0;
  const verticalGap = a.bottom <= b.top ? b.top - a.bottom : b.bottom <= a.top ? a.top - b.bottom : 0;
  const gap = verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
  return gap > 0 ? gap : null;
};

export const findNarrowChannels = (elements: ExpoElement[]): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const gap = pairChannelGap(elements[i], elements[j]);
      if (gap !== null && gap < MIN_CHANNEL) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
      }
    }
  }
  return issues;
};

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);

export const createPathPreview = (elements: ExpoElement[]): PathPreview | null => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  const start = { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 };
  const end = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
  const elbow = { x: end.x, y: start.y };
  return { points: [start, elbow, end], distance: Number((distance(start, elbow) + distance(elbow, end)).toFixed(1)), fromName: entrance.name, toName: target.name };
};

const EPS = 1e-6;
const POINT_EPS = 1e-4;

const boxesOverlap = (a: ElementBox, b: ElementBox) =>
  a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;

/** 视线是否穿过障碍（零间距贴边擦过按可通行处理，与净宽口径一致） */
const segmentIsBlocked = (p: Point, q: Point, obstacles: ElementBox[]): boolean =>
  obstacles.some((box) => {
    if (boxesOverlap({ element: box.element, left: Math.min(p.x, q.x) - EPS, right: Math.max(p.x, q.x) + EPS, top: Math.min(p.y, q.y) - EPS, bottom: Math.max(p.y, q.y) + EPS }, box) === false) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    if (Math.abs(q.x - p.x) < EPS) {
      if (p.x <= box.left + EPS || p.x >= box.right - EPS) return false;
    } else {
      const t1 = (box.left - p.x) / (q.x - p.x);
      const t2 = (box.right - p.x) / (q.x - p.x);
      minT = Math.min(t1, t2);
      maxT = Math.max(t1, t2);
    }
    if (Math.abs(q.y - p.y) < EPS) {
      if (p.y <= box.top + EPS || p.y >= box.bottom - EPS) return false;
    } else {
      const t1 = (box.top - p.y) / (q.y - p.y);
      const t2 = (box.bottom - p.y) / (q.y - p.y);
      minT = Math.max(minT, Math.min(t1, t2));
      maxT = Math.min(maxT, Math.max(t1, t2));
    }
    return maxT > EPS && minT < 1 - EPS && maxT > minT + EPS;
  });

/** 线段是否从两元素夹出的通道内部穿过（沿通道方向行进也算），按参数区间与夹道矩形求交 */
const segmentPassesBetween = (p: Point, q: Point, a: ElementBox, b: ElementBox): boolean => {
  let band: { lowX: number; highX: number; lowY: number; highY: number } | null = null;
  if (a.right <= b.left + EPS && intersectionSize(a.top, a.bottom, b.top, b.bottom) > 0) {
    band = { lowX: a.right, highX: b.left, lowY: Math.max(a.top, b.top), highY: Math.min(a.bottom, b.bottom) };
  } else if (b.right <= a.left + EPS && intersectionSize(a.top, a.bottom, b.top, b.bottom) > 0) {
    band = { lowX: b.right, highX: a.left, lowY: Math.max(a.top, b.top), highY: Math.min(a.bottom, b.bottom) };
  } else if (a.bottom <= b.top + EPS && intersectionSize(a.left, a.right, b.left, b.right) > 0) {
    band = { lowX: Math.max(a.left, b.left), highX: Math.min(a.right, b.right), lowY: a.bottom, highY: b.top };
  } else if (b.bottom <= a.top + EPS && intersectionSize(a.left, a.right, b.left, b.right) > 0) {
    band = { lowX: Math.max(a.left, b.left), highX: Math.min(a.right, b.right), lowY: b.bottom, highY: a.top };
  }
  if (!band) return false;

  let enter = 0;
  let leave = 1;
  const clip = (low: number, high: number, coordinate: 'x' | 'y') => {
    const start = coordinate === 'x' ? p.x : p.y;
    const end = coordinate === 'x' ? q.x : q.y;
    const delta = end - start;
    if (Math.abs(delta) < EPS) return start > low + EPS && start < high - EPS;
    const t1 = (low - start) / delta;
    const t2 = (high - start) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    leave = Math.min(leave, Math.max(t1, t2));
    return leave > enter + EPS;
  };
  return clip(band.lowX, band.highX, 'x') && clip(band.lowY, band.highY, 'y');
};

/** 一条视线沿途中所夹通道的最小净宽，复用 pairChannelGap 的同一口径 */
const segmentMinClearance = (p: Point, q: Point, boxes: ElementBox[]): { gap: number; firstId: string; secondId: string } | null => {
  let tightest: { gap: number; firstId: string; secondId: string } | null = null;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (!segmentPassesBetween(p, q, boxes[i], boxes[j])) continue;
      const gap = pairChannelGap(boxes[i].element, boxes[j].element);
      if (gap !== null && (tightest === null || gap < tightest.gap)) {
        tightest = { gap, firstId: boxes[i].element.id, secondId: boxes[j].element.id };
      }
    }
  }
  return tightest;
};

const buildRoute = (start: Point, end: Point, obstacles: ElementBox[], channelBoxes: ElementBox[], targetName: string, entrance: ExpoElement, field: FieldSize): EntranceRoute => {
  // 可视图节点：起点、终点，以及每个障碍矩形在四周保留 MIN_CHANNEL 间距的绕行角点
  const inset = MIN_CHANNEL;
  const nodes: Point[] = [start, end];
  obstacles.forEach((box) => {
    const xs = [Math.max(0, box.left - inset), Math.min(field.width, box.right + inset)];
    const ys = [Math.max(0, box.top - inset), Math.min(field.height, box.bottom + inset)];
    xs.forEach((x) => ys.forEach((y) => nodes.push({ x, y })));
  });
  const unique = nodes.filter((point, index) => nodes.findIndex((other) => Math.abs(other.x - point.x) < POINT_EPS && Math.abs(other.y - point.y) < POINT_EPS) === index);
  const startIndex = 0;
  const endIndex = 1;

  const edges: Array<{ from: number; to: number; length: number }> = [];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (!segmentIsBlocked(unique[i], unique[j], obstacles)) {
        edges.push({ from: i, to: j, length: distance(unique[i], unique[j]) });
      }
    }
  }

  // Dijkstra（边长为欧氏距离，得到绕开所有障碍的最短折线）
  const size = unique.length;
  const dist = new Array<number>(size).fill(Infinity);
  const previous = new Array<number>(size).fill(-1);
  const visited = new Array<boolean>(size).fill(false);
  dist[startIndex] = 0;
  for (let iteration = 0; iteration < size; iteration += 1) {
    let current = -1;
    for (let i = 0; i < size; i += 1) if (!visited[i] && (current === -1 || dist[i] < dist[current])) current = i;
    if (current === -1 || current === endIndex) break;
    visited[current] = true;
    edges.forEach((edge) => {
      const neighbor = edge.from === current ? edge.to : edge.to === current ? edge.from : -1;
      if (neighbor === -1 || visited[neighbor]) return;
      const candidate = dist[current] + edge.length;
      if (candidate < dist[neighbor] - EPS) {
        dist[neighbor] = candidate;
        previous[neighbor] = current;
      }
    });
  }

  if (!Number.isFinite(dist[endIndex])) {
    return { entranceId: entrance.id, entranceName: entrance.name, targetName, start, end, segments: [], distance: 0, minClearance: null, reachable: false };
  }

  const path: Point[] = [];
  for (let node = endIndex; node !== -1; node = previous[node]) path.push(unique[node]);
  path.reverse();

  let total = 0;
  let minClearance: number | null = null;
  const segments: RouteSegment[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const tight = segmentMinClearance(path[i], path[i + 1], channelBoxes);
    // 偏窄判定直接用原始净宽，与 findNarrowChannels 的 gap < MIN_CHANNEL 完全同口径
    const narrow = tight !== null && tight.gap < MIN_CHANNEL;
    const clearance = tight ? Number(tight.gap.toFixed(2)) : null;
    const length = distance(path[i], path[i + 1]);
    total += length;
    if (clearance !== null && (minClearance === null || clearance < minClearance)) minClearance = clearance;
    segments.push({
      from: path[i],
      to: path[i + 1],
      channel: tight ? { firstId: tight.firstId, secondId: tight.secondId, gap: clearance as number } : null,
      clearance,
      narrow,
    });
  }

  return {
    entranceId: entrance.id,
    entranceName: entrance.name,
    targetName,
    start,
    end,
    segments,
    distance: Number(total.toFixed(1)),
    minClearance: minClearance === null ? null : Number(minClearance.toFixed(2)),
    reachable: true,
  };
};

export const assessAccess = (field: FieldSize, elements: ExpoElement[]): AccessAssessment => {
  const entrances = elements.filter((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage')
    ?? elements.find((element) => element.kind === 'seating')
    ?? elements.find((element) => element.kind === 'booth');

  const missing: string[] = [];
  if (entrances.length === 0) missing.push('入口');
  if (!target) missing.push('重点区域（主舞台 / 座席 / 展位）');
  if (missing.length > 0 || !target) return { routes: [], missing };

  const focusTarget = target;

  const targetBox = toBox(focusTarget);
  const end = { x: Number(((targetBox.left + targetBox.right) / 2).toFixed(2)), y: Number(((targetBox.top + targetBox.bottom) / 2).toFixed(2)) };

  return {
    missing: [],
    routes: entrances.map((entrance) => {
      const startBox = toBox(entrance);
      const start = { x: Number(((startBox.left + startBox.right) / 2).toFixed(2)), y: Number(((startBox.top + startBox.bottom) / 2).toFixed(2)) };
      // 起点/终点所在的元素不作为障碍，其余元素（含其他入口）一律绕开
      const obstacles = elements
        .filter((element) => element.id !== entrance.id && element.id !== focusTarget.id)
        .map(toBox)
        .filter((box) => box.left < field.width - EPS && box.right > EPS && box.top < field.height - EPS && box.bottom > EPS);
      // 净宽沿全线度量：连起终点自身也参与夹道判断
      const channelBoxes = elements.map(toBox);
      return buildRoute(start, end, obstacles, channelBoxes, focusTarget.name, entrance, field);
    }),
  };
};

export const analyzeLayout = (document: LayoutDocument): Analysis => ({
  overlaps: findOverlaps(document.elements),
  bounds: findBoundsIssues(document.field, document.elements),
  channels: findNarrowChannels(document.elements),
  path: createPathPreview(document.elements),
  access: assessAccess(document.field, document.elements),
});

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
