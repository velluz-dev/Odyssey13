import { useMemo, useState, type CSSProperties } from 'react';
import { PARTS, CATEGORY_INFO, PRESETS, PART_HELP, type PartCategory, type PartDef } from '../data/parts';
import { TARGETS, DATA_CITATION, type TargetId } from '../data/planets';
import {
  analyzeRocket, buildChecklist, fmt, getPart, requiredDv, type PlacedPart,
} from '../logic/validation';
import Checklist from './Checklist';
import RocketPreview from './RocketPreview';
import Info, { TIPS } from './Info';
import PartIcon from './PartIcon';
import { textureUrl } from './planetTextures';

let uidCounter = 0;
export const newUid = () => `p${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

const CATEGORY_ORDER: PartCategory[] = ['payload', 'tank', 'engine', 'power', 'comms', 'landing', 'decoupler'];

function partStats(p: PartDef): string {
  const bits = [`${fmt(p.dryMass)} kg`];
  if (p.fuelMass) bits.push(`+ ${fmt(p.fuelMass)} kg fuel`);
  if (p.thrust) bits.push(`${fmt(p.thrust / 1000)} kN · Isp ${p.isp} s`);
  return bits.join(' · ');
}

interface Props {
  target: TargetId;
  setTarget: (t: TargetId) => void;
  rocket: PlacedPart[];
  setRocket: (r: PlacedPart[]) => void;
  onLaunch: () => void;
}

export default function Builder({ target, setTarget, rocket, setRocket, onLaunch }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const analysis = useMemo(() => analyzeRocket(rocket), [rocket]);
  const items = useMemo(() => buildChecklist(rocket, target, analysis), [rocket, target, analysis]);

  /** New parts go just below the selected part, or at the bottom of the stack. */
  const add = (partId: string) => {
    const p = { uid: newUid(), partId };
    const idx = selected ? rocket.findIndex((r) => r.uid === selected) : -1;
    if (idx >= 0) setRocket([...rocket.slice(0, idx + 1), p, ...rocket.slice(idx + 1)]);
    else setRocket([...rocket, p]);
    setSelected(p.uid);
  };
  const remove = (uid: string) => {
    setRocket(rocket.filter((r) => r.uid !== uid));
    if (selected === uid) setSelected(null);
  };
  const move = (uid: string, dir: -1 | 1) => {
    const i = rocket.findIndex((r) => r.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rocket.length) return;
    const next = [...rocket];
    [next[i], next[j]] = [next[j], next[i]];
    setRocket(next);
  };
  const loadPreset = () => {
    setRocket(PRESETS[target].map((partId) => ({ uid: newUid(), partId })));
    setSelected(null);
  };

  const topFirstStages = [...analysis.stages].reverse();
  const multi = analysis.stages.length > 1;

  return (
    <div className="build">
      {/* ---------------- Parts panel ---------------- */}
      <aside className="panel parts-panel" aria-label="Parts">
        <h2>Parts</h2>
        <p className="muted small">Click to add{selected ? ' below the selected part' : ' to the bottom of the stack'}.</p>
        {CATEGORY_ORDER.map((cat) => (
          <section key={cat} className="part-group">
            <h3><span className="dot" style={{ background: CATEGORY_INFO[cat].color }} />{CATEGORY_INFO[cat].label}</h3>
            {PARTS.filter((p) => p.category === cat).map((p) => (
              <button key={p.id} className="part-btn" onClick={() => add(p.id)} aria-describedby={`help-${p.id}`}>
                <span className="part-icon-wrap"><PartIcon partId={p.id} /></span>
                {PART_HELP[p.id] && (
                  <span className="part-explain" id={`help-${p.id}`}>
                    <span><b>What</b> {PART_HELP[p.id].what}</span>
                    <span><b>Use</b> {PART_HELP[p.id].use}</span>
                  </span>
                )}
                <span className="part-text">
                  <span className="pname">{p.name}</span>
                  <span className="pstats">{partStats(p)}</span>
                </span>
                <span className="plus" aria-hidden="true">+</span>
              </button>
            ))}
          </section>
        ))}
      </aside>

      {/* ---------------- Center: target + rocket ---------------- */}
      <section className="panel center-panel">
        <div className="target-picker" role="radiogroup" aria-label="Mission target">
          {(['leo', 'moon', 'mars'] as TargetId[]).map((id) => {
            const t = TARGETS[id];
            return (
              <button key={id} role="radio" aria-checked={target === id}
                className={`target-card ${target === id ? 'active' : ''}`} onClick={() => setTarget(id)}>
                <span className={`planet-ball ${id}`} aria-hidden="true" style={{ backgroundImage: `url(${textureUrl(id === 'leo' ? 'earth' : id)})` }} />
                <span className="target-text">
                  <strong>{t.name}</strong>
                  <span className="small muted">
                    {id === 'leo' ? '400 km up' : `g = ${t.gravity} m/s²`} · Air: {t.atmosphere === 'none' ? 'none' : t.atmosphere === 'thin' ? 'thin CO₂' : 'thick'}
                  </span>
                  <span className="small">Needs Δv {fmt(requiredDv(id))} m/s</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="tiny muted center-cite">{TARGETS[target].dvNote}. Data: {DATA_CITATION}.</p>

        <div className="center-body">
          <div className="preview-wrap hangar" style={{ '--hangar-img': `url(${import.meta.env.BASE_URL}background/hangar.jpg)` } as CSSProperties}>
            <RocketPreview rocket={rocket} analysis={analysis} selected={selected} />
          </div>

          <div className="stack-list">
            <div className="stack-head">
              <h2>Stack <span className="muted small">top → bottom</span> <Info text={TIPS.stages} /></h2>
              <div className="stack-actions">
                <button className="btn ghost sm" onClick={loadPreset}>Load {TARGETS[target].name} example</button>
                <button className="btn ghost sm" onClick={() => { setRocket([]); setSelected(null); }} disabled={!rocket.length}>Clear</button>
              </div>
            </div>
            {rocket.length === 0 && <p className="muted small">Empty. Add a payload first, then work downward to the engines.</p>}
            {topFirstStages.map((st) => (
              <div key={st.number} className="stage-block">
                {multi && (
                  <div className="stage-label">
                    <span>Stage {st.number}{st.number === 1 ? ' · fires first' : st.number === analysis.stages.length ? ' · upper stage' : ''}</span>
                    <span>Δv {fmt(st.dv)} m/s</span>
                  </div>
                )}
                {st.uids.map((uid) => {
                  const idx = rocket.findIndex((r) => r.uid === uid);
                  const part = getPart(rocket[idx].partId);
                  return (
                    <div key={uid} className={`stack-row ${selected === uid ? 'sel' : ''}`} onClick={() => setSelected(selected === uid ? null : uid)}>
                      <span className="swatch" style={{ background: part.color }} />
                      <span className="row-name">{part.name}</span>
                      <span className="row-mass muted">{fmt((part.dryMass + part.fuelMass) / 1000, 2)} t</span>
                      <span className="row-btns" onClick={(e) => e.stopPropagation()}>
                        <button aria-label="Move up" onClick={() => move(uid, -1)} disabled={idx === 0}>▲</button>
                        <button aria-label="Move down" onClick={() => move(uid, 1)} disabled={idx === rocket.length - 1}>▼</button>
                        <button aria-label="Remove" className="rm" onClick={() => remove(uid)}>✕</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {rocket.length > 0 && !multi && (
              <p className="tiny muted hint">Tip: add a <b>Decoupler</b> between the upper parts and the launch tanks to make 2 stages.</p>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Checklist ---------------- */}
      <aside className="panel check-panel" aria-label="Mission checklist">
        <Checklist analysis={analysis} items={items} target={target} onLaunch={onLaunch} />
      </aside>
    </div>
  );
}
