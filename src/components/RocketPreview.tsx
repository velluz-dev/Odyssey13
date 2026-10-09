import type { ReactNode } from 'react';
import type { PartCategory } from '../data/parts';
import { fmt, getPart, type PlacedPart, type RocketAnalysis } from '../logic/validation';

/*
 * Realistic, modular rocket preview.
 *
 * The stack (top → bottom) is turned into drawing "blocks":
 *   - fairing : the leading run of payload/power/comms/landing parts, drawn inside a
 *               pointed cutaway payload fairing
 *   - tank    : a cylinder section (white/grey cylindrical gradient)
 *   - engines : consecutive engines in one stage, clustered side by side under an engine skirt
 *   - decoupler: a black interstage band (tapers when the stage above is narrower)
 *   - module  : any other part placed between tanks, drawn at the stage's width
 * Every stage has one constant body width, so the rocket stays tall and slender.
 */

const VIEW_W = 240;
export const CX = 162;

/** Body diameter (SVG units) per stage: Stage 1 is the widest. */
export const stageWidth = (n: number) => [72, 56, 46][Math.min(Math.max(n, 1), 3) - 1];

const PAYLOAD_CATS: PartCategory[] = ['payload', 'power', 'comms', 'landing'];
const TANK_H: Record<string, number> = { 'tank-small': 44, 'tank-large': 110, 'tank-heavy': 230 };
const BAY_H: Record<string, number> = {
  'probe-core': 34, rover: 32, cubesat: 18, 'comms-sat': 40, telescope: 56, 'solar-panel': 22, rtg: 20, antenna: 18,
  'heat-shield': 12, parachute: 18, 'landing-legs': 20,
};
const DECOUPLER_H = 22;
const SKIRT_H = 10;

type Rect = { x: number; y: number; w: number; h: number };
type Block =
  | { kind: 'fairing'; parts: PlacedPart[]; stage: number }
  | { kind: 'tank'; part: PlacedPart; stage: number; band: 'top' | 'bottom' | 'both' | null; letters: boolean }
  | { kind: 'engines'; parts: PlacedPart[]; stage: number }
  | { kind: 'decoupler'; part: PlacedPart; stage: number }
  | { kind: 'module'; part: PlacedPart; stage: number };

const cat = (p: PlacedPart) => getPart(p.partId).category;

/** Group the stack into drawable blocks (pure). */
function toBlocks(rocket: PlacedPart[], stageOf: Map<string, number>): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < rocket.length && PAYLOAD_CATS.includes(cat(rocket[i]))) i++;
  if (i > 0) blocks.push({ kind: 'fairing', parts: rocket.slice(0, i), stage: stageOf.get(rocket[0].uid) ?? 1 });

  while (i < rocket.length) {
    const p = rocket[i];
    const stage = stageOf.get(p.uid) ?? 1;
    const c = cat(p);
    if (c === 'engine') {
      const parts = [p];
      while (i + 1 < rocket.length && cat(rocket[i + 1]) === 'engine' && stageOf.get(rocket[i + 1].uid) === stage) parts.push(rocket[++i]);
      blocks.push({ kind: 'engines', parts, stage });
    } else if (c === 'tank') blocks.push({ kind: 'tank', part: p, stage, band: null, letters: false });
    else if (c === 'decoupler') blocks.push({ kind: 'decoupler', part: p, stage });
    else blocks.push({ kind: 'module', part: p, stage });
    i++;
  }

  // Stage 1 gets the black/white roll pattern on its first and last tank, and lettering on its first tall tank.
  const s1Tanks = blocks.filter((b): b is Extract<Block, { kind: 'tank' }> => b.kind === 'tank' && b.stage === 1);
  if (s1Tanks.length) {
    const first = s1Tanks[0], last = s1Tanks[s1Tanks.length - 1];
    first.band = first === last ? 'both' : 'top';
    if (first !== last) last.band = 'bottom';
    const tall = s1Tanks.find((t) => (TANK_H[t.part.partId] ?? 0) >= 100);
    if (tall) tall.letters = true;
  }
  return blocks;
}

function engineSize(partId: string, W: number, n: number) {
  if (partId === 'engine-launch') {
    const bw = Math.min(W * 0.62, (W * 1.0) / n);
    return { bw, bh: bw * 1.25 };
  }
  const bw = Math.min(W * 0.5, (W * 0.9) / n);
  return { bw, bh: bw * 1.65 };
}

function blockHeight(b: Block): number {
  const W = stageWidth(b.stage);
  switch (b.kind) {
    case 'fairing': {
      const Wf = W + 10;
      return Wf * 1.25 + b.parts.reduce((s, p) => s + (BAY_H[p.partId] ?? 22), 0) + 12 + 8;
    }
    case 'tank': return TANK_H[b.part.partId] ?? 60;
    case 'engines': return SKIRT_H + Math.max(...b.parts.map((p) => engineSize(p.partId, W, b.parts.length).bh));
    case 'decoupler': return DECOUPLER_H;
    case 'module': return BAY_H[b.part.partId] ?? 22;
  }
}

/** Gradient + pattern definitions shared by all parts. */
export function Defs() {
  const lin = (id: string, stops: [number, string][], vertical = false) => (
    <linearGradient id={id} x1="0" x2={vertical ? '0' : '1'} y1="0" y2={vertical ? '1' : '0'}>
      {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
    </linearGradient>
  );
  return (
    <defs>
      {lin('rk-cyl', [[0, '#8b939e'], [0.16, '#d9dee4'], [0.4, '#ffffff'], [0.6, '#eef1f4'], [0.84, '#b4bbc4'], [1, '#6a727d']])}
      {lin('rk-shade', [[0, 'rgba(0,0,0,0.5)'], [0.3, 'rgba(0,0,0,0.04)'], [0.42, 'rgba(255,255,255,0.14)'], [0.6, 'rgba(0,0,0,0.04)'], [1, 'rgba(0,0,0,0.55)']])}
      {lin('rk-band', [[0, '#05070a'], [0.4, '#2c3139'], [0.5, '#3c434d'], [0.65, '#1c2026'], [1, '#040506']])}
      {lin('rk-metal', [[0, '#3a4048'], [0.2, '#9aa2ac'], [0.38, '#eef1f4'], [0.55, '#b7bec7'], [0.8, '#6b737d'], [1, '#2b3037']])}
      {lin('rk-skirt', [[0, '#1d2127'], [0.4, '#4a515b'], [0.55, '#5b636e'], [1, '#15181c']])}
      {lin('rk-gold', [[0, '#7a5410'], [0.25, '#d7a531'], [0.42, '#fff0b0'], [0.6, '#e9c35a'], [0.8, '#b08022'], [1, '#6a4a0e']])}
      {lin('rk-panel', [[0, '#081a3c'], [0.45, '#17468f'], [0.55, '#1d56a8'], [1, '#081a3c']])}
      {lin('rk-aero', [[0, '#24180f'], [0.4, '#6e4a2c'], [0.52, '#9a663b'], [0.7, '#4f3520'], [1, '#1d140c']])}
      {lin('rk-interior', [[0, '#060b18'], [0.5, '#0f1a33'], [1, '#060b18']])}
      {lin('rk-pad', [[0, '#2b3550'], [1, '#141a2b']], true)}
    </defs>
  );
}

/** A payload-bay item, drawn inside the fairing (or as a module). */
export function PayloadItem({ partId, cx, y, w, h }: { partId: string; cx: number; y: number; w: number; h: number }): ReactNode {
  const b = y + h;
  switch (partId) {
    case 'probe-core': {
      const bw = w * 0.72;
      return (
        <g>
          <rect x={cx - bw / 2} y={y + 3} width={bw} height={h - 4} rx={2} fill="url(#rk-gold)" stroke="#5a3d08" strokeWidth={0.6} />
          <path d={`M${cx - bw / 2 + 3} ${y + h * 0.35} l${bw * 0.25} -3 l${bw * 0.2} 4 l${bw * 0.3} -3 M${cx - bw / 2 + 4} ${y + h * 0.7} l${bw * 0.3} 3 l${bw * 0.25} -4 l${bw * 0.2} 2`}
            fill="none" stroke="#fff3c0" strokeOpacity={0.55} strokeWidth={0.7} />
          <rect x={cx - 5} y={y + h * 0.45} width={10} height={8} rx={1} fill="#14171c" />
          <circle cx={cx} cy={y + h * 0.45 + 4} r={2.2} fill="#7fd4ff" />
          <rect x={cx - 2} y={y} width={4} height={4} fill="#b9c0c8" />
        </g>
      );
    }
    case 'cubesat': {
      const bw = Math.min(w * 0.36, 16);
      return (
        <g>
          <rect x={cx - bw / 2} y={y + 2} width={bw} height={h - 4} rx={1} fill="url(#rk-cyl)" stroke="#6a727d" strokeWidth={0.6} />
          {[0.33, 0.66].map((k) => <line key={k} x1={cx - bw / 2} x2={cx + bw / 2} y1={y + 2 + (h - 4) * k} y2={y + 2 + (h - 4) * k} stroke="#6a727d" strokeWidth={0.5} />)}
          <rect x={cx - bw / 2 + 2} y={y + 4} width={bw - 4} height={(h - 8) / 3} fill="url(#rk-panel)" />
        </g>
      );
    }
    case 'comms-sat': {
      const bw = w * 0.52;
      return (
        <g>
          <rect x={cx - bw / 2} y={y + 8} width={bw} height={h - 10} rx={2} fill="url(#rk-gold)" stroke="#5a3d08" strokeWidth={0.6} />
          <path d={`M${cx - bw / 2 + 3} ${y + h * 0.45} l${bw * 0.3} -3 l${bw * 0.25} 4 l${bw * 0.3} -3`} fill="none" stroke="#fff3c0" strokeOpacity={0.5} strokeWidth={0.7} />
          {[-1, 1].map((s) => <rect key={s} x={s < 0 ? cx - w * 0.47 : cx + bw / 2 + 1} y={y + 10} width={w * 0.47 - bw / 2 - 1} height={h - 14} fill="url(#rk-panel)" stroke="#c9ced4" strokeWidth={0.5} />)}
          <path d={`M${cx - 10} ${y + 8} Q${cx} ${y - 2} ${cx + 10} ${y + 8}Z`} fill="url(#rk-cyl)" stroke="#8b939e" strokeWidth={0.5} />
        </g>
      );
    }
    case 'telescope': {
      const bw = w * 0.5;
      return (
        <g>
          <rect x={cx - bw / 2} y={y + 2} width={bw} height={h * 0.62} rx={2} fill="url(#rk-cyl)" stroke="#7d858f" strokeWidth={0.6} />
          <rect x={cx - bw / 2 + 1} y={y + 2} width={bw - 2} height={4} fill="#14171c" />
          <rect x={cx - bw / 2} y={y + 2 + h * 0.62} width={bw} height={h * 0.34} rx={2} fill="url(#rk-gold)" stroke="#5a3d08" strokeWidth={0.6} />
          {[-1, 1].map((s) => <rect key={s} x={s < 0 ? cx - bw / 2 - 5 : cx + bw / 2 + 1} y={y + 6} width={4} height={h - 12} fill="url(#rk-panel)" stroke="#c9ced4" strokeWidth={0.4} />)}
        </g>
      );
    }
    case 'rover': {
      const bw = w * 0.78;
      return (
        <g>
          <line x1={cx - bw * 0.25} x2={cx - bw * 0.25} y1={y + 1} y2={y + h * 0.35} stroke="#c9ced4" strokeWidth={1.4} />
          <rect x={cx - bw * 0.25 - 4} y={y} width={8} height={4} rx={1} fill="#e8ecf0" />
          <rect x={cx - bw / 2} y={y + h * 0.3} width={bw} height={h * 0.38} rx={2} fill="url(#rk-cyl)" stroke="#7d858f" strokeWidth={0.6} />
          <rect x={cx - bw / 2 + 2} y={y + h * 0.3 + 2} width={bw * 0.35} height={h * 0.38 - 4} fill="url(#rk-gold)" />
          {[-1, 0, 1].map((k) => <circle key={k} cx={cx + k * bw * 0.36} cy={b - 4.5} r={4} fill="#22262c" stroke="#8b939e" strokeWidth={0.8} />)}
        </g>
      );
    }
    case 'solar-panel': {
      const pw = w * 0.94, ph = h - 4, x0 = cx - pw / 2, y0 = y + 2;
      const cols = 8, rows = 3;
      return (
        <g>
          <rect x={x0} y={y0} width={pw} height={ph} fill="url(#rk-panel)" stroke="#c9ced4" strokeWidth={0.8} />
          {Array.from({ length: cols - 1 }, (_, i) => <line key={`c${i}`} x1={x0 + (pw * (i + 1)) / cols} x2={x0 + (pw * (i + 1)) / cols} y1={y0} y2={y0 + ph} stroke="#6f9be0" strokeOpacity={0.55} strokeWidth={0.5} />)}
          {Array.from({ length: rows - 1 }, (_, i) => <line key={`r${i}`} x1={x0} x2={x0 + pw} y1={y0 + (ph * (i + 1)) / rows} y2={y0 + (ph * (i + 1)) / rows} stroke="#6f9be0" strokeOpacity={0.55} strokeWidth={0.5} />)}
          <line x1={cx} x2={cx} y1={y0} y2={y0 + ph} stroke="#c9ced4" strokeWidth={1} />
        </g>
      );
    }
    case 'rtg':
      return (
        <g>
          <rect x={cx - 5} y={y + 2} width={10} height={h - 4} rx={2} fill="url(#rk-band)" />
          {[0, 1, 2, 3].map((i) => <line key={i} x1={cx - 11} x2={cx + 11} y1={y + 5 + i * ((h - 10) / 3)} y2={y + 5 + i * ((h - 10) / 3)} stroke="#4a515b" strokeWidth={1.6} />)}
        </g>
      );
    case 'antenna':
      return (
        <g>
          <path d={`M${cx - w * 0.38} ${y + 3} Q${cx} ${b + 2} ${cx + w * 0.38} ${y + 3}Z`} fill="url(#rk-cyl)" stroke="#8b939e" strokeWidth={0.6} />
          <line x1={cx} x2={cx} y1={y + h * 0.7} y2={y} stroke="#c9ced4" strokeWidth={1} />
          <circle cx={cx} cy={y + 1} r={1.6} fill="#e8ecf0" />
        </g>
      );
    case 'heat-shield':
      return <path d={`M${cx - w * 0.49} ${y} H${cx + w * 0.49} L${cx + w * 0.18} ${b} H${cx - w * 0.18}Z`} fill="url(#rk-aero)" stroke="#1d140c" strokeWidth={0.6} />;
    case 'parachute':
      return (
        <g>
          <path d={`M${cx - w * 0.42} ${b} L${cx - w * 0.16} ${y + 3} H${cx + w * 0.16} L${cx + w * 0.42} ${b}Z`} fill="url(#rk-cyl)" stroke="#7d858f" strokeWidth={0.6} />
          <rect x={cx - w * 0.12} y={y} width={w * 0.24} height={5} rx={1} fill="#e9eef3" stroke="#7d858f" strokeWidth={0.5} />
        </g>
      );
    case 'landing-legs':
      return (
        <g>
          <rect x={cx - w * 0.3} y={y + 1} width={w * 0.6} height={h * 0.45} rx={1.5} fill="url(#rk-gold)" />
          {[-1, 1].map((s) => (
            <g key={s} stroke="#c9ced4" strokeWidth={1.3} strokeLinecap="round">
              <line x1={cx + s * w * 0.22} y1={y + h * 0.4} x2={cx + s * w * 0.46} y2={b - 1} />
              <line x1={cx + s * w * 0.4} y1={b - 1} x2={cx + s * w * 0.5} y2={b - 1} />
            </g>
          ))}
        </g>
      );
    default:
      return <rect x={cx - w * 0.35} y={y + 2} width={w * 0.7} height={h - 4} rx={2} fill="url(#rk-cyl)" />;
  }
}

/** Bell nozzle: narrow throat flaring to a wide exit. */
export function Bell({ cx, y, bw, bh }: { cx: number; y: number; bw: number; bh: number }) {
  const tw = bw * 0.32, y1 = y + bh;
  return (
    <g>
      <rect x={cx - tw * 0.8} y={y} width={tw * 1.6} height={bh * 0.16} rx={1} fill="url(#rk-skirt)" />
      <path d={`M${cx - tw / 2} ${y + bh * 0.14} C${cx - tw / 2} ${y + bh * 0.55} ${cx - bw * 0.43} ${y1 - bh * 0.28} ${cx - bw / 2} ${y1}
        H${cx + bw / 2} C${cx + bw * 0.43} ${y1 - bh * 0.28} ${cx + tw / 2} ${y + bh * 0.55} ${cx + tw / 2} ${y + bh * 0.14}Z`}
        fill="url(#rk-metal)" stroke="#2b3037" strokeWidth={0.6} />
      <ellipse cx={cx} cy={y1} rx={bw / 2} ry={Math.max(1.2, bw * 0.07)} fill="#14171c" stroke="#5b636e" strokeWidth={0.5} />
    </g>
  );
}

export interface EngineMount { cx: number; y: number; bw: number; launch: boolean }
export interface FairingArt {
  stage: number; y: number; h: number; L: number; R: number; bodyTop: number; parts: PlacedPart[];
  back: ReactNode; items: ReactNode; shell: ReactNode;
}
export interface RocketLayout {
  /** Drawn blocks per stage (excluding the fairing) */
  stageNodes: Map<number, ReactNode[]>;
  /** Engine bell exits per stage, for exhaust plumes */
  engines: Map<number, EngineMount[]>;
  /** Vertical extent per stage, in rocket units */
  stageSpan: Map<number, [number, number]>;
  fairing: FairingArt | null;
  itemRect: Map<string, Rect>;
  blockSpan: Map<string, [number, number]>;
  /** y of the rocket's base */
  bottom: number;
}

/** Lay out and draw the rocket as separable pieces (shared by the build preview and the flight camera). */
export function layoutRocket(rocket: PlacedPart[], analysis: RocketAnalysis): RocketLayout {
  const stageOf = new Map<string, number>();
  analysis.stages.forEach((st) => st.uids.forEach((u) => stageOf.set(u, st.number)));
  const blocks = toBlocks(rocket, stageOf);

  const TOP = 10;
  const itemRect = new Map<string, Rect>();    // per-part box, for selection
  const blockSpan = new Map<string, [number, number]>(); // per-part block extent, for stage brackets
  const stageNodes = new Map<number, ReactNode[]>();
  const engines = new Map<number, EngineMount[]>();
  const stageSpan = new Map<number, [number, number]>();
  let fairing: FairingArt | null = null;
  const add = (stage: number, node: ReactNode) => { if (!stageNodes.has(stage)) stageNodes.set(stage, []); stageNodes.get(stage)!.push(node); };
  let y = TOP;

  blocks.forEach((b, bi) => {
    const h = blockHeight(b);
    const W = stageWidth(b.stage);
    const key = `b${bi}`;

    if (b.kind === 'fairing') {
      const Wf = W + 10, noseH = Wf * 1.25, bodyTop = y + noseH, bodyBot = y + h - 8;
      const L = CX - Wf / 2, R = CX + Wf / 2;
      const shell = `M${L} ${bodyBot} V${bodyTop} C${L} ${bodyTop - noseH * 0.55} ${CX - Wf * 0.2} ${y + noseH * 0.06} ${CX} ${y}
        C${CX + Wf * 0.2} ${y + noseH * 0.06} ${R} ${bodyTop - noseH * 0.55} ${R} ${bodyTop} V${bodyBot} L${CX + W / 2} ${y + h} H${CX - W / 2}Z`;
      const nose = `M${L} ${bodyTop + 6} V${bodyTop} C${L} ${bodyTop - noseH * 0.55} ${CX - Wf * 0.2} ${y + noseH * 0.06} ${CX} ${y}
        C${CX + Wf * 0.2} ${y + noseH * 0.06} ${R} ${bodyTop - noseH * 0.55} ${R} ${bodyTop} V${bodyTop + 6}Z`;
      const items: ReactNode[] = [];
      let iy = bodyTop + 8;
      for (const p of b.parts) {
        const ih = BAY_H[p.partId] ?? 22;
        items.push(<PayloadItem key={p.uid} partId={p.partId} cx={CX} y={iy} w={Wf - 10} h={ih} />);
        itemRect.set(p.uid, { x: L, y: iy, w: Wf, h: ih });
        blockSpan.set(p.uid, [y, y + h]);
        iy += ih;
      }
      fairing = {
        stage: b.stage, y, h, L, R, bodyTop, parts: b.parts,
        back: <path key={`${key}-back`} d={shell} fill="url(#rk-interior)" />,
        items: <g key={`${key}-items`}>{items}</g>,
        shell: (
        <g key={`${key}-shell`}>
          <path d={nose} fill="url(#rk-cyl)" />
          <rect x={L} y={bodyTop} width={3.5} height={bodyBot - bodyTop} fill="url(#rk-band)" />
          <rect x={R - 3.5} y={bodyTop} width={3.5} height={bodyBot - bodyTop} fill="url(#rk-band)" />
          <path d={`M${L} ${bodyBot} L${CX - W / 2} ${y + h} H${CX + W / 2} L${R} ${bodyBot}Z`} fill="url(#rk-cyl)" />
          <line x1={CX} x2={CX} y1={y + 3} y2={bodyTop + 5} stroke="#8b939e" strokeWidth={0.6} />
          <path d={shell} fill="none" stroke="#8b939e" strokeWidth={0.8} />
        </g>),
      };
    } else if (b.kind === 'tank') {
      const x0 = CX - W / 2;
      const bh = Math.min(26, h * 0.22);
      const band = (by: number, flip: boolean) => (
        <g>
          <rect x={flip ? CX : x0} y={by} width={W / 2} height={bh / 2} fill="#14171b" />
          <rect x={flip ? x0 : CX} y={by + bh / 2} width={W / 2} height={bh / 2} fill="#14171b" />
          <rect x={x0} y={by} width={W} height={bh} fill="url(#rk-shade)" />
        </g>
      );
      add(b.stage,
        <g key={key}>
          <rect x={x0} y={y} width={W} height={h} fill="url(#rk-cyl)" />
          {(b.band === 'top' || b.band === 'both') && band(y + 6, false)}
          {(b.band === 'bottom' || b.band === 'both') && band(y + h - bh - 6, true)}
          {b.letters && (
            <text x={CX} y={y + h * 0.58} fill="#2b3037" fontSize={W * 0.17} fontWeight={800} letterSpacing={W * 0.03}
              textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${CX} ${y + h * 0.58})`}>ODYSSEY13</text>
          )}
          <line x1={x0} x2={x0 + W} y1={y + 0.5} y2={y + 0.5} stroke="#5b636e" strokeWidth={0.8} />
          <rect x={x0} y={y} width={W} height={h} fill="none" stroke="#6a727d" strokeWidth={0.6} />
        </g>,
      );
      itemRect.set(b.part.uid, { x: x0, y, w: W, h });
      blockSpan.set(b.part.uid, [y, y + h]);
    } else if (b.kind === 'engines') {
      const n = b.parts.length;
      const sizes = b.parts.map((p) => engineSize(p.partId, W, n));
      const pitch = Math.max(...sizes.map((s) => s.bw)) * 1.04;
      add(b.stage,
        <g key={key}>
          <path d={`M${CX - W / 2} ${y} H${CX + W / 2} L${CX + W * 0.42} ${y + SKIRT_H} H${CX - W * 0.42}Z`} fill="url(#rk-skirt)" />
          {b.parts.map((p, j) => {
            const ecx = CX + (j - (n - 1) / 2) * pitch;
            const { bw, bh } = sizes[j];
            itemRect.set(p.uid, { x: ecx - bw / 2, y, w: bw, h: SKIRT_H + bh });
            blockSpan.set(p.uid, [y, y + h]);
            if (!engines.has(b.stage)) engines.set(b.stage, []);
            engines.get(b.stage)!.push({ cx: ecx, y: y + SKIRT_H + bh, bw, launch: p.partId === 'engine-launch' });
            return <Bell key={p.uid} cx={ecx} y={y + SKIRT_H} bw={bw} bh={bh} />;
          })}
        </g>,
      );
    } else if (b.kind === 'decoupler') {
      const upper = analysis.stages.some((s) => s.number === b.stage + 1) ? stageWidth(b.stage + 1) : W;
      add(b.stage,
        <g key={key}>
          <path d={`M${CX - upper / 2} ${y} H${CX + upper / 2} L${CX + W / 2} ${y + h} H${CX - W / 2}Z`} fill="url(#rk-band)" />
          <line x1={CX - upper / 2} x2={CX + upper / 2} y1={y + 0.6} y2={y + 0.6} stroke="#9aa2ac" strokeWidth={0.8} />
          <line x1={CX - W / 2} x2={CX + W / 2} y1={y + h - 0.6} y2={y + h - 0.6} stroke="#9aa2ac" strokeWidth={0.8} />
        </g>,
      );
      itemRect.set(b.part.uid, { x: CX - W / 2, y, w: W, h });
      blockSpan.set(b.part.uid, [y, y + h]);
    } else {
      add(b.stage,
        <g key={key}>
          <rect x={CX - W / 2} y={y} width={W} height={h} fill="url(#rk-interior)" stroke="#6a727d" strokeWidth={0.6} />
          <PayloadItem partId={b.part.partId} cx={CX} y={y} w={W} h={h} />
        </g>,
      );
      itemRect.set(b.part.uid, { x: CX - W / 2, y, w: W, h });
      blockSpan.set(b.part.uid, [y, y + h]);
    }
    const sp = stageSpan.get(b.stage);
    stageSpan.set(b.stage, sp ? [Math.min(sp[0], y), Math.max(sp[1], y + h)] : [y, y + h]);
    y += h;
  });
  return { stageNodes, engines, stageSpan, fairing: fairing as FairingArt | null, itemRect, blockSpan, bottom: y };
}


/** Rocket preview with stage brackets and per-stage Δv labels. */
export default function RocketPreview({ rocket, analysis, selected }: {
  rocket: PlacedPart[];
  analysis: RocketAnalysis;
  selected?: string | null;
}) {
  if (rocket.length === 0) {
    return (
      <div className="preview-empty">
        <svg viewBox="0 0 120 160" width="90" aria-hidden="true">
          <path d="M60 10 C75 30 82 60 82 100 H38 C38 60 45 30 60 10Z" fill="none" stroke="#3a4766" strokeWidth="2" strokeDasharray="6 5" />
          <path d="M45 100 L35 130 H85 L75 100Z" fill="none" stroke="#3a4766" strokeWidth="2" strokeDasharray="6 5" />
        </svg>
        <p>Click parts on the left to start stacking your rocket.<br />Or load an example build.</p>
      </div>
    );
  }

  const L = layoutRocket(rocket, analysis);
  const { itemRect, blockSpan } = L;
  const drawn: ReactNode[] = [];
  [...L.stageNodes.keys()].sort((a, b) => a - b).forEach((st) => drawn.push(...L.stageNodes.get(st)!));
  if (L.fairing) drawn.push(L.fairing.back, L.fairing.items, L.fairing.shell);
  const y = L.bottom;

  const padY = y;
  const totalH = padY + 26;
  const fs = Math.min(26, Math.max(11, totalH / 46)); // label size scales with rocket height so it stays readable
  const sel = selected ? itemRect.get(selected) : undefined;
  const multiStage = analysis.stages.length > 1;

  return (
    <svg className="rocket-svg" viewBox={`0 0 ${VIEW_W} ${totalH}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label="Rocket preview">
      <Defs />
      {drawn}
      {sel && (
        <rect x={sel.x - 4} y={sel.y - 2} width={sel.w + 8} height={sel.h + 4} rx={3} fill="none"
          stroke="#7fd4ff" strokeWidth={Math.max(1, fs / 10)} strokeDasharray={`${fs / 3} ${fs / 4}`} />
      )}
      {/* Stage brackets with Δv */}
      {multiStage && analysis.stages.map((st) => {
        const spans = st.uids.map((u) => blockSpan.get(u)).filter((s): s is [number, number] => !!s);
        if (!spans.length) return null;
        const y0 = Math.min(...spans.map((s) => s[0])) + 2;
        const y1 = Math.max(...spans.map((s) => s[1])) - 2;
        const mid = (y0 + y1) / 2;
        const bx = CX - 52;
        const color = st.number === 1 ? '#ffd166' : '#7fd4ff';
        const lx1 = bx - fs * 0.6, lx2 = lx1 - fs * 1.25;
        return (
          <g key={st.number} className="stage-bracket">
            <path d={`M${bx + 6} ${y0} H${bx} V${y1} H${bx + 6}`} fill="none" stroke={color} strokeWidth={Math.max(1.2, fs / 9)} />
            <text x={lx1} y={mid} fill={color} fontSize={fs} fontWeight={800} textAnchor="middle" dominantBaseline="middle"
              letterSpacing={fs * 0.06} transform={`rotate(-90 ${lx1} ${mid})`}>STAGE {st.number}</text>
            <text x={lx2} y={mid} fill="#cfd8ea" fontSize={fs * 0.85} fontWeight={600} textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(-90 ${lx2} ${mid})`}>Δv {fmt(st.dv)} m/s</text>
          </g>
        );
      })}
      {/* Launch pad */}
      <rect x={CX - 64} y={padY + 2} width={128} height={10} rx={2} fill="url(#rk-pad)" stroke="#3a4766" />
      <rect x={CX - 50} y={padY + 12} width={8} height={12} fill="#2b3550" />
      <rect x={CX + 42} y={padY + 12} width={8} height={12} fill="#2b3550" />
    </svg>
  );
}
