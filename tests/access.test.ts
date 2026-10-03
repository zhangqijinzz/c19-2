import { describe, expect, it } from 'vitest';
import { evaluateAccess, findNarrowChannels, MIN_CHANNEL } from '../src/domain';
import type { ExpoElement, FieldSize, RoutePoint } from '../src/types';

const element = (id: string, kind: ExpoElement['kind'], x: number, y: number, width: number, height: number): ExpoElement => ({ id, kind, name: id, x, y, width, height, rotation: 0 });

const field: FieldSize = { width: 20, height: 10 };

// 沿折线按 0.05m 采样，供断言路线不穿过任何元素
const sampleRoute = (points: RoutePoint[]): RoutePoint[] => {
  const samples: RoutePoint[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
    for (let s = 0; s <= steps; s += 1) samples.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return samples;
};

const insideBox = (point: RoutePoint, box: { left: number; top: number; right: number; bottom: number }) =>
  point.x > box.left + 1e-9 && point.x < box.right - 1e-9 && point.y > box.top + 1e-9 && point.y < box.bottom - 1e-9;

// 两个展位贴满上下边界，中间只留一道缝，路线必须穿缝而过
const gapLayout = (gapTop: number, gapBottom: number): ExpoElement[] => [
  element('entry', 'entrance', 0, 1.25, 2, 1.5),
  element('stage', 'stage', 16, 6.5, 3, 3),
  element('booth-a', 'booth', 8, 0, 4, gapTop),
  element('booth-b', 'booth', 8, gapBottom, 4, 10 - gapBottom),
];

describe('access evaluation', () => {
  it('routes around elements instead of crossing them', () => {
    const elements = gapLayout(5, 6);
    const [route] = evaluateAccess(field, elements).routes;
    expect(route.reachable).toBe(true);
    expect(route.points.length).toBeGreaterThan(2);
    const boxes = [element('booth-a', 'booth', 8, 0, 4, 5), element('booth-b', 'booth', 8, 6, 4, 4)].map((booth) => ({ left: booth.x, top: booth.y, right: booth.x + booth.width, bottom: booth.y + booth.height }));
    const samples = sampleRoute(route.points);
    expect(samples.some((point) => boxes.some((box) => insideBox(point, box)))).toBe(false);
    expect(samples.some((point) => point.x > 8 && point.x < 12 && point.y > 5 && point.y < 6)).toBe(true);
  });

  it('reports the same narrow width as the channel check when squeezing through a gap', () => {
    const elements = gapLayout(5, 6);
    expect(findNarrowChannels(elements)).toEqual([{ firstId: 'booth-a', secondId: 'booth-b', gap: 1 }]);
    const [route] = evaluateAccess(field, elements).routes;
    expect(route.minClearWidth).toBe(1);
    expect(route.minClearWidth!).toBeLessThan(MIN_CHANNEL);
    expect(route.narrowSpans.length).toBeGreaterThan(0);
    for (const point of route.narrowSpans.flat()) {
      expect(point.x).toBeGreaterThan(7.9);
      expect(point.x).toBeLessThan(12.1);
      expect(point.y).toBeGreaterThan(4.9);
      expect(point.y).toBeLessThan(6.1);
    }
  });

  it('stays clear when the only gap meets the minimum channel width', () => {
    const elements = gapLayout(4, 5.5);
    expect(findNarrowChannels(elements)).toEqual([]);
    const [route] = evaluateAccess(field, elements).routes;
    expect(route.reachable).toBe(true);
    expect(route.minClearWidth).toBe(1.5);
    expect(route.narrowSpans).toEqual([]);
  });

  it('evaluates every entrance separately so plans can be compared', () => {
    const elements = [...gapLayout(5, 6), element('entry-2', 'entrance', 0, 7.75, 2, 1.5)];
    const evaluation = evaluateAccess(field, elements);
    expect(evaluation.routes).toHaveLength(2);
    expect(evaluation.routes.map((route) => route.entranceId)).toEqual(['entry', 'entry-2']);
    for (const route of evaluation.routes) {
      expect(route.reachable).toBe(true);
      expect(route.targetName).toBe('stage');
      expect(route.minClearWidth).toBe(1);
    }
  });

  it('marks the route unreachable when elements seal off the focus area', () => {
    const elements = [
      element('entry', 'entrance', 1, 5, 2, 1.5),
      element('stage', 'stage', 10, 5, 2, 2),
      element('wall-top', 'booth', 8, 3, 6, 1.5),
      element('wall-bottom', 'booth', 8, 7.5, 6, 1.5),
      element('wall-left', 'booth', 8, 3, 1.5, 6),
      element('wall-right', 'booth', 12.5, 3, 1.5, 6),
    ];
    const [route] = evaluateAccess({ width: 20, height: 12 }, elements).routes;
    expect(route.reachable).toBe(false);
    expect(route.distance).toBeNull();
    expect(route.minClearWidth).toBeNull();
    expect(route.narrowSpans).toEqual([]);
  });

  it('explains what is missing instead of producing empty routes', () => {
    const noEntrance = evaluateAccess(field, [element('stage', 'stage', 16, 6.5, 3, 3)]);
    expect(noEntrance.missingEntrance).toBe(true);
    expect(noEntrance.missingTarget).toBe(false);
    expect(noEntrance.routes).toEqual([]);
    const noTarget = evaluateAccess(field, [element('entry', 'entrance', 0, 1.25, 2, 1.5)]);
    expect(noTarget.missingEntrance).toBe(false);
    expect(noTarget.missingTarget).toBe(true);
    expect(noTarget.routes).toEqual([]);
    const empty = evaluateAccess(field, []);
    expect(empty.missingEntrance).toBe(true);
    expect(empty.missingTarget).toBe(true);
  });
});
