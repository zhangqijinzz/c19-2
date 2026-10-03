import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

describe('ExpoSketchViewModel', () => {
  it('initializes and updates the selected layout', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count + 1);
    expect(vm.state.selectedId).toContain('booth-');
  });

  it('updates analysis immediately after moving an element into an overlap', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('recovers the example if repository loading fails', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => { throw new Error('bad storage'); }), save: vi.fn(async () => {}) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.document.title).toContain('春日创意市集');
  });

  it('shows a save error without dropping the working document', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => createStarterDocument()), save: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.addElement('stage');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vm.state.document.elements.some((element) => element.kind === 'stage' && element.id.startsWith('stage-'))).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });

  it('ignores invalid dimensions instead of corrupting the working selection', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.document.elements[0].width;
    vm.resizeSelected(0, 0);
    expect(vm.state.document.elements[0].width).toBe(before);
  });

  it('recomputes entrance access routes and clearances after an element is dragged', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.analysis.access;
    expect(before.routes.length).toBeGreaterThan(0);
    const firstLength = before.routes[0].distance;
    // 把展位拖到入口与主舞台之间的直线路径上，直线被挡住、路线必须绕行
    vm.moveElement('booth-1', 5, 4.8);
    const after = vm.state.analysis.access;
    expect(after.routes[0].reachable).toBe(true);
    expect(after.routes[0].distance).not.toBe(firstLength);
    expect(after.routes[0].segments.length).toBeGreaterThan(0);
  });

  it('explains what is missing for the access assessment', async () => {
    const vm = new ExpoSketchViewModel(fakeRepository({
      version: 1,
      title: 'empty',
      field: { width: 20, height: 12 },
      elements: [{ id: 'only-booth', kind: 'booth', name: '孤展位', x: 8, y: 4, width: 4, height: 3, rotation: 0 }],
    }));
    await vm.initialize();
    expect(vm.state.analysis.access.routes).toEqual([]);
    expect(vm.state.analysis.access.missing).toContain('入口');
  });
});
