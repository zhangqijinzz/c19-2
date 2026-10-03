import { MIN_CHANNEL } from '../../domain';
import type { AccessAssessment } from '../../types';

interface AccessAssessmentPanelProps {
  access: AccessAssessment;
  activeEntranceId: string | null;
  onSelectEntrance: (id: string | null) => void;
}

const routeColor = (index: number) => ['#ef795f', '#4f8fd6', '#7b61d6', '#3aa98a'][index % 4];

const formatClearance = (value: number | null) => value === null ? '无夹挤' : `${value.toFixed(2)} m`;

export function AccessAssessmentPanel({ access, activeEntranceId, onSelectEntrance }: AccessAssessmentPanelProps) {
  if (access.missing.length > 0) {
    return <section className="access-panel">
      <div className="access-head">
        <div><span className="section-kicker">EGRESS &amp; ACCESS REVIEW</span><h2>通行评估</h2></div>
        <span className="access-badge is-missing">资料不全</span>
      </div>
      <div className="access-missing">
        <span>⚠️</span>
        <p>暂无法评估：场地里还缺少 <strong>{access.missing.join('、')}</strong>。{access.missing.includes('入口') ? '请先从左侧元素库加入入口；' : ''}{access.missing.includes('重点区域（主舞台 / 座席 / 展位）') ? '请先布置主舞台等重点区域。' : ''}</p>
      </div>
    </section>;
  }

  const reachable = access.routes.filter((route) => route.reachable);
  const shortest = reachable.length ? reachable.reduce((best, route) => route.distance < best.distance ? route : best, reachable[0]) : null;
  const widest = reachable.length ? reachable.reduce((best, route) => {
    if (best.minClearance === null) return best;
    if (route.minClearance === null) return route;
    return route.minClearance > best.minClearance ? route : best;
  }, reachable[0]) : null;

  return <section className="access-panel">
    <div className="access-head">
      <div><span className="section-kicker">EGRESS &amp; ACCESS REVIEW</span><h2>通行评估 · 各入口方案对比</h2></div>
      <span className="access-hint">路线已绕开全部元素 · 净宽口径同窄通道检查（≥ {MIN_CHANNEL.toFixed(1)} m）</span>
    </div>
    <div className="route-compare">
      {access.routes.map((route, index) => {
        const color = routeColor(index);
        const isActive = activeEntranceId === route.entranceId;
        const narrow = route.minClearance !== null && route.minClearance < MIN_CHANNEL;
        return <button
          type="button"
          key={route.entranceId}
          className={`route-card${isActive ? ' is-active' : ''}${!route.reachable ? ' is-blocked' : ''}`}
          style={{ '--route-color': color } as React.CSSProperties}
          onClick={() => onSelectEntrance(isActive ? null : route.entranceId)}
        >
          <div className="route-card-head">
            <span className="route-swatch" style={{ background: color }}>{index + 1}</span>
            <div className="route-card-titles"><strong>{route.entranceName}</strong><small>至 {route.targetName}</small></div>
            {!route.reachable ? <span className="route-tag tag-blocked">不可达</span> : narrow ? <span className="route-tag tag-narrow">偏窄</span> : <span className="route-tag tag-ok">达标</span>}
          </div>
          {route.reachable ? <>
            <div className="route-metrics">
              <div><small>路线长度</small><strong>{route.distance.toFixed(1)} m</strong>{shortest?.entranceId === route.entranceId ? <i>最短</i> : null}</div>
              <div><small>最窄净宽</small><strong className={narrow ? 'metric-danger' : 'metric-ok'}>{formatClearance(route.minClearance)}</strong>{widest?.entranceId === route.entranceId && route.minClearance !== null ? <i>最宽</i> : null}</div>
            </div>
            <div className="route-bottlenecks">
              {route.segments.some((segment) => segment.narrow)
                ? route.segments.filter((segment) => segment.narrow).map((segment, segmentIndex) => <span key={segmentIndex} className="bottleneck-chip">第 {route.segments.indexOf(segment) + 1} 段 · {(segment.clearance ?? 0).toFixed(2)} m</span>)
                : <span className="bottleneck-ok">全程净宽不低于 {MIN_CHANNEL.toFixed(1)} m</span>}
            </div>
          </> : <p className="route-blocked-copy">元素排布把路线完全封死，平面图上未画出可行折线，请先移开封堵的元素。</p>}
        </button>;
      })}
    </div>
  </section>;
}
