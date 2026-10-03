import { MIN_CHANNEL, ROUTE_COLORS } from '../../domain';
import type { AccessEvaluation } from '../../types';

interface AccessPanelProps { evaluation: AccessEvaluation; }

export function AccessPanel({ evaluation }: AccessPanelProps) {
  const missing: string[] = [];
  if (evaluation.missingEntrance) missing.push('缺少入口：请先从元素库加入至少一个入口，作为通行路线的起点。');
  if (evaluation.missingTarget) missing.push('缺少重点区域：请加入主舞台等区域，作为通行路线的终点。');
  const narrowRoutes = evaluation.routes.filter((route) => route.narrowSpans.length > 0).length;
  return <section className="access-panel">
    <div className="access-panel-head">
      <div className="analysis-title"><span className="analysis-pulse access-pulse" /><div><span className="section-kicker">ACCESS ASSESSMENT</span><strong>通行评估 · 各入口路线并排对比</strong></div></div>
      <span className="access-rule">净宽口径与窄通道检查一致：&lt; {MIN_CHANNEL} m 判定偏窄</span>
    </div>
    {missing.length > 0 ? <div className="access-missing">{missing.map((message) => <p key={message}>{message}</p>)}</div> : null}
    {evaluation.routes.length > 0 ? <>
      <div className="access-cards">
        {evaluation.routes.map((route, index) => {
          const narrow = route.narrowSpans.length > 0;
          return <div className={`access-card ${route.reachable ? '' : 'is-blocked'}`} key={route.entranceId}>
            <div className="access-card-head"><span className="access-chip" style={{ background: ROUTE_COLORS[index % ROUTE_COLORS.length] }}>{index + 1}</span><strong>{route.entranceName} → {route.targetName}</strong></div>
            {route.reachable ? <>
              <div className="access-metrics">
                <span>路线长度 <b>{route.distance} m</b></span>
                <span>最窄净宽 <b className={narrow ? 'is-narrow' : ''}>{route.minClearWidth !== null ? `${route.minClearWidth} m` : '全程开阔'}</b></span>
              </div>
              <small className={`access-status ${narrow ? 'is-narrow' : ''}`}>{narrow ? `${route.narrowSpans.length} 段偏窄，已在平面图上标红` : '全程净宽达标'}</small>
            </> : <small className="access-status is-narrow">通道被元素封死，无法绕行到达</small>}
          </div>;
        })}
      </div>
      <div className="access-summary">{narrowRoutes ? `${narrowRoutes} / ${evaluation.routes.length} 条路线存在偏窄路段（净宽 < ${MIN_CHANNEL} m），与窄通道检查结论一致` : `${evaluation.routes.length} 条路线均满足净宽要求`}</div>
    </> : null}
  </section>;
}
