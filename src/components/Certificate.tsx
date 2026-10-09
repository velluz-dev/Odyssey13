import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TARGETS, LEO_ALTITUDE_KM } from '../data/planets';
import { fmt, type MissionOutcome } from '../logic/validation';

/*
 * Certificate of Mission Success: a printable / downloadable award for a
 * successful mission. Drawn as one SVG so the PNG download and the print
 * copy look exactly like the screen.
 */

const NAME_KEY = 'odyssey13-pilot-name';
const W = 1100, H = 780;

const ACHIEVEMENT: Record<string, string> = {
  leo: `placed a satellite into a ${LEO_ALTITUDE_KM} km orbit around Earth`,
  moon: 'landed a spacecraft safely on the surface of the Moon',
  mars: 'landed a spacecraft safely on the surface of Mars',
};

const BADGE: Record<string, string> = { leo: 'ORBITER', moon: 'LUNAR LANDER', mars: 'MARS LANDER' };

function loadName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export default function Certificate({ outcome, onClose }: { outcome: MissionOutcome; onClose: () => void }) {
  const [name, setName] = useState(loadName);
  const svgRef = useRef<SVGSVGElement>(null);
  const t = TARGETS[outcome.targetId];
  const date = new Date();
  const dateLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const missionId = `OD13-${outcome.targetId.toUpperCase()}-${date.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const shownName = name.trim() || 'Mission Designer';

  useEffect(() => {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
  }, [name]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Render the SVG to a 2× PNG and download it. */
  const download = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * 2; c.height = H * 2;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Odyssey13-certificate-${t.name.replace(/\s+/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  };

  const stats: [string, string][] = [
    ['Destination', t.name],
    ['Delta-v used', `${fmt(outcome.totalDv)} m/s`],
    ['Margin', `+${fmt(outcome.totalDv - outcome.requiredDv)} m/s`],
    ['Liftoff mass', `${fmt(outcome.totalMass / 1000, 1)} t`],
    ['Stages', `${outcome.stageDv.length}`],
  ];
  const serif = "Georgia, 'Times New Roman', serif";
  const sans = "'Segoe UI', Arial, sans-serif";

  // Portal to <body> so the modal sits above every app layer (header, footer, canvases)
  return createPortal(
    <div className="cert-overlay" role="dialog" aria-modal="true" aria-label="Mission certificate" onClick={onClose}>
      <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cert-controls">
          <label className="cert-name">
            <span>Name on certificate</span>
            <input value={name} maxLength={40} placeholder="Your name or team" onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="cert-buttons">
            <button className="btn primary" onClick={download}>⬇ Download PNG</button>
            <button className="btn ghost" onClick={() => window.print()}>🖨 Print</button>
            <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <svg ref={svgRef} className="cert-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Certificate of mission success for ${shownName}`}>
          <defs>
            <linearGradient id="ct-paper" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#f3ead8" />
            </linearGradient>
            <linearGradient id="ct-gold" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#8a5a12" /><stop offset="0.3" stopColor="#e6b54a" />
              <stop offset="0.5" stopColor="#fff0b0" /><stop offset="0.7" stopColor="#d7a136" /><stop offset="1" stopColor="#7a4e0e" />
            </linearGradient>
            <linearGradient id="ct-band" x1="0" x2="1">
              <stop offset="0" stopColor="#2a1a52" /><stop offset="0.5" stopColor="#4b2f94" /><stop offset="1" stopColor="#2a1a52" />
            </linearGradient>
            <radialGradient id="ct-seal" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#8a6bf0" /><stop offset="1" stopColor="#3a2380" />
            </radialGradient>
            <pattern id="ct-stars" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="14" r="1.1" fill="#6c4ad6" opacity="0.12" />
              <circle cx="42" cy="38" r="0.8" fill="#6c4ad6" opacity="0.12" />
              <path d="M30 6 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" fill="#b07a14" opacity="0.12" />
            </pattern>
          </defs>

          {/* Paper, borders, corner stars */}
          <rect width={W} height={H} fill="url(#ct-paper)" />
          <rect width={W} height={H} fill="url(#ct-stars)" />
          <rect x="18" y="18" width={W - 36} height={H - 36} fill="none" stroke="url(#ct-band)" strokeWidth="14" />
          <rect x="38" y="38" width={W - 76} height={H - 76} fill="none" stroke="url(#ct-gold)" strokeWidth="3" />
          <rect x="46" y="46" width={W - 92} height={H - 92} fill="none" stroke="#b07a14" strokeWidth="0.8" opacity="0.6" />
          {[[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]].map(([x, y]) => (
            <path key={`${x}${y}`} transform={`translate(${x} ${y})`} d="M0 -14 L3.5 -3.5 L14 0 L3.5 3.5 L0 14 L-3.5 3.5 L-14 0 L-3.5 -3.5Z" fill="url(#ct-gold)" />
          ))}

          {/* Header */}
          <g transform={`translate(${W / 2} 112)`}>
            <circle r="30" fill="#2a1a52" />
            <ellipse rx="27" ry="9" fill="none" stroke="#7fd4ff" strokeWidth="2" transform="rotate(-25)" />
            <path d="M0 -20 L7 -6 V9 H-7 V-6Z" fill="#ffd166" />
            <path d="M-5 9 L0 19 L5 9Z" fill="#ff6b6b" />
          </g>
          <text x={W / 2} y="172" textAnchor="middle" fontFamily={sans} fontSize="15" fontWeight="700" letterSpacing="6" fill="#6c4ad6">ODYSSEY13 MISSION CONTROL</text>
          <text x={W / 2} y="232" textAnchor="middle" fontFamily={serif} fontSize="54" fontWeight="700" fill="#2a1a52">Certificate of Mission Success</text>
          <line x1={W / 2 - 170} x2={W / 2 + 170} y1="254" y2="254" stroke="url(#ct-gold)" strokeWidth="2" />

          {/* Recipient */}
          <text x={W / 2} y="300" textAnchor="middle" fontFamily={serif} fontSize="19" fontStyle="italic" fill="#5a4a7a">This certifies that</text>
          <text x={W / 2} y="362" textAnchor="middle" fontFamily={serif} fontSize={shownName.length > 24 ? 40 : 50} fontWeight="700" fill="#2a1a52">{shownName}</text>
          <line x1={W / 2 - 260} x2={W / 2 + 260} y1="380" y2="380" stroke="#2a1a52" strokeWidth="1" opacity="0.35" />
          <text x={W / 2} y="420" textAnchor="middle" fontFamily={serif} fontSize="20" fill="#3d2d63">
            designed a rocket, flew the mission and {ACHIEVEMENT[outcome.targetId]}.
          </text>

          {/* Mission stats */}
          <g transform={`translate(${W / 2 - 410} 452)`}>
            <rect width="820" height="78" rx="12" fill="#2a1a52" opacity="0.06" />
            {stats.map(([k, v], i) => (
              <g key={k} transform={`translate(${82 + i * 164} 0)`}>
                <text y="31" textAnchor="middle" fontFamily={sans} fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#6b5a94">{k.toUpperCase()}</text>
                <text y="59" textAnchor="middle" fontFamily={sans} fontSize="21" fontWeight="700" fill="#2a1a52">{v}</text>
              </g>
            ))}
          </g>

          {/* Seal */}
          <g transform={`translate(${W / 2} 628)`}>
            {Array.from({ length: 24 }, (_, i) => (
              <path key={i} transform={`rotate(${i * 15})`} d="M0 -66 L8 -54 L-8 -54Z" fill="url(#ct-gold)" />
            ))}
            <circle r="56" fill="url(#ct-gold)" />
            <circle r="48" fill="url(#ct-seal)" />
            <circle r="42" fill="none" stroke="#e6b54a" strokeWidth="1" strokeDasharray="2 3" />
            <text y="-14" textAnchor="middle" fontFamily={sans} fontSize="10" fontWeight="800" letterSpacing="2" fill="#ffe7a8">MISSION</text>
            <text y="6" textAnchor="middle" fontFamily={sans} fontSize={BADGE[outcome.targetId].length > 9 ? 10 : 14} fontWeight="900" letterSpacing="0.5" fill="#ffffff">{BADGE[outcome.targetId]}</text>
            <text y="24" textAnchor="middle" fontFamily={sans} fontSize="10" fontWeight="800" letterSpacing="2" fill="#ffe7a8">COMPLETE</text>
          </g>

          {/* Signatures */}
          {[[230, 'Flight Director', 'Odyssey13'], [W - 230, 'Date', dateLabel]].map(([x, role, value]) => (
            <g key={role as string} transform={`translate(${x} 648)`}>
              <text y="-12" textAnchor="middle" fontFamily={role === 'Date' ? serif : "'Brush Script MT', 'Segoe Script', cursive"}
                fontSize={role === 'Date' ? 20 : 30} fill="#2a1a52">{value}</text>
              <line x1="-130" x2="130" y1="0" y2="0" stroke="#2a1a52" strokeWidth="1" />
              <text y="22" textAnchor="middle" fontFamily={sans} fontSize="12" fontWeight="700" letterSpacing="2" fill="#6b5a94">{(role as string).toUpperCase()}</text>
            </g>
          ))}

          <text x={W / 2} y={H - 62} textAnchor="middle" fontFamily={sans} fontSize="11" fill="#6b5a94">
            {missionId} · NASA Space Apps Challenge 2026 · Data: NASA NSSDCA Planetary Fact Sheet
          </text>
        </svg>
      </div>
    </div>,
    document.body,
  );
}
