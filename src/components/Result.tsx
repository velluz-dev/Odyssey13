import { DV_TO_ORBIT, TARGETS, DATA_CITATION, atmosphereLabel } from '../data/planets';
import { fmt, type MissionOutcome, type MissionPhase } from '../logic/validation';
import Celebration from './Celebration';
import Certificate from './Certificate';
import { useState } from 'react';

const PHASES: { id: MissionPhase; label: string }[] = [
  { id: 'liftoff', label: 'Liftoff' },
  { id: 'ascent', label: 'Orbit' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'landing', label: 'Landing' },
  { id: 'surface', label: 'Surface ops' },
];

interface Props {
  outcome: MissionOutcome;
  onBack: () => void;
  onRetry: () => void;
}

export default function Result({ outcome: o, onBack, onRetry }: Props) {
  const t = TARGETS[o.targetId];
  const [showCert, setShowCert] = useState(o.success);
  // Earth Orbit missions have no transfer or landing: their timeline ends with deployment
  const phases = o.targetId === 'leo'
    ? [PHASES[0], PHASES[1], { id: 'surface' as MissionPhase, label: 'Deploy & operate' }]
    : PHASES;
  const failIdx = o.failPhase ? phases.findIndex((p) => p.id === (o.failPhase === 'transfer' && o.targetId === 'leo' ? 'surface' : o.failPhase)) : phases.length;
  const pct = Math.min(1, o.totalDv / o.requiredDv);

  return (
    <div className="result-screen">
      <div className={`result-card ${o.success ? 'success' : 'failure'}`}>
        <div className="result-badge" aria-hidden="true">{o.success ? '✓' : '✕'}</div>
        <p className="result-kicker">{o.success ? 'MISSION SUCCESS' : 'MISSION FAILED'}</p>
        <h2>{o.title}</h2>
        <p className="result-reason">{o.reason}</p>

        <ol className="timeline" aria-label="Mission timeline">
          {phases.map((p, i) => {
            const state = o.success || i < failIdx ? 'ok' : i === failIdx ? 'fail' : 'skip';
            return (
              <li key={p.id} className={`tl ${state}`}>
                <span className="tl-dot">{state === 'ok' ? '✓' : state === 'fail' ? '✕' : ''}</span>
                <span className="tl-label">{p.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="result-stats">
          <div className="stat">
            <span className="stat-label">Δv available / required</span>
            <span className="stat-value">{fmt(o.totalDv)} <small>/ {fmt(o.requiredDv)} m/s</small></span>
            <div className="dv-bar thin">
              <div className={`dv-fill ${o.totalDv >= o.requiredDv ? 'good' : 'bad'}`} style={{ width: `${pct * 100}%` }} />
              <div className="dv-mark" style={{ left: `${(DV_TO_ORBIT / o.requiredDv) * 100}%` }} />
            </div>
          </div>
          <div className="stat">
            <span className="stat-label">Liftoff TWR</span>
            <span className={`stat-value ${o.twr >= 1.2 ? 'good-text' : 'bad-text'}`}>{fmt(o.twr, 2)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Liftoff mass</span>
            <span className="stat-value">{fmt(o.totalMass / 1000, 1)} <small>t</small></span>
          </div>
          <div className="stat">
            <span className="stat-label">Stages</span>
            <span className="stat-value small-val">
              {o.stageDv.map((dv, i) => <span key={i}>S{i + 1}: {fmt(dv)} m/s</span>)}
            </span>
          </div>
        </div>

        <div className="result-tip">
          <strong>{o.success ? 'Next challenge:' : 'How to fix it:'}</strong> {o.tip}
        </div>

        <p className="tiny muted">
          {t.name}: surface gravity {t.gravity} m/s², atmosphere {atmosphereLabel(t)}. Data: {DATA_CITATION}.
        </p>

        <div className="result-actions">
          {o.success && <button className="btn gold big" onClick={() => setShowCert(true)}>🏅 View certificate</button>}
          <button className={`btn ${o.success ? 'ghost' : 'primary big'}`} onClick={onBack}>← Back to Build</button>
          <button className="btn ghost" onClick={onRetry}>Fly again</button>
        </div>
      </div>
      {o.success && <Celebration />}
      {o.success && showCert && <Certificate outcome={o} onClose={() => setShowCert(false)} />}
    </div>
  );
}
