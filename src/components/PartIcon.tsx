import type { ReactNode } from 'react';

/**
 * Illustrated part icons for the parts library: small metallic renderings
 * (cylinders, bells, capsules) with soft gradients, one per part id.
 */

const G = ({ id, stops, vertical }: { id: string; stops: [number, string][]; vertical?: boolean }) => (
  <linearGradient id={id} x1="0" x2={vertical ? '0' : '1'} y1="0" y2={vertical ? '1' : '0'}>
    {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
  </linearGradient>
);

const METAL: [number, string][] = [[0, '#6c6f78'], [0.25, '#c9ccd3'], [0.45, '#f4f5f7'], [0.65, '#d2d5db'], [1, '#5c5f68']];
const DARK: [number, string][] = [[0, '#26272c'], [0.4, '#6b6e76'], [0.55, '#8a8d95'], [1, '#1e1f23']];
const COPPER: [number, string][] = [[0, '#5a2316'], [0.35, '#b5583a'], [0.5, '#d9825f'], [1, '#4a1c12']];
const GOLD: [number, string][] = [[0, '#7a5410'], [0.3, '#e0b043'], [0.48, '#fff0b0'], [0.7, '#c9962d'], [1, '#6a4a0e']];

function Tank({ p, w, h, bands }: { p: string; w: number; h: number; bands: number }) {
  const x = 20 - w / 2, y = 20 - h / 2, rx = w / 2, ry = Math.min(4, w / 5);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${p}m)`} />
      <ellipse cx={20} cy={y} rx={rx} ry={ry} fill="#e8eaee" stroke="#8b8e96" strokeWidth={0.6} />
      <ellipse cx={20} cy={y + h} rx={rx} ry={ry} fill={`url(#${p}m)`} />
      {Array.from({ length: bands }, (_, i) => {
        const by = y + (h * (i + 1)) / (bands + 1);
        return <path key={i} d={`M${x} ${by} Q20 ${by + ry * 1.4} ${x + w} ${by}`} fill="none" stroke="#7c7f88" strokeWidth={0.8} />;
      })}
      <rect x={x + w * 0.18} y={y + 1} width={w * 0.1} height={h - 2} fill="#ffffff" opacity={0.35} rx={1} />
    </g>
  );
}

const DRAW: Record<string, (p: string) => ReactNode> = {
  'probe-core': (p) => (
    <g>
      <path d="M12 30 L14 16 H26 L28 30Z" fill={`url(#${p}g)`} stroke="#5a3d08" strokeWidth={0.6} />
      <path d="M14 21 l4 -1 l3 2 l4 -1 M13 26 l5 1 l4 -2 l5 1" stroke="#fff3c0" strokeOpacity={0.6} strokeWidth={0.6} fill="none" />
      <path d="M10 13 Q20 3 30 13Z" fill={`url(#${p}m)`} stroke="#8b8e96" strokeWidth={0.6} />
      <line x1={20} y1={9} x2={20} y2={4} stroke="#c9ccd3" strokeWidth={1} /><circle cx={20} cy={3.5} r={1.2} fill="#e8eaee" />
      <rect x={17} y={22} width={6} height={4} rx={1} fill="#1d1f24" /><circle cx={20} cy={24} r={1.2} fill="#7fd4ff" />
    </g>
  ),
  cubesat: (p) => (
    <g>
      <rect x={14} y={8} width={12} height={24} rx={1.5} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      {[16, 24].map((y) => <line key={y} x1={14} x2={26} y1={y} y2={y} stroke="#6c6f78" strokeWidth={0.6} />)}
      <rect x={15.5} y={9.5} width={9} height={5} fill="url(#pi-blue)" />
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect x={s < 0 ? 3 : 27} y={10} width={10} height={20} fill="url(#pi-blue)" stroke="#c9ccd3" strokeWidth={0.5} />
          <line x1={s < 0 ? 8 : 32} x2={s < 0 ? 8 : 32} y1={10} y2={30} stroke="#7aa6ea" strokeWidth={0.4} />
        </g>
      ))}
      <line x1={20} y1={8} x2={20} y2={3} stroke="#c9ccd3" strokeWidth={0.8} />
    </g>
  ),
  'comms-sat': (p) => (
    <g>
      {[-1, 1].map((s) => (
        <g key={s}>
          <line x1={s < 0 ? 13 : 27} x2={s < 0 ? 10 : 30} y1={22} y2={22} stroke="#c9ccd3" strokeWidth={1} />
          <rect x={s < 0 ? 1 : 30} y={15} width={9} height={15} fill="url(#pi-blue)" stroke="#c9ccd3" strokeWidth={0.5} />
          {[1, 2].map((i) => <line key={i} x1={s < 0 ? 1 : 30} x2={s < 0 ? 10 : 39} y1={15 + 5 * i} y2={15 + 5 * i} stroke="#7aa6ea" strokeWidth={0.4} />)}
        </g>
      ))}
      <rect x={13} y={14} width={14} height={16} rx={1.5} fill={`url(#${p}g)`} stroke="#5a3d08" strokeWidth={0.6} />
      <path d="M14.5 19 l4 -1 l3 2 l4 -1" stroke="#fff3c0" strokeOpacity={0.6} strokeWidth={0.6} fill="none" />
      <path d="M12 13 Q20 2 28 13Z" fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <line x1={20} y1={9} x2={20} y2={4} stroke="#8a8d95" strokeWidth={0.8} /><circle cx={20} cy={4} r={1.2} fill="#c9a7ff" />
      <rect x={16} y={30} width={8} height={4} rx={1} fill={`url(#${p}d)`} />
    </g>
  ),
  telescope: (p) => (
    <g>
      <rect x={13} y={4} width={14} height={20} rx={2} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <ellipse cx={20} cy={4.5} rx={6} ry={1.6} fill="#1d1f24" />
      <path d="M13 7 h14" stroke="#8a8d95" strokeWidth={0.6} />
      <rect x={13} y={24} width={14} height={11} rx={1.5} fill={`url(#${p}g)`} stroke="#5a3d08" strokeWidth={0.6} />
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect x={s < 0 ? 5 : 29} y={9} width={6} height={24} fill="url(#pi-blue)" stroke="#c9ccd3" strokeWidth={0.5} />
          <line x1={s < 0 ? 11 : 29} x2={s < 0 ? 13 : 27} y1={20} y2={20} stroke="#c9ccd3" strokeWidth={0.8} />
        </g>
      ))}
    </g>
  ),
  rover: (p) => (
    <g>
      <line x1={14} y1={9} x2={14} y2={18} stroke="#c9ccd3" strokeWidth={1.2} />
      <rect x={11} y={6} width={7} height={4} rx={1} fill={`url(#${p}m)`} />
      <rect x={7} y={16} width={26} height={9} rx={2} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <rect x={8.5} y={17.5} width={9} height={6} fill={`url(#${p}g)`} />
      <rect x={20} y={14} width={13} height={3} fill="#1d4f9a" stroke="#c9ccd3" strokeWidth={0.4} />
      {[10, 20, 30].map((cx) => <g key={cx}><circle cx={cx} cy={30} r={4} fill="#2a2c31" /><circle cx={cx} cy={30} r={1.6} fill="#8a8d95" /></g>)}
    </g>
  ),
  'tank-small': (p) => <Tank p={p} w={20} h={14} bands={1} />,
  'tank-large': (p) => <Tank p={p} w={16} h={26} bands={2} />,
  'tank-heavy': (p) => <Tank p={p} w={22} h={28} bands={3} />,
  'engine-launch': (p) => (
    <g>
      <path d="M13 5 H27 L23 13 H17Z" fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <path d="M15 8 h10 M16 10 h8" stroke="#8a8d95" strokeWidth={0.6} />
      <rect x={17} y={13} width={6} height={3} fill={`url(#${p}d)`} />
      <path d="M17 16 C17 22 10 28 8 36 H32 C30 28 23 22 23 16Z" fill={`url(#${p}c)`} stroke="#3a160d" strokeWidth={0.6} />
      <path d="M17 16 C17 19 15 21 14 23 H26 C25 21 23 19 23 16Z" fill={`url(#${p}m)`} />
      <ellipse cx={20} cy={36} rx={12} ry={1.6} fill="#2a120c" />
    </g>
  ),
  'engine-space': (p) => (
    <g>
      <rect x={14} y={4} width={12} height={7} rx={1.5} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <rect x={26} y={6} width={4} height={8} rx={1} fill={`url(#${p}m)`} />
      <path d="M13 6 h-3 v8 h3" fill="none" stroke="#8a8d95" strokeWidth={1.2} />
      <rect x={17} y={11} width={6} height={3} fill={`url(#${p}d)`} />
      <path d="M17.5 14 C17 22 12 28 11 37 H29 C28 28 23 22 22.5 14Z" fill={`url(#${p}d)`} stroke="#141518" strokeWidth={0.6} />
      <ellipse cx={20} cy={37} rx={9} ry={1.3} fill="#0d0e10" />
    </g>
  ),
  'solar-panel': (p) => (
    <g>
      <rect x={17} y={16} width={6} height={8} rx={1} fill={`url(#${p}m)`} />
      {[-1, 1].map((s) => (
        <g key={s}>
          <rect x={s < 0 ? 3 : 24} y={12} width={13} height={16} fill="url(#pi-blue)" stroke="#c9ccd3" strokeWidth={0.6} />
          {[1, 2].map((i) => <line key={i} x1={(s < 0 ? 3 : 24) + (13 * i) / 3} x2={(s < 0 ? 3 : 24) + (13 * i) / 3} y1={12} y2={28} stroke="#7aa6ea" strokeWidth={0.4} />)}
          {[1, 2, 3].map((i) => <line key={`h${i}`} x1={s < 0 ? 3 : 24} x2={s < 0 ? 16 : 37} y1={12 + 4 * i} y2={12 + 4 * i} stroke="#7aa6ea" strokeWidth={0.4} />)}
        </g>
      ))}
    </g>
  ),
  rtg: (p) => (
    <g>
      <rect x={15} y={8} width={10} height={24} rx={2} fill={`url(#${p}d)`} />
      {[11, 16, 21, 26].map((y) => <rect key={y} x={8} y={y} width={24} height={2} rx={1} fill={`url(#${p}m)`} />)}
      <circle cx={20} cy={20} r={3} fill="#ff9f43" opacity={0.85} />
      <path d="M20 17.6 l1.2 2 h-2.4z" fill="#3a1d05" />
    </g>
  ),
  antenna: (p) => (
    <g>
      <path d="M7 12 Q20 34 33 12Z" fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <ellipse cx={20} cy={12} rx={13} ry={3} fill="#e8eaee" stroke="#8b8e96" strokeWidth={0.5} />
      <line x1={20} y1={12} x2={20} y2={4} stroke="#8a8d95" strokeWidth={1} /><circle cx={20} cy={4} r={1.6} fill="#c9a7ff" />
      <rect x={18} y={26} width={4} height={8} fill={`url(#${p}d)`} /><rect x={13} y={33} width={14} height={3} rx={1} fill={`url(#${p}m)`} />
    </g>
  ),
  'heat-shield': (p) => (
    <g>
      <path d="M14 14 H26 L33 24 H7Z" fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.6} />
      <path d="M6 24 H34 L27 31 H13Z" fill={`url(#${p}c)`} stroke="#2a120c" strokeWidth={0.6} />
      <path d="M10 27 h20 M13 29.5 h14" stroke="#e08a5a" strokeOpacity={0.5} strokeWidth={0.6} />
    </g>
  ),
  parachute: (p) => (
    <g>
      <path d="M5 18 Q20 -2 35 18 Q27.5 15 20 18 Q12.5 15 5 18Z" fill="#f6efe2" stroke="#c9b9a0" strokeWidth={0.6} />
      <path d="M12 16 Q20 4 28 16" fill="none" stroke="#e2643a" strokeWidth={2.4} opacity={0.85} />
      {[5, 12.5, 27.5, 35].map((x) => <line key={x} x1={x} y1={18} x2={20} y2={30} stroke="#b9b2a8" strokeWidth={0.5} />)}
      <rect x={16} y={29} width={8} height={7} rx={1.5} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.5} />
    </g>
  ),
  'landing-legs': (p) => (
    <g>
      <rect x={12} y={10} width={16} height={9} rx={2} fill={`url(#${p}g)`} stroke="#5a3d08" strokeWidth={0.6} />
      {[-1, 1].map((s) => (
        <g key={s}>
          <line x1={20 + s * 6} y1={18} x2={20 + s * 15} y2={33} stroke={`url(#${p}m)`} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={20 + s * 3} y1={19} x2={20 + s * 12} y2={28} stroke="#8a8d95" strokeWidth={1} />
          <ellipse cx={20 + s * 15} cy={34} rx={3.5} ry={1.4} fill={`url(#${p}m)`} />
        </g>
      ))}
    </g>
  ),
  decoupler: (p) => (
    <g>
      <path d="M8 16 H32 L30 24 H10Z" fill={`url(#${p}d)`} stroke="#141518" strokeWidth={0.6} />
      <ellipse cx={20} cy={16} rx={12} ry={3} fill={`url(#${p}m)`} stroke="#6c6f78" strokeWidth={0.5} />
      {[12, 17, 23, 28].map((x) => <circle key={x} cx={x} cy={20} r={0.9} fill="#c9ccd3" />)}
      <path d="M10 22 h20" stroke="#ffd166" strokeWidth={0.8} strokeDasharray="2 1.5" />
    </g>
  ),
};

export default function PartIcon({ partId, size = 40 }: { partId: string; size?: number }) {
  const p = `pi-${partId}`;
  const draw = DRAW[partId];
  return (
    <svg className="part-icon" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <defs>
        <G id={`${p}m`} stops={METAL} />
        <G id={`${p}d`} stops={DARK} />
        <G id={`${p}c`} stops={COPPER} />
        <G id={`${p}g`} stops={GOLD} />
        <G id="pi-blue" stops={[[0, '#0b2350'], [0.5, '#1f56a8'], [1, '#0b2350']]} />
      </defs>
      {draw ? draw(p) : <rect x={10} y={10} width={20} height={20} rx={4} fill={`url(#${p}m)`} />}
    </svg>
  );
}
