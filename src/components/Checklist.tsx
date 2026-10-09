import { DV_TO_ORBIT, TARGETS, type TargetId } from '../data/planets';
import {
  canLaunch, fmt, requiredDv, type CheckItem, type RocketAnalysis,
} from '../logic/validation';
import Info, { TIPS } from './Info';
import AstroCat from './AstroCat';

/** Round check badges: gold ring + tick, red cross, amber exclamation. */
function Badge({ status }: { status: 'ok' | 'fail' | 'warn' }) {
  const c = status === 'ok' ? '#f2c76b' : status === 'fail' ? '#ff8a8a' : '#ffd27a';
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1.6" />
      {status === 'ok' && <path d="M6 10.3 l2.6 2.6 L14.2 7" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'fail' && <path d="M7 7 l6 6 M13 7 l-6 6" stroke={c} strokeWidth="2" strokeLinecap="round" />}
      {status === 'warn' && <><path d="M10 5.5 v5.5" stroke={c} strokeWidth="2" strokeLinecap="round" /><circle cx="10" cy="14" r="1.2" fill={c} /></>}
    </svg>
  );
}

interface Props {
  analysis: RocketAnalysis;
  items: CheckItem[];
  target: TargetId;
  onLaunch: () => void;
}

export default function Checklist({ analysis: a, items, target, onLaunch }: Props) {
  const req = requiredDv(target);
  const ready = canLaunch(items);
  const pct = Math.min(1, a.totalDv / req);
  const orbitMark = DV_TO_ORBIT / req;
  const twrClass = a.totalMass === 0 ? '' : a.twr >= 1.2 ? 'good' : 'bad';
  const dvClass = a.totalMass === 0 ? '' : a.totalDv >= req ? 'good' : 'bad';
  const fails = items.filter((i) => i.status === 'fail').length;

  return (
    <div className="checklist">
      <h2>Mission Check</h2>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Total mass</span>
          <span className="stat-value">{fmt(a.totalMass / 1000, 1)} <small>t</small></span>
        </div>
        <div className="stat">
          <span className="stat-label">Fuel mass</span>
          <span className="stat-value">{fmt(a.fuelMass / 1000, 1)} <small>t</small></span>
        </div>
        <div className={`stat ${twrClass}`}>
          <span className="stat-label">Liftoff TWR <Info text={TIPS.twr} /></span>
          <span className="stat-value">{fmt(a.twr, 2)}</span>
        </div>
        <div className={`stat ${dvClass}`}>
          <span className="stat-label">Δv <Info text={TIPS.dv} /></span>
          <span className="stat-value">{fmt(a.totalDv)} <small>m/s</small></span>
        </div>
      </div>

      <div className="dv-bar-wrap">
        <div className="dv-bar-label">
          <span>Δv: <b>{fmt(a.totalDv)}</b> / {fmt(req)} m/s</span>
          <span className="muted">{Math.round(pct * 100)}%</span>
        </div>
        <div className="dv-bar" role="progressbar" aria-valuemin={0} aria-valuemax={req} aria-valuenow={Math.round(a.totalDv)}>
          <div className={`dv-fill ${a.totalDv >= req ? 'good' : a.totalDv >= DV_TO_ORBIT ? 'mid' : 'bad'}`} style={{ width: `${pct * 100}%` }} />
          <div className="dv-mark" style={{ left: `${orbitMark * 100}%` }} />
        </div>
        <div className="dv-legend tiny muted">
          <span style={{ width: `${orbitMark * 100}%` }}>Earth → orbit {fmt(DV_TO_ORBIT)}</span>
          <span>→ {TARGETS[target].name} landing {fmt(TARGETS[target].dvFromOrbit)}</span>
        </div>
        {a.stages.length > 0 && (
          <div className="stage-dvs tiny">
            {a.stages.map((s) => (
              <span key={s.number}>S{s.number}: {fmt(s.dv)} m/s{s.isp ? ` (Isp ${fmt(s.isp)} s)` : ''}</span>
            ))}
          </div>
        )}
      </div>

      <ul className="check-items">
        {items.map((i) => (
          <li key={i.id} className={`check ${i.status}`}>
            <span className="check-icon" aria-label={i.status}><Badge status={i.status} /></span>
            <span>
              <span className="check-label">{i.label}</span>
              {i.detail && <span className="check-detail">{i.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      <AstroCat
        mood={ready ? 'happy' : 'worried'}
        message={a.totalMass === 0 ? "Meow! Add some parts and I'll check them."
          : ready ? 'All checks green. Ready for launch!'
          : `${fails === 1 ? 'Almost there!' : `${fails} things to fix.`} Fix: ${items.find((x) => x.status === 'fail')!.label}`}
      />

      <div className="launch-box">
        <button className="btn primary big" disabled={!ready} onClick={onLaunch}>
          🚀 Go to Launch Pad
        </button>
        {!ready && (
          <>
            <p className="tiny muted">{fails} check{fails === 1 ? '' : 's'} failing. Fix {fails === 1 ? 'it' : 'them'}, or…</p>
            <button className="btn danger sm" onClick={onLaunch} disabled={a.totalMass === 0}>
              Launch anyway (expect failure)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
