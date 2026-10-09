/**
 * A small astronaut cat for the Mission Check panel. It reacts to the checklist:
 * happy and waving when every check passes, worried while something is failing.
 */
export default function AstroCat({ mood, message }: { mood: 'happy' | 'worried'; message: string }) {
  const happy = mood === 'happy';
  return (
    <div className={`astro-cat ${mood}`}>
      <div className="astro-bubble">{message}</div>
      <svg viewBox="0 0 120 120" width="96" height="96" role="img" aria-label={happy ? 'Happy astronaut cat' : 'Worried astronaut cat'}>
        <defs>
          <radialGradient id="ac-glass" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#c9b8ff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#7a5cd6" stopOpacity="0.35" />
          </radialGradient>
          <linearGradient id="ac-suit" x1="0" x2="1">
            <stop offset="0" stopColor="#cfc7e6" /><stop offset="0.45" stopColor="#fbf8f2" /><stop offset="1" stopColor="#bdb3dc" />
          </linearGradient>
          <linearGradient id="ac-fur" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#a99ac8" /><stop offset="1" stopColor="#7d6ca6" />
          </linearGradient>
        </defs>
        {/* tail curling out of the suit */}
        <path d="M86 98 C104 96 108 78 98 70 C92 66 88 72 94 75" fill="none" stroke="url(#ac-fur)" strokeWidth={7} strokeLinecap="round" />
        {/* suit body */}
        <path d="M34 118 C34 94 44 84 60 84 C76 84 86 94 86 118Z" fill="url(#ac-suit)" stroke="#9d92c2" strokeWidth={1} />
        <rect x={50} y={96} width={20} height={12} rx={3} fill="#3d2c6e" />
        <circle cx={55} cy={102} r={2} fill={happy ? '#8ee6a0' : '#ff8a8a'} /><circle cx={62} cy={102} r={2} fill="#ffd27a" />
        {/* waving paw */}
        <g className="ac-paw">
          <path d="M36 98 C26 92 22 82 26 76" fill="none" stroke="url(#ac-suit)" strokeWidth={10} strokeLinecap="round" />
          <circle cx={26} cy={74} r={6} fill="#efe9f8" stroke="#9d92c2" strokeWidth={1} />
        </g>
        {/* head */}
        <path d="M40 46 L38 26 L52 36Z" fill="url(#ac-fur)" />
        <path d="M80 46 L82 26 L68 36Z" fill="url(#ac-fur)" />
        <path d="M42 40 L41 30 L49 36Z" fill="#f2b8c6" />
        <path d="M78 40 L79 30 L71 36Z" fill="#f2b8c6" />
        <ellipse cx={60} cy={56} rx={23} ry={20} fill="url(#ac-fur)" />
        <ellipse cx={60} cy={63} rx={12} ry={8} fill="#e9e1f5" />
        {happy ? (
          <g fill="none" stroke="#2a1d47" strokeWidth={2.4} strokeLinecap="round">
            <path d="M47 53 Q51 48 55 53" /><path d="M65 53 Q69 48 73 53" />
          </g>
        ) : (
          <g>
            <ellipse cx={51} cy={53} rx={3.4} ry={4.2} fill="#2a1d47" /><ellipse cx={69} cy={53} rx={3.4} ry={4.2} fill="#2a1d47" />
            <circle cx={52} cy={51.5} r={1.2} fill="#fff" /><circle cx={70} cy={51.5} r={1.2} fill="#fff" />
          </g>
        )}
        <path d="M58 60 h4 l-2 2.4z" fill="#e57d95" />
        <path d={happy ? 'M56 64 Q60 68 64 64' : 'M56 67 Q60 64 64 67'} fill="none" stroke="#2a1d47" strokeWidth={1.4} strokeLinecap="round" />
        <g stroke="#f6ecd8" strokeWidth={0.9} opacity={0.8}>
          <line x1={46} y1={61} x2={34} y2={58} /><line x1={46} y1={64} x2={34} y2={65} />
          <line x1={74} y1={61} x2={86} y2={58} /><line x1={74} y1={64} x2={86} y2={65} />
        </g>
        {happy && <><circle cx={45} cy={60} r={3} fill="#f2a1b8" opacity={0.6} /><circle cx={75} cy={60} r={3} fill="#f2a1b8" opacity={0.6} /></>}
        {/* bubble helmet */}
        <circle cx={60} cy={52} r={34} fill="url(#ac-glass)" stroke="#d8cdfa" strokeWidth={2} />
        <path d="M38 34 Q46 24 58 22" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        <rect x={38} y={82} width={44} height={7} rx={3.5} fill="#cfc7e6" stroke="#9d92c2" strokeWidth={1} />
        <circle cx={60} cy={17} r={3} fill="#ffd27a" /><line x1={60} y1={18} x2={60} y2={22} stroke="#d8cdfa" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
