import { useEffect, useState } from 'react';
import Builder from './components/Builder';
import OrbitView, { type SavedSatellite } from './components/OrbitView';
import Result from './components/Result';
import Starfield from './components/Starfield';
import { PARTS_BY_ID, PRESETS } from './data/parts';
import type { TargetId } from './data/planets';
import { simulateMission, type MissionOutcome, type PlacedPart } from './logic/validation';

type Screen = 'build' | 'orbit' | 'result';
const STORAGE_KEY = 'phantom6-design-v2';

/** First-visit design: the example Moon rocket, ready to launch. */
const DEFAULT_TARGET: TargetId = 'moon';
const defaultRocket = (): PlacedPart[] => PRESETS.moon.map((partId, i) => ({ uid: `d${i}`, partId }));

/** Restore the last design (best effort: storage may be unavailable). */
function loadSaved(): { target: TargetId; rocket: PlacedPart[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const target: TargetId = d.target === 'leo' || d.target === 'moon' ? d.target : 'mars';
    const rocket = Array.isArray(d.rocket)
      ? d.rocket.filter((p: PlacedPart) => p && typeof p.uid === 'string' && PARTS_BY_ID[p.partId])
      : [];
    return { target, rocket };
  } catch {
    return null;
  }
}

const SAT_KEY = 'phantom6-satellites-v1';

/** Satellites placed in Earth orbit by earlier missions (best effort: storage may be unavailable). */
function loadSatellites(): SavedSatellite[] {
  try {
    const d = JSON.parse(localStorage.getItem(SAT_KEY) ?? '[]');
    return Array.isArray(d) ? d.filter((x) => x && typeof x.name === 'string' && PARTS_BY_ID[x.partId]) : [];
  } catch {
    return [];
  }
}

type Theme = 'dark' | 'light';
const THEME_KEY = 'odyssey13-theme';

/** Saved choice, else the system preference. */
function initialTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const STEPS: { id: Screen; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'orbit', label: 'Launch' },
  { id: 'result', label: 'Result' },
];

export default function App() {
  const [saved] = useState(loadSaved);
  const [screen, setScreen] = useState<Screen>('build');
  const [target, setTarget] = useState<TargetId>(saved?.rocket.length ? saved.target : DEFAULT_TARGET);
  const [rocket, setRocket] = useState<PlacedPart[]>(saved?.rocket.length ? saved.rocket : defaultRocket);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const [missionKey, setMissionKey] = useState(0);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const [satellites, setSatellites] = useState<SavedSatellite[]>(loadSatellites);

  useEffect(() => {
    try { localStorage.setItem(SAT_KEY, JSON.stringify(satellites)); } catch { /* ignore */ }
  }, [satellites]);

  /** Mission finished: a successful Earth Orbit mission leaves its satellite in orbit for good. */
  const finishMission = () => {
    if (outcome?.success && target === 'leo') {
      const sat = rocket.map((p) => PARTS_BY_ID[p.partId]).find((p) => p?.category === 'payload');
      if (sat) {
        setSatellites((list) => [...list, {
          id: `${Date.now().toString(36)}`, partId: sat.id,
          name: `${sat.name.replace(/ \(.*\)$/, '')} ${list.filter((x) => x.partId === sat.id).length + 1}`,
        }].slice(-12));
      }
    }
    setScreen('result');
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ target, rocket })); } catch { /* ignore */ }
  }, [target, rocket]);

  const startMission = () => {
    setOutcome(simulateMission(rocket, target));
    setMissionKey((k) => k + 1);
    setScreen('orbit');
  };

  return (
    <div className="app">
      <div
        className="space-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}background/constellation.jpg)` }}
      />
      <Starfield />
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#0f1730" stroke="#2c3a63" />
            <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#7fd4ff" strokeWidth="1.2" transform="rotate(-25 16 16)" />
            <path d="M16 5 L20 13 V21 H12 V13 Z" fill="#ffd166" />
            <path d="M13 21 L16 27 L19 21Z" fill="#ff6b6b" />
          </svg>
          <h1>Odyssey<span>13</span></h1>
        </div>
        <div className="topbar-right">
        <nav className="steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`step ${screen === s.id ? 'active' : ''}`}>
              <b>{i + 1}</b> {s.label}
            </span>
          ))}
        </nav>
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
            </svg>
          )}
        </button>
        </div>
      </header>

      <main className="main">
        {screen === 'build' && (
          <Builder target={target} setTarget={setTarget} rocket={rocket} setRocket={setRocket} onLaunch={startMission} />
        )}
        {screen === 'orbit' && outcome && (
          <OrbitView key={missionKey} rocket={rocket} satellites={satellites} outcome={outcome} targetId={target}
            onComplete={finishMission} onBack={() => setScreen('build')} />
        )}
        {screen === 'result' && outcome && (
          <Result outcome={outcome} onBack={() => setScreen('build')} onRetry={startMission} />
        )}
      </main>

      <footer className="footer">
        Team Phantom6 — NASA Space Apps Challenge 2026 — Data: NASA NSSDCA Planetary Fact Sheet
        <span className="footer-credit"> · Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0)</span>
      </footer>
    </div>
  );
}
