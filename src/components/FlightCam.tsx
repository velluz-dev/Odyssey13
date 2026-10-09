import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { TARGETS, LEO_ALTITUDE_KM, LEO_SPEED_KMS, type TargetId } from '../data/planets';
import { analyzeRocket, fmt, getPart, type MissionOutcome, type MissionStep, type PlacedPart } from '../logic/validation';
import { Bell, CX, Defs, PayloadItem, layoutRocket } from './RocketPreview';
import { sphereImage, type BodyId } from './planetTextures';

/*
 * FlightCam: a close-up side-view camera that follows the rocket you built.
 *   ascent : launch site → sky darkens → stages drop away, tumble back into the
 *            atmosphere, heat up and break apart → fairing splits off in space
 *   space  : the remaining stack burns for injection, then coasts
 *   landing: Moon (powered descent, legs, regolith dust) or Mars (entry plasma,
 *            parachute, heat-shield drop, powered descent), including failures
 * It reads OrbitView's mission clock through `camRef`, so both views stay in sync.
 */

export interface CamState {
  mode: string; modeT: number; time: number;
  u: number; tau: number; sepIdx: number;
  step: number; failStep: number;
  crashFrom: '' | 'ascent' | 'landing' | 'surface';
}

type Scene = 'ascent' | 'space' | 'landing' | 'orbit';

const VW = 300, VH = 400, GROUND = 338;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function mix(c1: string, c2: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], clamp01(t)))).join(',')})`;
}
const flame = (cx: number, y: number, w: number, len: number) =>
  `M${cx - w / 2} ${y} Q${cx - w * 0.55} ${y + len * 0.45} ${cx} ${y + len} Q${cx + w * 0.55} ${y + len * 0.45} ${cx + w / 2} ${y}Z`;

/** Launch-site photo (public/launch-site.png, 572×1024); a vector site is drawn if it is missing. */
const SITE_URL = `${import.meta.env.BASE_URL}launch-site.png`;
/** Photo placement: scale 0.6 puts the pad's flame trench (photo px 320, 905) under the rocket at (150, GROUND). */
const SITE = { s: 0.6, padX: 320, padY: 905, w: 572, h: 1024 };
let siteState: 'unknown' | 'ok' | 'missing' = 'unknown';

/** A lit planet sphere as a data URL (null until its texture has loaded). */
function useSphere(id: BodyId, size: number, lightX: number, lightY: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    const tryIt = () => {
      const c = sphereImage(id, size, 20, lightX, lightY);
      if (c) setUrl(c.toDataURL());
      else t = window.setTimeout(tryIt, 400);
    };
    tryIt();
    return () => window.clearTimeout(t);
  }, [id, size, lightX, lightY]);
  return url;
}

/* ------------------------------------------------------------------------- */
/* Lander (payload + descent engine), drawn with its feet at y = 0            */
/* ------------------------------------------------------------------------- */
const ITEM_H: Record<string, number> = { 'probe-core': 34, rover: 32, cubesat: 18, 'comms-sat': 40, telescope: 56, 'solar-panel': 22, rtg: 20, antenna: 18 };
const BELL_H = 18, BOX_H = 12;

function Lander({ partIds, legs, deploy, thrust, time, panels, roverOut, dim }: {
  partIds: string[]; legs: boolean; deploy: number; thrust: boolean; time: number;
  panels: number; roverOut: boolean; dim: boolean;
}) {
  const items = partIds.filter((id) => ITEM_H[id] && !(roverOut && id === 'rover'));
  const boxTop = -(BELL_H + 2 + BOX_H);
  let y = boxTop - items.reduce((s, id) => s + ITEM_H[id], 0);
  const nodes = items.map((id, i) => {
    const h = ITEM_H[id];
    const n = <PayloadItem key={`${id}${i}`} partId={id} cx={0} y={y} w={46} h={h} />;
    y += h;
    return n;
  });
  const foot = lerp(22, 36, deploy), footY = lerp(-12, 0, deploy);
  return (
    <g opacity={dim ? 0.55 : 1}>
      {thrust && <path d={flame(0, -2, 13, 30 + Math.sin(time * 41) * 4)} fill="url(#fc-flame)" />}
      <Bell cx={0} y={-(BELL_H + 2)} bw={16} bh={BELL_H} />
      {panels > 0 && [-1, 1].map((s) => (
        <g key={s}>
          <rect x={s < 0 ? -25 - 52 * panels : 25} y={boxTop + 1} width={52 * panels} height={10} fill="url(#rk-panel)" stroke="#c9ced4" strokeWidth={0.6} />
          {[1, 2, 3].map((i) => <line key={i} x1={s < 0 ? -25 - 13 * i * panels : 25 + 13 * i * panels} x2={s < 0 ? -25 - 13 * i * panels : 25 + 13 * i * panels} y1={boxTop + 1} y2={boxTop + 11} stroke="#6f9be0" strokeWidth={0.5} />)}
        </g>
      ))}
      <rect x={-25} y={boxTop} width={50} height={BOX_H} rx={2} fill="url(#rk-gold)" stroke="#5a3d08" strokeWidth={0.5} />
      {nodes}
      {legs && [-1, 1].map((s) => (
        <g key={s} stroke="#c9ced4" strokeWidth={2.2} strokeLinecap="round">
          <line x1={s * 20} y1={boxTop + BOX_H} x2={s * foot} y2={footY} />
          <line x1={s * (foot - 5)} x2={s * (foot + 5)} y1={footY} y2={footY} />
        </g>
      ))}
    </g>
  );
}

const partIdsOf = (rocket: PlacedPart[]) => rocket.map((p) => p.partId);

/** Deployed satellite, centred on its bus. `wings` 0 = solar arrays folded, 1 = fully open. */
function Satellite({ partId, wings, dim }: { partId: string; wings: number; dim: boolean }) {
  const tele = partId === 'telescope', cube = partId === 'cubesat';
  const bw = cube ? 14 : tele ? 26 : 30, bh = cube ? 24 : tele ? 64 : 34;
  const L = cube ? 30 : 64, wh = cube ? 14 : 22;
  return (
    <g opacity={dim ? 0.5 : 1}>
      {[-1, 1].map((s) => {
        const w = Math.max(4, L * wings);
        const x0 = s < 0 ? -(bw / 2 + 6) - w : bw / 2 + 6;
        return (
          <g key={s}>
            <line x1={s * bw / 2} x2={s * (bw / 2 + 6)} y1={0} y2={0} stroke="#c9ccd3" strokeWidth={2} />
            <rect x={x0} y={-wh / 2} width={w} height={wh} fill="url(#rk-panel)" stroke="#c9ced4" strokeWidth={0.8} />
            {wings > 0.3 && [1, 2, 3].map((i) => <line key={i} x1={x0 + (w * i) / 4} x2={x0 + (w * i) / 4} y1={-wh / 2} y2={wh / 2} stroke="#7aa6ea" strokeWidth={0.5} />)}
            {wings > 0.3 && <line x1={x0} x2={x0 + w} y1={0} y2={0} stroke="#7aa6ea" strokeWidth={0.5} />}
          </g>
        );
      })}
      {tele ? (
        <g>
          <rect x={-bw / 2} y={-bh / 2} width={bw} height={bh * 0.66} rx={3} fill="url(#rk-cyl)" stroke="#7d858f" strokeWidth={0.8} />
          <rect x={-bw / 2 + 1} y={-bh / 2} width={bw - 2} height={5} fill="#14171c" />
          <rect x={-bw / 2} y={-bh / 2 + bh * 0.66} width={bw} height={bh * 0.34} rx={3} fill="url(#rk-gold)" stroke="#5a3d08" strokeWidth={0.8} />
        </g>
      ) : (
        <g>
          <rect x={-bw / 2} y={-bh / 2} width={bw} height={bh} rx={3} fill={cube ? 'url(#rk-cyl)' : 'url(#rk-gold)'} stroke={cube ? '#6a727d' : '#5a3d08'} strokeWidth={0.8} />
          {!cube && <path d={`M${-bw / 2 + 4} ${-4} l8 -3 l7 4 l8 -3`} fill="none" stroke="#fff3c0" strokeOpacity={0.55} strokeWidth={0.8} />}
          {cube && [1, 2].map((i) => <line key={i} x1={-bw / 2} x2={bw / 2} y1={-bh / 2 + (bh * i) / 3} y2={-bh / 2 + (bh * i) / 3} stroke="#6a727d" strokeWidth={0.6} />)}
          {!cube && <path d={`M-12 ${bh / 2} Q0 ${bh / 2 + 16} 12 ${bh / 2}Z`} fill="url(#rk-cyl)" stroke="#8b939e" strokeWidth={0.6} />}
        </g>
      )}
    </g>
  );
}

/** Mars entry capsule: backshell + heat shield, origin at the heat-shield face. */
function Capsule({ shield, glow }: { shield: boolean; glow: number }) {
  return (
    <g>
      {glow > 0 && <ellipse cx={0} cy={8} rx={34} ry={22} fill="url(#fc-plasma)" opacity={glow} />}
      <path d="M-9 -26 H9 L24 0 H-24Z" fill="url(#rk-cyl)" stroke="#7d858f" strokeWidth={0.6} />
      {shield && <path d="M-25 0 H25 L9 9 H-9Z" fill="url(#rk-aero)" stroke="#1d140c" strokeWidth={0.6} />}
    </g>
  );
}

function Explosion({ x, y, t }: { x: number; y: number; t: number }) {
  if (t > 2.2) return null;
  const a = 1 - t / 2.2;
  return (
    <g>
      <circle cx={x} cy={y} r={10 + t * 55} fill="url(#fc-boom)" opacity={a} />
      {Array.from({ length: 10 }, (_, i) => {
        const ang = (i / 10) * Math.PI * 2 + 0.3;
        const d = t * (40 + (i % 3) * 18);
        return <rect key={i} x={x + Math.cos(ang) * d} y={y - Math.abs(Math.sin(ang)) * d + t * t * 30} width={3} height={2} fill="#ffb347" opacity={a} />;
      })}
    </g>
  );
}

/* ------------------------------------------------------------------------- */

export default function FlightCam({ rocket, outcome, targetId, camRef, stepS }: {
  rocket: PlacedPart[];
  outcome: MissionOutcome;
  targetId: TargetId;
  camRef: MutableRefObject<CamState>;
  stepS: number;
}) {
  const analysis = useMemo(() => analyzeRocket(rocket), [rocket]);
  const L = useMemo(() => layoutRocket(rocket, analysis), [rocket, analysis]);
  const [, setTick] = useState(0);
  const [site, setSite] = useState(siteState);
  const mem = useRef({
    sepTimes: [] as number[], fairingT: -1, crashT: -1, lastMode: '',
    scene: 'ascent' as Scene, scale: 0, cu: 0,
  });
  const isMoon = targetId === 'moon';
  const isLeo = targetId === 'leo';
  const t = TARGETS[targetId];

  // Re-render every animation frame
  useEffect(() => {
    let raf = 0;
    const f = () => { setTick((n) => (n + 1) % 1e9); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Detect the optional launch-site photo once
  useEffect(() => {
    if (siteState !== 'unknown') return;
    const img = new Image();
    img.onload = () => { siteState = 'ok'; setSite('ok'); };
    img.onerror = () => { siteState = 'missing'; setSite('missing'); };
    img.src = SITE_URL;
  }, []);

  const earthImg = useSphere('earth', 96, -0.8, -0.4);
  const earthBig = useSphere('earth', 160, -0.55, -0.8);
  const moonImg = useSphere('moon', 96, -0.8, -0.3);
  const marsImg = useSphere('mars', 96, -0.8, -0.3);

  const c = camRef.current;
  const m = mem.current;

  // ---- Bookkeeping: separation times, fairing jettison, crash time, scene ----
  while (m.sepTimes.length < c.sepIdx) m.sepTimes.push(c.time);
  if (m.fairingT < 0 && L.fairing && (c.u >= 0.62 || ['transfer', 'drift', 'landing', 'surface'].includes(c.mode))) m.fairingT = c.time;
  if (c.mode !== m.lastMode) {
    if (c.mode === 'crash' || c.mode === 'lost') m.crashT = c.time;
    m.lastMode = c.mode;
  }
  const sticky = ['crash', 'lost', 'done'].includes(c.mode);
  if (!sticky) {
    if (['transfer', 'drift'].includes(c.mode)) m.scene = c.mode === 'transfer' && c.modeT < 1.4 ? 'ascent' : 'space';
    else if (['landing', 'surface'].includes(c.mode)) m.scene = isLeo ? (c.mode === 'surface' && c.modeT < 1.2 && m.scene === 'ascent' ? 'ascent' : 'orbit') : 'landing';
    else m.scene = 'ascent';
  } else if (c.crashFrom === 'landing' || c.crashFrom === 'surface') m.scene = isLeo ? 'orbit' : 'landing';
  else if (isLeo && c.mode === 'done' && outcome.success) m.scene = 'orbit';
  const scene = m.scene;
  const sinceCrash = m.crashT >= 0 ? c.time - m.crashT : 0;

  const sepCount = m.sepTimes.length;
  const stageNums = [...L.stageNodes.keys()].sort((a, b) => a - b);
  const lowest = stageNums.find((n) => n > sepCount) ?? stageNums[stageNums.length - 1];
  const fairingOff = m.fairingT >= 0;

  let caption = '';
  let readout = '';
  let body: ReactNode = null;

  /* ============================== ASCENT ============================== */
  if (scene === 'ascent') {
    const alt = clamp01(c.u);
    const top = L.fairing ? L.fairing.y : Math.min(...[...L.stageSpan.values()].map((s) => s[0]));
    const bottom = L.stageSpan.get(lowest)?.[1] ?? L.bottom;
    const span = bottom - top;
    const sT = Math.min(0.55 * VH / span, 0.9);
    if (m.scale === 0) { m.scale = sT; m.cu = (top + bottom) / 2; }
    m.scale = lerp(m.scale, sT, 0.06);
    m.cu = lerp(m.cu, (top + bottom) / 2, 0.06);
    const s = m.scale;
    const liftK = smooth(0, 0.12, alt);
    const padCenter = GROUND - (L.bottom - m.cu) * s;
    const cy = lerp(padCenter, 165, liftK);
    const crashed = c.crashFrom === 'ascent' && sticky;
    const falling = c.mode === 'fallback' || crashed;
    const tumble = falling ? (c.mode === 'fallback' ? c.modeT : 1.6) * 70 : 0;
    const pitch = smooth(0.15, 1, alt) * 26 + tumble;
    const shake = c.mode === 'pad' ? Math.sin(c.time * 60) * 1.5
      : c.mode === 'ascent' ? Math.sin(c.time * 55) * 2.2 * (1 - smooth(0, 0.3, alt)) : 0;
    const groundShift = smooth(0.02, 0.25, alt) * 520;
    const burning = (c.mode === 'ascent') || c.mode === 'pad' || (c.mode === 'transfer' && c.tau < 0.15);
    const skyTop = mix('#3d7fd6', '#000006', smooth(0.05, 0.8, alt));
    const skyLow = mix('#bfe0ff', '#0d1a3a', smooth(0.08, 0.9, alt));
    const starA = smooth(0.4, 0.85, alt);

    // Readouts and caption
    readout = `ALT ${fmt(alt * 200)} km · ${fmt(alt * 7.8, 1)} km/s`;
    const lastSep = m.sepTimes.length ? c.time - m.sepTimes[m.sepTimes.length - 1] : 99;
    if (c.mode === 'idle' || c.mode === 'warp') caption = c.mode === 'warp' ? 'Waiting for the launch window…' : 'On the pad · fuelled and ready';
    else if (c.mode === 'pad') caption = `Ignition… TWR ${fmt(outcome.twr, 2)}: thrust can't lift the weight`;
    else if (crashed) caption = 'Impact: the rocket fell back to Earth';
    else if (c.mode === 'fallback') caption = 'Out of Δv before orbit: falling back to Earth';
    else if (c.mode === 'done' && outcome.failPhase === 'liftoff') caption = 'Engines shut down: still on the pad';
    else if (lastSep < 3) caption = `Stage ${m.sepTimes.length} dropped: it falls back through the atmosphere, heats up and breaks apart`;
    else if (fairingOff && c.time - m.fairingT < 2.5) caption = 'Fairing jettisoned: we are above the atmosphere';
    else if (alt < 0.08) caption = 'Liftoff!';
    else if (alt < 0.2) caption = 'Climbing through the thick lower atmosphere';
    else if (alt < 0.38) caption = 'Max-Q: peak aerodynamic pressure';
    else if (alt < 0.75) caption = 'Pitching over toward orbit';
    else caption = c.mode === 'transfer' ? 'Orbit reached: injection burn' : 'Approaching orbit (~200 km)';

    const stageGroup = (n: number) => {
      const sepIndex = n - 1; // Stage n separates at the (n-1)th separation event
      const span2 = L.stageSpan.get(n);
      if (!span2) return null;
      const nodes = L.stageNodes.get(n)!;
      if (sepIndex >= m.sepTimes.length) return <g key={n}>{nodes}</g>;
      const dt = c.time - m.sepTimes[sepIndex];
      if (dt > 3.2) return null;
      const mid = (span2[0] + span2[1]) / 2;
      const dy = (24 * dt + 52 * dt * dt) / Math.max(s, 0.2) * 0.32;
      const heat = smooth(0.5, 1.7, dt);
      const fade = 1 - smooth(2.4, 3.2, dt);
      return (
        <g key={n} opacity={fade} transform={`translate(${dt * 14} ${dy}) rotate(${dt * 38} ${CX} ${mid})`}>
          {nodes}
          <rect x={CX - 45} y={span2[0]} width={90} height={span2[1] - span2[0]} fill="url(#fc-heat)" opacity={heat * 0.85} style={{ mixBlendMode: 'screen' }} />
          <ellipse cx={CX} cy={span2[1]} rx={70} ry={60} fill="url(#fc-plasma)" opacity={heat} />
          {dt > 1.5 && Array.from({ length: 8 }, (_, i) => {
            const k = dt - 1.5, ang = i * 0.8;
            return <rect key={i} x={CX + Math.cos(ang) * k * 70} y={mid + Math.sin(ang) * k * 90} width={8} height={5} fill={i % 2 ? '#ffb347' : '#ff6a2a'} opacity={1 - k / 1.7} />;
          })}
        </g>
      );
    };

    const f = L.fairing;
    const fdt = fairingOff ? c.time - m.fairingT : 0;
    const mounts = burning ? (L.engines.get(lowest) ?? []) : [];

    body = (
      <g>
        <rect width={VW} height={VH} fill="url(#fc-sky)" />
        <g opacity={starA}>{STARS.map((st, i) => <circle key={i} cx={st.x * VW} cy={st.y * VH} r={st.r} fill="#fff" />)}</g>
        {/* Earth's limb appears as we climb */}
        <g opacity={smooth(0.3, 0.7, alt)}>
          <circle cx={150} cy={lerp(1400, 1290, alt)} r={1000} fill="url(#fc-ocean)" />
          <circle cx={150} cy={lerp(1400, 1290, alt)} r={1004} fill="none" stroke="#8fd0ff" strokeWidth={6} opacity={0.55} />
          <circle cx={150} cy={lerp(1400, 1290, alt)} r={1014} fill="none" stroke="#5aa9ff" strokeWidth={14} opacity={0.15} />
        </g>
        {/* Clouds rushing past */}
        <g opacity={1 - smooth(0.25, 0.4, alt)}>
          {CLOUDS.map((cl, i) => <ellipse key={i} cx={cl.x} cy={cl.y + alt * 1900} rx={cl.rx} ry={cl.rx * 0.28} fill="#ffffff" opacity={0.85} />)}
        </g>
        {/* Transonic vapor cone around the fairing near Max-Q */}
        {alt > 0.15 && alt < 0.42 && !falling && (
          <ellipse cx={150 + shake} cy={cy - 62 * s} rx={30 * s} ry={8 * s} fill="#ffffff"
            opacity={(1 - Math.abs(alt - 0.285) / 0.135) * 0.65} />
        )}
        {/* Launch site */}
        <g transform={`translate(0 ${groundShift})`} opacity={1 - smooth(0.15, 0.3, alt)}>
          {site === 'ok' ? (
            <image href={SITE_URL} x={150 - SITE.padX * SITE.s} y={GROUND - SITE.padY * SITE.s}
              width={SITE.w * SITE.s} height={SITE.h * SITE.s} preserveAspectRatio="none" />
          ) : <LaunchSite />}
          <g opacity={c.mode === 'idle' || c.mode === 'warp' ? 1 : 1 - smooth(0, 0.06, alt)}>
            <rect x={185} y={GROUND - 210} width={14} height={210} fill="none" stroke="#7d858f" strokeWidth={2.2} />
            {Array.from({ length: 14 }, (_, i) => <line key={i} x1={185} x2={199} y1={GROUND - 15 * i} y2={GROUND - 15 * (i + 1)} stroke="#9aa2ac" strokeWidth={1} />)}
          </g>
          {(burning || alt < 0.1) && c.mode !== 'idle' && c.mode !== 'warp' && SMOKE.map((sm, i) => {
            const g = clamp01((c.mode === 'pad' ? c.modeT : alt * 30) * 0.8);
            return <ellipse key={i} cx={150 + sm.dx * (0.4 + g)} cy={GROUND + 4 - sm.dy * g} rx={sm.r * (0.3 + g)} ry={sm.r * 0.6 * (0.3 + g)} fill="#eef1f4" opacity={0.85 * (1 - smooth(0.05, 0.2, alt))} />;
          })}
          {/* Ignition fireball blooming on the pad at set-off */}
          {burning && alt < 0.09 && c.mode !== 'idle' && c.mode !== 'warp' && (
            <ellipse cx={150} cy={GROUND + 10} rx={24 + (1 - alt / 0.09) * 34} ry={10 + (1 - alt / 0.09) * 10}
              fill="url(#fc-flame)" opacity={0.9 * (1 - alt / 0.09)} />
          )}
        </g>

        {/* The rocket */}
        {!crashed && (
          <g transform={`translate(${150 + shake} ${cy}) rotate(${pitch}) scale(${s}) translate(${-CX} ${-m.cu})`}>
            {mounts.map((mt, i) => (
              <path key={i} d={flame(mt.cx, mt.y - 1, mt.bw * (0.85 + alt * 1.4), mt.bw * (mt.launch ? 2.8 : 2.3) * (1 + Math.sin(c.time * 47 + i) * 0.08))} fill="url(#fc-flame)" />
            ))}
            {stageNums.map(stageGroup)}
            {f && (
              <g>
                {!fairingOff && f.back}
                {f.items}
                {!fairingOff ? f.shell : fdt < 2.5 && [-1, 1].map((side) => (
                  <g key={side} clipPath={`url(#fc-half-${side < 0 ? 'l' : 'r'})`} opacity={1 - fdt / 2.5}>
                    <g transform={`translate(${side * (fdt * 50 + fdt * fdt * 40)} ${fdt * fdt * 25}) rotate(${side * fdt * 45} ${CX + side * 30} ${f.y + f.h})`}>
                      {f.shell}
                    </g>
                  </g>
                ))}
              </g>
            )}
          </g>
        )}
        {crashed && <Explosion x={150} y={GROUND - 10} t={sinceCrash} />}
        <defs>
          <linearGradient id="fc-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={skyTop} /><stop offset="1" stopColor={skyLow} />
          </linearGradient>
        </defs>
      </g>
    );
  }

  /* ============================== SPACE ============================== */
  if (scene === 'space') {
    const tau = clamp01(c.tau);
    const drifting = c.mode === 'drift' || (c.mode === 'done' && outcome.failPhase === 'transfer');
    const dT = drifting ? (c.mode === 'drift' ? c.modeT : 3) : 0;
    const burning = c.mode === 'transfer' && tau < 0.15;
    const span = [...L.stageSpan.entries()].filter(([n]) => n >= lowest).map(([, sp]) => sp);
    const top = L.fairing ? L.fairing.y : Math.min(...span.map((sp) => sp[0]));
    const bottom = Math.max(...span.map((sp) => sp[1]));
    const s = Math.min(230 / (bottom - top), 0.9);
    const mid = (top + bottom) / 2;
    const mounts = burning ? (L.engines.get(lowest) ?? []) : [];
    const destImg = isMoon ? moonImg : marsImg;
    const destR = lerp(6, 46, tau);
    readout = `DAY ${fmt(tau * (isMoon ? 5 : 259), isMoon ? 1 : 0)} · ${isMoon ? '384,400 km trip' : '259-day Hohmann transfer'}`;
    caption = drifting ? 'Out of fuel mid-transfer: tumbling off course into deep space'
      : burning ? (isMoon ? 'Trans-Lunar Injection burn' : 'Trans-Mars Injection burn')
      : `Coasting to ${t.label}: engines off, gravity does the work`;
    body = (
      <g>
        <rect width={VW} height={VH} fill="#02030a" />
        {STARS.map((st, i) => <circle key={i} cx={((st.x * VW - c.time * 6 * st.r) % VW + VW) % VW} cy={st.y * VH} r={st.r} fill="#fff" opacity={0.8} />)}
        {earthImg && <image href={earthImg} x={-30 - tau * 40} y={300 + tau * 40} width={lerp(130, 40, tau)} height={lerp(130, 40, tau)} />}
        {destImg && <image href={destImg} x={250 - destR} y={70 - destR} width={destR * 2} height={destR * 2} />}
        <g opacity={drifting ? 1 - smooth(1.5, 3, dT) : 1}
          transform={`translate(${150 + dT * 40} ${200 + dT * 10}) rotate(${70 + dT * 50}) scale(${s}) translate(${-CX} ${-mid})`}>
          {mounts.map((mt, i) => <path key={i} d={flame(mt.cx, mt.y - 1, mt.bw * 2, mt.bw * 3.2 * (1 + Math.sin(c.time * 40) * 0.08))} fill="url(#fc-flame)" />)}
          {stageNums.filter((n) => n >= lowest).map((n) => <g key={n}>{L.stageNodes.get(n)}</g>)}
          {L.fairing?.items}
        </g>
      </g>
    );
  }

  /* ============================== ORBIT (satellite deployment) ============================== */
  if (scene === 'orbit') {
    const sSteps = outcome.surfaceSteps;
    const ended = c.mode === 'done' && outcome.success;
    const lostAt = c.crashFrom === 'surface' ? c.failStep : -1;
    // Which step we are on, and progress through it
    const k = ended ? sSteps.length : lostAt >= 0 ? lostAt : Math.min(Math.floor(c.modeT / stepS), sSteps.length - 1);
    const f = ended || lostAt >= 0 ? 1 : clamp01(c.modeT / stepS - k);
    const idx = (kind: string) => sSteps.findIndex((st) => st.kind === kind);
    const prog = (kind: string) => { const i = idx(kind); return i < 0 ? 0 : k > i ? 1 : k === i ? f : 0; };
    const okAt = (kind: string) => sSteps[idx(kind)]?.ok !== false;
    const deployP = smooth(0, 1, prog('deploy'));
    const powerFail = lostAt >= 0 && sSteps[lostAt].kind === 'power';
    const commsFail = lostAt >= 0 && sSteps[lostAt].kind === 'comms';
    const wings = okAt('power') && partIdsOf(rocket).includes('solar-panel') ? smooth(0, 1, prog('power')) : 0;
    const beaming = okAt('comms') && prog('comms') > 0 && !powerFail;
    const satPart = partIdsOf(rocket).find((id) => ['comms-sat', 'telescope', 'cubesat', 'probe-core'].includes(id)) ?? 'comms-sat';

    // Upper stage (whatever is still attached), lying horizontally with its nose to the right
    const keep = [...L.stageSpan.entries()].filter(([n]) => n >= lowest);
    const top = Math.min(...keep.map(([, sp]) => sp[0]));
    const bottom = Math.max(...keep.map(([, sp]) => sp[1]));
    const sS = Math.min(150 / Math.max(1, bottom - top), 0.8);
    const mid = (top + bottom) / 2;
    const away = smooth(0.35, 1, deployP) * 70 + (k > idx('deploy') ? 40 + c.time * 0 : 0);
    const stageX = 95 - away, stageY = 150;
    const noseX = stageX + (mid - top) * sS;
    const satX = lerp(noseX + 22, 190, deployP), satY = lerp(stageY, 150, deployP) + Math.sin(c.time * 0.8) * 3;
    const spin = ended || prog('ops') > 0 ? Math.sin(c.time * 0.5) * 8 : 0;

    readout = `ALT ${LEO_ALTITUDE_KM} km · ${fmt(LEO_SPEED_KMS, 1)} km/s`;
    caption = ended ? outcome.title : sSteps[Math.max(0, Math.min(k, sSteps.length - 1))]?.text ?? '';

    body = (
      <g>
        <rect width={VW} height={VH} fill="#02030a" />
        {STARS.map((st, i) => <circle key={i} cx={((st.x * VW - c.time * 3 * st.r) % VW + VW) % VW} cy={st.y * 300} r={st.r} fill="#fff" opacity={0.75} />)}
        {/* Earth below: we are 400 km up, so its curve fills the bottom of the view */}
        <circle cx={150} cy={640} r={366} fill="none" stroke="#5aa9ff" strokeWidth={18} opacity={0.18} />
        <circle cx={150} cy={640} r={360} fill="url(#fc-ocean)" />
        {earthBig && <image href={earthBig} x={-210} y={280} width={720} height={720} />}
        <circle cx={150} cy={640} r={361} fill="none" stroke="#8fd0ff" strokeWidth={3} opacity={0.6} />
        {/* Upper stage drifting away after release */}
        <g opacity={1 - smooth(0.6, 1, deployP) * 0.6} transform={`translate(${stageX} ${stageY}) rotate(90) scale(${sS}) translate(${-CX} ${-mid})`}>
          {keep.map(([n]) => <g key={n}>{L.stageNodes.get(n)}</g>)}
        </g>
        {deployP > 0 && deployP < 0.6 && [0, 1, 2].map((i) => (
          <circle key={i} cx={noseX + 8 + i * 6} cy={stageY + (i - 1) * 5} r={2 + deployP * 6} fill="#e8ecf5" opacity={0.5 - deployP * 0.8} />
        ))}
        {/* Signal to Earth */}
        {beaming && [0, 1, 2].map((i) => {
          const ph = (c.time * 0.7 + i / 3) % 1;
          return <path key={i} d={`M${satX - 14 - ph * 26} ${satY + 26 + ph * 70} Q${satX} ${satY + 34 + ph * 78} ${satX + 14 + ph * 26} ${satY + 26 + ph * 70}`}
            fill="none" stroke="#7fe3ff" strokeWidth={2} opacity={0.9 - ph * 0.85} strokeLinecap="round" />;
        })}
        {commsFail && <text x={satX} y={satY + 60} textAnchor="middle" fontSize={11} fontWeight={800} fill="#ff8a8a" opacity={0.5 + 0.5 * Math.sin(c.time * 6)}>NO SIGNAL</text>}
        <g transform={`translate(${satX} ${satY}) rotate(${spin})`}>
          <Satellite partId={satPart} wings={wings} dim={powerFail} />
        </g>
      </g>
    );
  }

  /* ============================== LANDING ============================== */
  if (scene === 'landing') {
    const steps: MissionStep[] = outcome.landingSteps;
    const partIds = (L.fairing?.parts ?? rocket.filter((p) => ['payload', 'power', 'comms', 'landing'].includes(getPart(p.partId).category))).map((p) => p.partId);
    const legs = partIds.includes('landing-legs');
    const hasRover = partIds.includes('rover');

    // Altitude plan per step kind (1 = top of view, 0 = ground)
    const plan = steps.map((st) => st.kind);
    const iTouch = plan.indexOf('touchdown');
    const altAt = (tt: number) => {
      const i = Math.min(Math.floor(tt / stepS), steps.length - 1), f = clamp01(tt / stepS - i);
      const k = plan[i];
      const seg: Record<string, [number, number]> = isMoon
        ? { 'parachute-useless': [1, 0.86], descent: [plan.includes('parachute-useless') ? 0.86 : 1, 0.05], touchdown: [0.05, 0] }
        : { entry: [1, 0.78], parachute: [0.78, 0.5], descent: [0.5, 0.05], touchdown: [0.05, 0] };
      const [a0, a1] = seg[k] ?? [0, 0];
      const e = k === 'touchdown' ? clamp01(f * 3) : 1 - Math.pow(1 - f, 1.6);
      return lerp(a0, a1, e);
    };

    const landingDone = c.mode === 'surface' || c.crashFrom === 'surface' || (c.mode === 'done' && outcome.success);
    const failed = c.crashFrom === 'landing' && sticky;
    const failKind = failed ? steps[c.failStep]?.kind : undefined;
    const tL = landingDone ? iTouch * stepS + stepS : failed ? c.failStep * stepS : c.mode === 'landing' ? c.modeT : 0;
    const i = Math.min(Math.floor(tL / stepS), steps.length - 1);
    const kind = landingDone ? 'touchdown' : (failed ? failKind : plan[i]);
    const f = landingDone ? 1 : clamp01(tL / stepS - i);

    let alt = landingDone ? 0 : altAt(tL);
    let impact = -1; // time since impact
    let tip = 0;
    if (failed) {
      if (failKind === 'touchdown') { alt = 0; tip = smooth(0, 0.9, sinceCrash) * 78; }
      else if (failKind !== 'entry') {
        const a = altAt(c.failStep * stepS) - sinceCrash * sinceCrash * 1.6;
        alt = Math.max(0, a);
        if (a <= 0) impact = sinceCrash - Math.sqrt(altAt(c.failStep * stepS) / 1.6);
      }
    }
    const surfaceY = GROUND - 6;
    const y = surfaceY - alt * 270;
    const capsuleStage = !isMoon && (kind === 'entry' || kind === 'parachute');
    const x = !isMoon && kind === 'entry' && !landingDone ? lerp(40, 150, failed ? 0.5 : f) : 150;
    const entryY = !isMoon && kind === 'entry' && !landingDone ? lerp(30, y, failed ? 0.5 : f) : y;
    const thrust = !failed && !landingDone && c.mode === 'landing' && (isMoon ? kind === 'descent' || kind === 'touchdown' && f < 0.3 : kind === 'descent');
    const deploy = landingDone || kind === 'touchdown' ? 1 : kind === 'descent' ? smooth(0.3, 0.8, f) : 0;
    const dustA = (alt < 0.15 && (thrust || (kind === 'touchdown' && f < 0.8) || tip > 0)) ? (1 - alt / 0.15) : 0;

    // Surface operations
    const sSteps = outcome.surfaceSteps;
    const sk = c.mode === 'surface' ? Math.min(Math.floor(c.modeT / stepS), sSteps.length - 1) : c.crashFrom === 'surface' ? c.failStep : (c.mode === 'done' && outcome.success ? sSteps.length : -1);
    const sf = c.mode === 'surface' ? clamp01(c.modeT / stepS - sk) : 1;
    const powerIdx = sSteps.findIndex((st) => st.kind === 'power');
    const powerOk = sSteps[powerIdx]?.ok;
    const panels = partIds.includes('solar-panel') && powerOk && sk >= powerIdx ? (sk === powerIdx && c.mode === 'surface' ? sf : 1) : 0;
    const commsIdx = sSteps.findIndex((st) => st.kind === 'comms');
    const beaming = sSteps[commsIdx]?.ok && sk >= commsIdx;
    const opsIdx = sSteps.findIndex((st) => st.kind === 'ops');
    const roverT = hasRover && sk >= opsIdx ? (sk === opsIdx && c.mode === 'surface' ? sf : 1) : -1;
    const dim = c.crashFrom === 'surface' && sSteps[c.failStep]?.kind === 'power';

    // Caption
    if (c.mode === 'surface' && sk >= 0) caption = sSteps[sk].text;
    else if (c.crashFrom === 'surface') caption = sSteps[c.failStep]?.text ?? '';
    else if (c.mode === 'done' && outcome.success) caption = `Mission success: we are on ${t.label}!`;
    else caption = failed ? steps[c.failStep].text : steps[Math.max(0, i)]?.text ?? '';
    readout = landingDone ? `g ${t.gravity} m/s²` : `ALT ${fmt(alt * (isMoon ? 15 : 125))} km`;

    const showLander = !(failed && (failKind === 'entry' ? sinceCrash > 0.7 : impact > 0)) && !capsuleStage;
    const showCapsule = capsuleStage && !(failed && (failKind === 'entry' ? sinceCrash > 0.7 : impact > 0));

    body = (
      <g>
        {isMoon ? <MoonGround earthImg={earthImg} /> : <MarsGround />}
        {/* Heat shield dropping away (Mars, after the parachute opens) */}
        {!isMoon && (kind === 'parachute' && f > 0.55 || kind === 'descent' || kind === 'touchdown' || landingDone) && !(failed && failKind === 'parachute') && (() => {
          const dt2 = (kind === 'parachute' ? f - 0.55 : 1) * stepS;
          if (dt2 > 2.2) return null;
          return <g transform={`translate(150 ${lerp(160, 380, clamp01(dt2 / 1.6))}) rotate(${dt2 * 40})`}><path d="M-25 0 H25 L9 9 H-9Z" fill="url(#rk-aero)" /></g>;
        })()}
        {/* Backshell + parachute floating away once the lander drops free */}
        {!isMoon && (kind === 'descent' || kind === 'touchdown') && !landingDone && (() => {
          const k = kind === 'descent' ? f : 1;
          return (
            <g transform={`translate(${150 - k * 90} ${lerp(150, 60, k)})`} opacity={1 - k}>
              <Chute open={1} />
              <Capsule shield={false} glow={0} />
            </g>
          );
        })()}
        {showCapsule && (
          <g transform={`translate(${x} ${entryY}) rotate(${kind === 'entry' ? -35 : 0})`}>
            {kind === 'parachute' && !(failed && failKind === 'parachute') && <Chute open={smooth(0, 0.35, f)} />}
            <Capsule shield glow={kind === 'entry' ? (failed ? 1 : 0.4 + 0.6 * Math.sin(Math.PI * f)) : 0} />
            {kind === 'entry' && <line x1={-30} y1={-50} x2={-130} y2={-130} stroke="url(#fc-trail)" strokeWidth={10} strokeLinecap="round" />}
          </g>
        )}
        {failed && failKind === 'entry' && <Explosion x={x} y={entryY} t={Math.max(0, sinceCrash - 0.5)} />}
        {isMoon && plan.includes('parachute-useless') && (kind === 'parachute-useless' || (kind === 'descent' && f < 0.5)) && !landingDone && (
          <g transform={`translate(150 ${y - 70})`} opacity={kind === 'descent' ? 1 - f * 2 : 1}>
            <path d="M-10 -6 Q-4 -18 2 -8 Q8 -20 12 -5 L6 4 H-6Z" fill="#e8ecf0" stroke="#9aa2ac" strokeWidth={0.6} />
            <line x1={-4} y1={4} x2={-2} y2={30} stroke="#9aa2ac" strokeWidth={0.6} /><line x1={4} y1={4} x2={2} y2={30} stroke="#9aa2ac" strokeWidth={0.6} />
          </g>
        )}
        {dustA > 0 && DUST.map((d, k) => (
          <ellipse key={k} cx={150 + d.dx * (1 + (c.time % 1.2))} cy={surfaceY - d.dy} rx={d.r * (1 + (c.time % 1.2))} ry={d.r * 0.35}
            fill={isMoon ? '#c9ccd2' : '#d79a6c'} opacity={dustA * (0.6 - (c.time % 1.2) * 0.4)} />
        ))}
        {beaming && [0, 1, 2].map((k) => {
          const ph = (c.time * 0.8 + k / 3) % 1;
          const bx = lerp(150, isMoon ? 245 : 260, ph), by = lerp(y - 90, isMoon ? 62 : 20, ph);
          return <circle key={k} cx={bx} cy={by} r={3 + ph * 8} fill="none" stroke="#7fd4ff" strokeWidth={1.8} opacity={0.9 - ph * 0.8} />;
        })}
        {roverT >= 0 && (
          <g transform={`translate(${150 + 50 + roverT * 50} ${surfaceY})`}>
            <PayloadItem partId="rover" cx={0} y={-30} w={40} h={30} />
          </g>
        )}
        {showLander && (
          <g transform={`translate(150 ${y}) rotate(${tip} ${tip ? 36 : 0} 0)`}>
            <Lander partIds={partIds} legs={legs} deploy={deploy} thrust={thrust} time={c.time} panels={panels}
              roverOut={roverT >= 0} dim={dim} />
          </g>
        )}
        {impact > 0 && <Explosion x={150} y={surfaceY - 8} t={impact} />}
      </g>
    );
  }

  // Parts status chips
  const chips: { label: string; state: 'on' | 'gone' | 'burn' }[] = [];
  stageNums.forEach((n) => {
    const gone = n - 1 < sepCount;
    chips.push({ label: `Stage ${n}`, state: gone ? 'burn' : 'on' });
  });
  if (L.fairing) chips.push({ label: 'Fairing', state: fairingOff ? 'gone' : 'on' });
  chips.push({ label: 'Payload', state: 'on' });

  const sceneLabel = scene === 'ascent' ? 'ASCENT' : scene === 'space' ? 'SPACE' : scene === 'orbit' ? 'IN ORBIT' : isMoon ? 'LANDING' : 'MARS EDL';

  return (
    <div className="flight-cam" aria-label="Flight camera">
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice">
        <Defs />
        <CamDefs />
        {body}
      </svg>
      <div className="fc-top">
        <span className="fc-rec" /> CAM · {sceneLabel}
        <span className="fc-readout">{readout}</span>
      </div>
      <div className="fc-bottom">
        <div className="fc-caption">{caption}</div>
        <div className="fc-chips">
          {chips.map((ch) => (
            <span key={ch.label} className={`fc-chip ${ch.state}`}>
              {ch.label}: {ch.state === 'on' ? 'attached' : ch.state === 'burn' ? 'dropped, burned up' : 'jettisoned'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Static scenery                                                            */
/* ------------------------------------------------------------------------- */
let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const STARS = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.1 + 0.3 }));
const CLOUDS = Array.from({ length: 7 }, (_, i) => ({ x: rnd() * 300, y: 60 - i * 90 - rnd() * 40, rx: 30 + rnd() * 50 }));
const SMOKE = Array.from({ length: 9 }, (_, i) => ({ dx: (i - 4) * 16, dy: rnd() * 14, r: 18 + rnd() * 16 }));
const DUST = Array.from({ length: 6 }, (_, i) => ({ dx: (i - 2.5) * 30, dy: rnd() * 6, r: 18 + rnd() * 12 }));
const CRATERS = Array.from({ length: 9 }, () => ({ x: rnd() * 300, y: 345 + rnd() * 50, r: 4 + rnd() * 16 }));
const ROCKS = Array.from({ length: 16 }, () => ({ x: rnd() * 300, y: 342 + rnd() * 55, r: 1.5 + rnd() * 4 }));

/** Vector Kennedy-style launch site, used if public/launch-site.png is missing. */
function LaunchSite() {
  return (
    <g>
      <rect width={VW} height={270} fill="url(#fc-site-sky)" />
      <rect y={262} width={VW} height={12} fill="#2f6fa8" />
      <rect y={272} width={VW} height={VH - 272} fill="url(#fc-land)" />
      <rect x={40} y={232} width={26} height={40} fill="#e9edf1" />
      <rect x={44} y={238} width={18} height={4} fill="#3060a8" />
      <rect x={66} y={252} width={14} height={20} fill="#dfe4e9" />
      <circle cx={250} cy={248} r={5} fill="#f3f5f7" /><rect x={249} y={252} width={2} height={18} fill="#cfd5db" />
      <ellipse cx={110} cy={286} rx={30} ry={4} fill="#4f8fbf" opacity={0.7} />
      <path d={`M60 ${GROUND} L95 300 H205 L240 ${GROUND} V${VH} H60Z`} fill="#c4c9ce" />
      <path d={`M0 ${GROUND + 10} H300 V${VH} H0Z`} fill="#b9bfc5" />
      <rect x={130} y={GROUND} width={40} height={VH - GROUND} fill="#5b6168" />
      <rect x={136} y={GROUND} width={28} height={VH - GROUND} fill="#2b2f34" />
    </g>
  );
}

function MoonGround({ earthImg }: { earthImg: string | null }) {
  return (
    <g>
      <rect width={VW} height={VH} fill="#010207" />
      {STARS.map((st, i) => <circle key={i} cx={st.x * VW} cy={st.y * 300} r={st.r} fill="#fff" opacity={0.85} />)}
      {earthImg && <image href={earthImg} x={222} y={40} width={44} height={44} />}
      <path d="M0 300 Q50 292 90 298 T180 296 T300 300 V340 H0Z" fill="#5d6066" />
      <path d={`M0 ${GROUND - 4} Q60 ${GROUND - 10} 130 ${GROUND - 5} T300 ${GROUND - 6} V${VH} H0Z`} fill="url(#fc-regolith)" />
      {CRATERS.map((cr, i) => <ellipse key={i} cx={cr.x} cy={cr.y} rx={cr.r} ry={cr.r * 0.28} fill="#6c6f75" stroke="#a7abb2" strokeWidth={0.7} />)}
    </g>
  );
}

function MarsGround() {
  return (
    <g>
      <rect width={VW} height={VH} fill="url(#fc-mars-sky)" />
      <path d="M0 290 L40 270 L85 285 L140 262 L190 284 L240 268 L300 286 V340 H0Z" fill="#a85c36" />
      <path d={`M0 ${GROUND - 4} Q70 ${GROUND - 12} 150 ${GROUND - 5} T300 ${GROUND - 8} V${VH} H0Z`} fill="url(#fc-mars-ground)" />
      {ROCKS.map((r, i) => <ellipse key={i} cx={r.x} cy={r.y} rx={r.r} ry={r.r * 0.6} fill="#5e2a16" />)}
    </g>
  );
}

function Chute({ open }: { open: number }) {
  if (open <= 0) return null;
  const w = 44 * open;
  return (
    <g>
      {[-1, -0.4, 0.4, 1].map((k) => <line key={k} x1={k * w * 0.9} y1={-92} x2={k * 6} y2={-26} stroke="#d9dde2" strokeWidth={0.6} />)}
      <path d={`M${-w} -88 Q0 ${-88 - 46 * open} ${w} -88 Q0 -98 ${-w} -88Z`} fill="#f4f1ea" stroke="#c9ced4" strokeWidth={0.6} />
      <path d={`M${-w * 0.5} -91 Q0 ${-88 - 40 * open} ${w * 0.5} -91`} fill="none" stroke="#e2643a" strokeWidth={3} opacity={0.8} />
    </g>
  );
}

function CamDefs() {
  return (
    <defs>
      <linearGradient id="fc-flame" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#ffffff" /><stop offset="0.15" stopColor="#fff1b8" />
        <stop offset="0.45" stopColor="#ffb347" /><stop offset="0.8" stopColor="#ff5a1f" stopOpacity="0.6" />
        <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="fc-plasma">
        <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" /><stop offset="0.4" stopColor="#ff9a3c" stopOpacity="0.7" />
        <stop offset="1" stopColor="#ff4d1a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="fc-heat" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#ff4d1a" stopOpacity="0.2" /><stop offset="1" stopColor="#ffb347" />
      </linearGradient>
      <radialGradient id="fc-boom">
        <stop offset="0" stopColor="#fff6c8" /><stop offset="0.35" stopColor="#ffb347" />
        <stop offset="0.7" stopColor="#ff4d1a" stopOpacity="0.6" /><stop offset="1" stopColor="#5a1a08" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="fc-trail" x1="1" x2="0" y1="1" y2="0">
        <stop offset="0" stopColor="#ffb347" stopOpacity="0.9" /><stop offset="1" stopColor="#ff4d1a" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="fc-ocean" cx="0.5" cy="0" r="0.6">
        <stop offset="0" stopColor="#5fa8e8" /><stop offset="0.4" stopColor="#1d4f96" /><stop offset="1" stopColor="#0a1f45" />
      </radialGradient>
      <linearGradient id="fc-site-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#1f5fb8" /><stop offset="1" stopColor="#bfe0ff" />
      </linearGradient>
      <linearGradient id="fc-land" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#5f7f4c" /><stop offset="1" stopColor="#8a9a66" />
      </linearGradient>
      <linearGradient id="fc-regolith" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#9a9da3" /><stop offset="1" stopColor="#55585e" />
      </linearGradient>
      <linearGradient id="fc-mars-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#8f5a3c" /><stop offset="1" stopColor="#e7b78d" />
      </linearGradient>
      <linearGradient id="fc-mars-ground" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#c06c40" /><stop offset="1" stopColor="#7a361b" />
      </linearGradient>
      <clipPath id="fc-half-l"><rect x={-2000} y={-2000} width={2000 + CX} height={6000} /></clipPath>
      <clipPath id="fc-half-r"><rect x={CX} y={-2000} width={4000} height={6000} /></clipPath>
    </defs>
  );
}
