import { beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderApp = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  return container;
};

const clickTab = async (container: HTMLElement, label: string) => {
  const tab = Array.from(container.querySelectorAll('.mode-tabs button')).find((button) => button.textContent === label);
  expect(tab, `tab ${label}`).toBeTruthy();
  await act(async () => {
    tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('access assessment view', () => {
  it('compares entrance routes side by side with length and narrowest width', async () => {
    const container = await renderApp();
    await clickTab(container, '通行评估');
    expect(container.querySelector('.access-panel')).toBeTruthy();
    expect(container.textContent).toContain('主入口 → 分享舞台');
    expect(container.textContent).toContain('路线长度');
    expect(container.textContent).toContain('最窄净宽');
    expect(container.querySelector('.field-canvas svg.path-layer')).toBeTruthy();
  });

  it('explains what is missing when the field has no entrance or focus area', async () => {
    const container = await renderApp();
    const deleteButton = container.querySelector('[aria-label="删除元素"]');
    expect(deleteButton).toBeTruthy();
    // 依次删除全部元素，评估视图应说明缺入口和重点区域
    for (let i = 0; i < 12 && container.querySelector('[aria-label="删除元素"]'); i += 1) {
      await act(async () => {
        container.querySelector('[aria-label="删除元素"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    await clickTab(container, '通行评估');
    expect(container.textContent).toContain('缺少入口');
    expect(container.textContent).toContain('缺少重点区域');
  });
});
