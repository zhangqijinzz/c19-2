import { useRef, useState } from 'react';
import { ELEMENT_SPECS, MIN_CHANNEL } from '../../domain';
import type { EntranceRoute, LayoutMode, PathPreview, RenderElement } from '../../types';

interface FieldCanvasProps {
  field: { width: number; height: number };
  elements: RenderElement[];
  selectedId: string | null;
  mode: LayoutMode;
  overlaps: Array<{ firstId: string; secondId: string }>;
  bounds: Array<{ elementId: string }>;
  channels: Array<{ firstId: string; secondId: string }>;
  path: PathPreview | null;
  routes: EntranceRoute[];
  activeEntranceId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSelectEntrance: (id: string) => void;
}

const routeColor = (index: number) => ['#ef795f', '#4f8fd6', '#7b61d6', '#3aa98a'][index % 4];

export function FieldCanvas({ field, elements, selectedId, mode, overlaps, bounds, channels, path, routes, activeEntranceId, onSelect, onMove, onSelectEntrance }: FieldCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const issueIds = new Set(overlaps.flatMap((item) => [item.firstId, item.secondId]));
  const channelIds = new Set(channels.flatMap((item) => [item.firstId, item.secondId]));
  const boundsIds = new Set(bounds.map((item) => item.elementId));
  const canvasWidth = 100 / Math.max(1, field.width / (field.height * 1.35));

  const pointFromEvent = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left) * field.width / box.width, y: (event.clientY - box.top) * field.height / box.height };
  };

  return <div className="canvas-wrap">
    <div className="canvas-ruler top-ruler"><span>0 m</span><span>{Math.round(field.width / 2)} m</span><span>{field.width} m</span></div>
    <div className="canvas-ruler side-ruler"><span>0</span><span>{Math.round(field.height / 2)} m</span><span>{field.height} m</span></div>
    <div className={`field-canvas mode-${mode}`} ref={canvasRef} style={{ width: `${Math.min(100, canvasWidth)}%`, aspectRatio: `${field.width} / ${field.height}` }}>
      <div className="grid-overlay" />
      <div className="field-label"><span>EXPO HALL A</span><strong>{field.width} × {field.height} m</strong></div>
      {path && mode === 'path' ? <svg className="path-layer" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none"><polyline points={path.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#ef795f" strokeWidth="0.3" strokeDasharray="0.75 0.55" /><circle cx={path.points[0].x} cy={path.points[0].y} r="0.45" fill="#ef795f" /><circle cx={path.points[path.points.length - 1].x} cy={path.points[path.points.length - 1].y} r="0.45" fill="#ef795f" /></svg> : null}
      {mode === 'access' && routes.length > 0 ? <svg className="path-layer" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none">
        {routes.map((route, routeIndex) => {
          const dimmed = activeEntranceId !== null && route.entranceId !== activeEntranceId;
          const stroke = routeColor(routeIndex);
          return <g key={route.entranceId} className={dimmed ? 'route-dimmed' : ''} style={{ cursor: 'pointer' }} onClick={() => onSelectEntrance(route.entranceId)}>
            {route.reachable ? route.segments.map((segment, segmentIndex) => {
              const midX = (segment.from.x + segment.to.x) / 2;
              const midY = (segment.from.y + segment.to.y) / 2;
              return <g key={segmentIndex}>
                <line x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y}
                  stroke={segment.narrow ? '#e5483b' : stroke}
                  strokeWidth={segment.narrow ? 0.42 : 0.28}
                  strokeDasharray={segment.narrow ? 'none' : '0.75 0.55'}
                  strokeLinecap="round" />
                {segment.narrow ? <g className="clearance-tag"><rect x={midX - 1.05} y={midY - 0.62} width="2.1" height="1.05" rx="0.25" fill="#e5483b" /><text x={midX} y={midY + 0.12} textAnchor="middle" fontSize="0.72" fill="#fff" fontWeight="700">{(segment.clearance ?? 0).toFixed(1)}m</text></g> : null}
              </g>;
            }) : <text x={route.start.x} y={route.start.y - 1} textAnchor="middle" fontSize="0.8" fill="#e5483b">无法绕行到达</text>}
            <circle cx={route.start.x} cy={route.start.y} r="0.5" fill={stroke} stroke="#fff" strokeWidth="0.14" />
            <circle cx={route.end.x} cy={route.end.y} r="0.45" fill={stroke} />
          </g>;
        })}
      </svg> : null}
      {elements.map((element) => {
        const spec = ELEMENT_SPECS[element.kind];
        const isActiveEntrance = mode === 'access' && element.kind === 'entrance' && element.id === activeEntranceId;
        const classes = ['canvas-element', selectedId === element.id ? 'is-selected' : '', issueIds.has(element.id) && mode !== 'edit' ? 'is-overlap' : '', channelIds.has(element.id) && mode !== 'edit' ? 'is-channel' : '', boundsIds.has(element.id) ? 'is-out' : '', isActiveEntrance ? 'is-active-entrance' : ''].filter(Boolean).join(' ');
        const routeOrder = mode === 'access' && element.kind === 'entrance' ? routes.findIndex((route) => route.entranceId === element.id) : -1;
        return <button key={element.id} type="button" className={classes} style={{ left: `${element.x / field.width * 100}%`, top: `${element.y / field.height * 100}%`, width: `${element.displayWidth / field.width * 100}%`, height: `${element.displayHeight / field.height * 100}%`, background: spec.color, transform: `rotate(${element.rotation}deg)`, outlineColor: routeOrder >= 0 ? routeColor(routeOrder) : undefined }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event); setDrag({ id: element.id, dx: point.x - element.x, dy: point.y - element.y }); onSelect(element.id); if (element.kind === 'entrance' && mode === 'access') onSelectEntrance(element.id); }} onPointerMove={(event) => { if (!drag || drag.id !== element.id) return; const point = pointFromEvent(event); onMove(element.id, point.x - drag.dx, point.y - drag.dy); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          <span className="element-icon">{spec.icon}</span><span className="element-name">{element.name}</span><small>{element.displayWidth.toFixed(1)} × {element.displayHeight.toFixed(1)} m</small>
          {issueIds.has(element.id) && mode !== 'edit' ? <span className="issue-dot">!</span> : null}
          {routeOrder >= 0 ? <span className="entrance-route-badge" style={{ background: routeColor(routeOrder) }}>{routeOrder + 1}</span> : null}
        </button>;
      })}
      <div className="axis-hint">{mode === 'access' ? '点击入口或路线切换方案 · 红色段净宽不足 ' + MIN_CHANNEL.toFixed(1) + ' m' : '拖动元素 · 点击选中'}</div>
    </div>
    <div className="canvas-legend">{mode === 'access'
      ? <><span><i className="legend-line" />可行路线</span><span><i className="legend-line legend-line-red" />净宽不足 {MIN_CHANNEL.toFixed(1)} m</span><span><i className="legend-dot coral" />入口 / 终点</span></>
      : <><span><i className="legend-dot green" />可通行</span><span><i className="legend-dot coral" />需关注</span><span><i className="legend-line" />访问路径</span></>}</div>
  </div>;
}
