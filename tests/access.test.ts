import { describe, expect, it } from 'vitest';
import { analyzeLayout, assessAccess, findNarrowChannels, MIN_CHANNEL } from '../src/domain';
import type { ExpoElement, FieldSize, LayoutDocument } from '../src/types';

const element = (id: string, kind: ExpoElement['kind'], x: number, y: number, width: number, height: number): ExpoElement =>
  ({ id, kind, name: id, x, y, width, height, rotation: 0 });

const doc = (field: FieldSize, elements: ExpoElement[]): LayoutDocument => ({ version: 1, title: 'x', field, elements });

const pointInBox = (p: { x: number; y: number }, e: ExpoElement, slack = 0.01) =>
  p.x > e.x + slack && p.x < e.x + e.width - slack && p.y > e.y + slack && p.y < e.y + e.height - slack;

const segmentSamples = (from: { x: number; y: number }, to: { x: number; y: number }, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });

describe('access assessment', () => {
  it('reports what is missing when entrances or focus areas are absent', () => {
    expect(assessAccess({ width: 20, height: 12 }, []).missing).toContain('入口');
    const onlyEntrance = [element('entry', 'entrance', 0.5, 5.5, 2, 1)];
    expect(assessAccess({ width: 20, height: 12 }, onlyEntrance).missing).toContain('重点区域（主舞台 / 座席 / 展位）');
  });

  it('builds one comparable route per entrance with length and minimum clearance', () => {
    const field = { width: 30, height: 20 };
    const elements = [
      element('entry-a', 'entrance', 0.5, 2, 2, 1.5),
      element('entry-b', 'entrance', 0.5, 16.5, 2, 1.5),
      element('stage', 'stage', 21, 8, 8, 4),
      element('booth', 'booth', 12, 8, 4, 3),
    ];
    const assessment = assessAccess(field, elements);
    expect(assessment.missing).toEqual([]);
    expect(assessment.routes).toHaveLength(2);
    expect(assessment.routes.map((route) => route.entranceId)).toEqual(['entry-a', 'entry-b']);
    assessment.routes.forEach((route) => {
      expect(route.reachable).toBe(true);
      expect(route.distance).toBeGreaterThan(0);
      expect(route.targetName).toBe('stage');
      expect(route.segments.length).toBeGreaterThan(0);
    });
    const direct = Math.hypot(25 - 1.5, 10 - 2.75);
    expect(assessment.routes[0].distance).toBeGreaterThanOrEqual(direct - 0.5);
  });

  it('routes never cut through any element and recompute after an element moves', () => {
    const field = { width: 20, height: 12 };
    const elements = [
      element('entry', 'entrance', 0.5, 5.5, 2, 1),
      element('stage', 'stage', 15, 4.5, 4, 3),
      element('booth-1', 'booth', 8, 0, 4, 5),
      element('booth-2', 'booth', 8, 6, 4, 6),
    ];
    const first = assessAccess(field, elements).routes[0];
    expect(first.reachable).toBe(true);
    const obstacles = elements.filter((item) => item.kind === 'booth');
    first.segments.forEach((segment) => {
      segmentSamples(segment.from, segment.to).forEach((sample) => {
        obstacles.forEach((obstacle) => expect(pointInBox(sample, obstacle)).toBe(false));
      });
    });

    const moved = elements.map((item) => (item.id === 'booth-2' ? { ...item, y: 5.0 } : item));
    const second = assessAccess(field, moved).routes[0];
    expect(second.distance).not.toBe(first.distance);
  });

  it('flags a route segment narrow exactly when the narrow-channel check flags the same pair', () => {
    const field = { width: 20, height: 12 };
    const elements = [
      element('entry', 'entrance', 0.5, 5.5, 2, 1),
      element('stage', 'stage', 14, 4.5, 4, 3),
      // 两个展位上下贯通到场地边缘，只在 y 5.2–6.3 之间留出一条 1.1 m 的夹道
      element('booth-1', 'booth', 7, 0, 3, 5.2),
      element('booth-2', 'booth', 7, 6.3, 3, 5.7),
    ];
    const gap = 6.3 - 5.2;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(MIN_CHANNEL);

    const channelPairs = new Set(findNarrowChannels(elements).map((issue) => [issue.firstId, issue.secondId].sort().join('|')));
    expect(channelPairs.size).toBe(1);

    const route = assessAccess(field, elements).routes[0];
    expect(route.reachable).toBe(true);
    expect(route.minClearance).not.toBeNull();
    expect(route.minClearance as number).toBeLessThan(MIN_CHANNEL);
    const narrowSegments = route.segments.filter((segment) => segment.narrow);
    expect(narrowSegments.length).toBeGreaterThan(0);
    narrowSegments.forEach((segment) => {
      expect(segment.channel).not.toBeNull();
      const key = [segment.channel!.firstId, segment.channel!.secondId].sort().join('|');
      expect(channelPairs.has(key)).toBe(true);
    });
    route.segments.filter((segment) => !segment.narrow).forEach((segment) => {
      if (segment.channel) expect(segment.channel.gap).toBeGreaterThanOrEqual(MIN_CHANNEL - 0.005);
    });
  });

  it('exposes the assessment on analysis and keeps a route clear when every channel is wide enough', () => {
    const wide = analyzeLayout(doc({ width: 30, height: 20 }, [
      element('entry', 'entrance', 0.5, 9, 2, 1.5),
      element('stage', 'stage', 22, 8, 7, 4),
      element('booth-1', 'booth', 13, 0, 4, 8),
      element('booth-2', 'booth', 13, 12, 4, 8),
    ]));
    expect(wide.channels).toEqual([]);
    const route = wide.access.routes[0];
    expect(route.segments.some((segment) => segment.narrow)).toBe(false);
    if (route.minClearance !== null) expect(route.minClearance).toBeGreaterThanOrEqual(MIN_CHANNEL);
  });
});
