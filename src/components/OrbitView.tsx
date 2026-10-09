import { useEffect, useRef, useState } from 'react';
import {
  PLANETS, MOON, TARGETS, DV_TO_ORBIT, DATA_CITATION, FACTSHEET, atmosphereLabel, LEO_ALTITUDE_KM, LEO_PERIOD_MIN, LEO_SPEED_KMS, meanLongitudeOnDate, type TargetId, type PlanetId,
} from '../data/planets';
import { fmt, type MissionOutcome, type PlacedPart } from '../logic/validation';
import FlightCam, { type CamState } from './FlightCam';
import {
  DEG, mod, bodyAngleDeg, hohmannDaysAroundSun, hohmannDaysAroundEarth,
  idealPhaseAngleDeg, daysToWindow, hohmannPoint,
} from '../logic/orbits';
import { loadPlanetTextures, sphereImage, spinDegPerSec, type BodyId } from './planetTextures';

/** A satellite left in orbit by an earlier Earth Orbit mission. */
export interface SavedSatellite { id: string; name: string; partId: string }

interface Props {
  rocket: PlacedPart[];
  satellites: SavedSatellite[];
  outcome: MissionOutcome;
  targetId: TargetId;
  onComplete: () => void;
  onBack: () => void;
}

type Mode =
  | 'idle' | 'warp' | 'pad' | 'ascent' | 'fallback' | 'transfer' | 'drift'
  | 'landing' | 'surface' | 'crash' | 'lost' | 'done';

/**
 * Coordinates live in one of two frames:
 *  - 'sun'   : heliocentric, in AU
 *  - 'earth' : Earth-centred, normalised so the Moon's orbit has radius 1
 */
interface FramePt { f: 'sun' | 'earth'; x: number; y: number }
interface Popup { text: string; color: string; t: number }
interface Debris { x: number; y: number; vx: number; vy: number; t: number }

// Animation timings (real seconds)
const ASCENT_S = 5;
const TRANSFER_S = { mars: 7, moon: 5, leo: 0 } as const;
export const STEP_S = 1.8;
const END_HOLD_S = 2.4;
const ZOOM_S = 1.6;
const POPUP_LIFE = 3.6;

const GREEN = '#7ee081', RED = '#ff6b6b', YELLOW = '#ffd166', CYAN = '#7fd4ff', WHITE = '#e8ecf5';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

const PHASE_LABEL: Record<Mode, string> = {
  idle: 'On the launch pad', warp: 'Waiting for launch window', pad: 'Ignition', ascent: 'Ascent to orbit',
  fallback: 'Falling back', transfer: 'Transfer orbit', drift: 'Out of fuel, drifting', landing: 'Entry, descent & landing',
  surface: 'Surface operations', crash: 'Mission lost', lost: 'Mission lost', done: 'Mission complete',
};

/** View radius (display AU): whole solar system before launch, inner planets during the mission. */
const OUTER_FIT = 3.7;
const INNER_FIT = 1.62;
const NEPTUNE_AU = PLANETS.find((p) => p.id === 'neptune')!.semiMajorAxisAU;
/**
 * Display radius for a true distance (AU). Out to 1.6 AU (Mars) it is linear, so the
 * Earth-to-Mars Hohmann geometry stays exact. Beyond that, distances are log-compressed
 * so Jupiter to Neptune (5-30 AU) fit on screen.
 */
export function warpR(r: number): number {
  return r <= 1.6 ? r : 1.6 + 1.95 * Math.log(r / 1.6) / Math.log(NEPTUNE_AU / 1.6);
}

type Facts = typeof FACTSHEET.bodies.earth;
const FACT_ROWS: [string, (b: Facts) => string][] = [
  ['Distance from Sun', (b) => `${fmt(b.distanceFromSun, b.distanceFromSun < 1000 ? 1 : 0)} million km`],
  ['Year (orbital period)', (b) => `${fmt(b.orbitalPeriod, b.orbitalPeriod < 1000 ? 1 : 0)} days`],
  ['Day (rotation)', (b) => `${fmt(Math.abs(b.rotationPeriod), 1)} h${b.rotationPeriod < 0 ? ' (retrograde)' : ''}`],
  ['Diameter', (b) => `${fmt(b.diameter)} km`],
  ['Surface gravity', (b) => `${b.gravity} m/s²`],
  ['Mean temperature', (b) => `${b.meanTemperature} °C`],
  ['Surface pressure', (b) => (b.surfacePressure === null ? 'no solid surface' : `${b.surfacePressure} bar`)],
  ['Moons', (b) => `${b.numberOfMoons}`],
  ['Rings', (b) => (b.ringSystem ? 'yes' : 'no')],
];

/** Fact card for a clicked planet, from the scraped NASA Planetary Fact Sheet. */
function PlanetCard({ id, onClose }: { id: PlanetId; onClose: () => void }) {
  const b = FACTSHEET.bodies[id] as Facts;
  const name = PLANETS.find((p) => p.id === id)!.name;
  return (
    <div className="planet-card" role="dialog" aria-label={`${name} facts`}>
      <div className="planet-card-head">
        <strong>{name}</strong>
        <button className="planet-card-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <dl>
        {FACT_ROWS.map(([k, f]) => <div key={k}><dt>{k}</dt><dd>{f(b)}</dd></div>)}
      </dl>
      <p className="tiny muted">Source: {FACTSHEET.source} (retrieved {FACTSHEET.retrieved})</p>
    </div>
  );
}

export default function OrbitView({ rocket, satellites, outcome, targetId, onComplete, onBack }: Props) {
  const camRef = useRef<CamState>({ mode: 'idle', modeT: 0, time: 0, u: 0, tau: 0, sepIdx: 0, step: -1, failStep: -1, crashFrom: '' });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const launchReq = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const [launched, setLaunched] = useState(false);
  const [picked, setPicked] = useState<PlanetId | null>(null);
  const hitsRef = useRef<{ id: PlanetId; x: number; y: number; r: number }[]>([]);
  const pickedRef = useRef<PlanetId | null>(null);
  pickedRef.current = picked;

  const target = TARGETS[targetId];

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    loadPlanetTextures();

    /** Tiny satellite sprite: gold bus with two blue solar wings (telescope: white tube). */
    const drawSat = (x: number, y: number, k: number, ang: number, partId: string) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang); ctx.scale(k, k);
      ctx.fillStyle = '#1f56a8'; ctx.strokeStyle = '#c9ccd3'; ctx.lineWidth = 0.6;
      ctx.fillRect(-13, -3, 8, 6); ctx.strokeRect(-13, -3, 8, 6);
      ctx.fillRect(5, -3, 8, 6); ctx.strokeRect(5, -3, 8, 6);
      ctx.fillStyle = partId === 'telescope' ? '#e8eaee' : '#e0b043';
      ctx.fillRect(-4, partId === 'telescope' ? -6 : -4, 8, partId === 'telescope' ? 12 : 8);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -5, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    /** Saturn's rings, drawn as the half behind the planet or the half in front. */
    const drawRings = (x: number, y: number, r: number, half: 'back' | 'front') => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-0.4); ctx.scale(1, 0.36);
      const [a0, a1] = half === 'back' ? [Math.PI, Math.PI * 2] : [0, Math.PI];
      const bands: [number, number, string][] = [[1.45, 0.18, 'rgba(196,170,120,0.75)'], [1.75, 0.3, 'rgba(226,205,160,0.85)'], [2.15, 0.22, 'rgba(180,160,120,0.6)']];
      for (const [k, wdt, col] of bands) {
        ctx.strokeStyle = col; ctx.lineWidth = r * wdt;
        ctx.beginPath(); ctx.arc(0, 0, r * k, a0, a1); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 1;
    };

    /** Draw a textured sphere lit from the Sun; falls back to `fallback` until the texture loads. */
    const drawBody = (id: BodyId, x: number, y: number, r: number, sun: { x: number; y: number }, fallback: string | CanvasGradient) => {
      const dx = sun.x - x, dy = sun.y - y, d = Math.hypot(dx, dy) || 1;
      const dpr = window.devicePixelRatio || 1;
      const img = sphereImage(id, r * 2 * dpr, S.time * spinDegPerSec(id), dx / d, dy / d);
      if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      else {
        ctx.fillStyle = fallback;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      if (id === 'earth' || id === 'venus' || id === 'mars') {
        // thin atmosphere rim on the day side
        ctx.strokeStyle = id === 'earth' ? 'rgba(130,190,255,0.55)' : id === 'venus' ? 'rgba(255,225,160,0.4)' : 'rgba(255,170,130,0.3)';
        ctx.lineWidth = Math.max(0.8, r * 0.12);
        const a = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.arc(x, y, r + ctx.lineWidth / 2, a - 1.3, a + 1.3); ctx.stroke();
        ctx.lineWidth = 1;
      }
    };
    const isMoon = targetId === 'moon';
    const isLeo = targetId === 'leo';
    /** Missions that stay near Earth zoom into the Earth–Moon view. */
    const nearEarth = isMoon || isLeo;
    const o = outcome;

    // ---- Real orbital setup ------------------------------------------------
    const today = new Date();
    const earth = PLANETS.find((p) => p.id === 'earth')!;
    const mars = PLANETS.find((p) => p.id === 'mars')!;
    const angle0: Record<string, number> = {};
    for (const p of PLANETS) angle0[p.id] = meanLongitudeOnDate(p.meanLongitudeJ2000, p.periodDays, today);
    const moon0 = meanLongitudeOnDate(MOON.meanLongitudeJ2000, MOON.periodDays, today);

    const planetAngle = (id: string, period: number, day: number) => bodyAngleDeg(angle0[id], period, day) * DEG;
    const earthAng = (day: number) => planetAngle('earth', earth.periodDays, day);
    const marsAng = (day: number) => planetAngle('mars', mars.periodDays, day);
    const moonAng = (day: number) => bodyAngleDeg(moon0, MOON.periodDays, day) * DEG;

    const marsTransferDays = hohmannDaysAroundSun(earth.semiMajorAxisAU, mars.semiMajorAxisAU);
    const moonTransferDays = hohmannDaysAroundEarth(6371 + 200, MOON.distanceKm);
    const transferDays = isMoon ? moonTransferDays : marsTransferDays;
    const idealPhase = idealPhaseAngleDeg(mars.periodDays, marsTransferDays);
    const relRate = 360 / earth.periodDays - 360 / mars.periodDays;
    const marsPhase = (day: number) => mod((marsAng(day) - earthAng(day)) / DEG, 360);

    const TS = TRANSFER_S[targetId];
    const transferEndDv = DV_TO_ORBIT + target.transferDv;

    // ---- Mutable simulation state -------------------------------------------
    const S = {
      time: 0, day: 0, launchDay: 0, mode: 'idle' as Mode, modeT: 0, flag: 0,
      zoom: 0, zoomTarget: 0, warpTo: 0,
      departDay: 0, departAngle: 0, ascentAngle0: 0, r1: 0.3, offX: 0, offY: 0,
      dvUsed: 0, sepIdx: 0, step: -1, fallFrom: 0, finished: false,
      ship: null as FramePt | null, shipAlpha: 1, vel: { x: 0, y: 0 },
      shipScreen: null as { x: number; y: number } | null, heading: -Math.PI / 2,
      trail: [] as FramePt[], popups: [] as Popup[], debris: [] as Debris[],
      sparks: [] as { x: number; y: number; vx: number; vy: number; t: number; col: string }[],
      boom: null as { x: number; y: number } | null,
      u: 0, fallU: 0, tau: 0, failStep: -1, crashFrom: '' as CamState['crashFrom'], liftoffT: -99, insertT: -99,
      fit: OUTER_FIT, fitTarget: OUTER_FIT,
      leoR: 0, orbAng: 0,
    };

    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 240 }, () => ({ x: rand(), y: rand(), r: rand() * 1.1 + 0.2, a: rand() * 0.5 + 0.15 }));

    const push = (text: string, color = WHITE) => S.popups.push({ text, color, t: S.time });
    const setMode = (m: Mode) => { S.mode = m; S.modeT = 0; S.flag = 0; };
    const finish = () => setMode('done');

    /** Check whether any stage just ran dry and separated. */
    const dvTick = () => {
      while (S.sepIdx < o.separationDv.length && S.dvUsed >= o.separationDv[S.sepIdx] - 1e-6) {
        push(`Stage ${S.sepIdx + 1} separated`, YELLOW);
        if (S.shipScreen) {
          for (let i = 0; i < 4; i++) {
            S.debris.push({ x: S.shipScreen.x, y: S.shipScreen.y, vx: (rand() - 0.5) * 30, vy: 10 + rand() * 25, t: S.time });
          }
        }
        S.sepIdx++;
      }
    };

    // ---- Camera ---------------------------------------------------------------
    // zoom 0 = whole inner solar system centred on the Sun; zoom 1 = Earth–Moon system.
    function camera(w: number, h: number) {
      const minDim = Math.min(w, h);
      const ez = ease(clamp01(S.zoom));
      const solarScale = (minDim / 2 - 28) / S.fit;
      const scale = solarScale * Math.pow(45, ez);
      const ea = earthAng(S.day);
      const ex = Math.cos(ea), ey = Math.sin(ea);
      const earthSolar = { x: w / 2 + ex * solarScale, y: h / 2 - ey * solarScale };
      const earthS = { x: lerp(earthSolar.x, w / 2, ez), y: lerp(earthSolar.y, h / 2, ez) };
      const moonPx = lerp(17, minDim * 0.38, ez);
      const earthR = lerp(earth.drawRadius, 30, ez);
      // Radial warp: true scale out to Mars, log-compressed beyond (see warpR)
      const toS = (x: number, y: number) => {
        const r = Math.hypot(x, y), k = r > 0 ? warpR(r) / r : 1;
        return { x: earthS.x + (x * k - ex) * scale, y: earthS.y - (y * k - ey) * scale };
      };
      const fromFrame = (p: FramePt) => (p.f === 'sun'
        ? toS(p.x, p.y)
        : { x: earthS.x + p.x * moonPx, y: earthS.y - p.y * moonPx });
      return { w, h, minDim, ez, scale, earthS, moonPx, earthR, toS, fromFrame, ex, ey };
    }
    type Cam = ReturnType<typeof camera>;

    const targetFramePt = (): FramePt => {
      if (isLeo) return { f: 'earth', x: Math.cos(S.orbAng) * S.leoR, y: Math.sin(S.orbAng) * S.leoR };
      if (isMoon) { const a = moonAng(S.day); return { f: 'earth', x: Math.cos(a), y: Math.sin(a) }; }
      const a = marsAng(S.day);
      return { f: 'sun', x: Math.cos(a) * mars.semiMajorAxisAU, y: Math.sin(a) * mars.semiMajorAxisAU };
    };

    // ---- State machine ----------------------------------------------------------
    function startAscent(cam: Cam) {
      S.launchDay = S.day;
      S.liftoffT = S.time;
      if (o.failPhase === 'liftoff') { setMode('pad'); push('Ignition…', YELLOW); return; }
      // Moon: choose the launch direction so we leave parking orbit at the right angle.
      const ascentDays = ASCENT_S * 0.02;
      if (isMoon) {
        const departDeg = moonAng(S.day + ascentDays + transferDays) / DEG - 180;
        S.ascentAngle0 = departDeg - 270;
      } else {
        S.ascentAngle0 = earthAng(S.day) / DEG + 90;
      }
      void cam;
      setMode('ascent');
      push('Liftoff!', GREEN);
    }

    function startTransfer(cam: Cam) {
      S.departDay = S.day;
      if (o.failPhase === 'transfer' && o.failProgress <= 0) {
        push(o.title, RED);
        setMode('lost');
        return;
      }
      if (isLeo) {
        S.leoR = Math.hypot(S.ship!.x, S.ship!.y);
        S.orbAng = Math.atan2(S.ship!.y, S.ship!.x);
        push(`Parking orbit: ${LEO_ALTITUDE_KM} km, ${fmt(LEO_SPEED_KMS, 1)} km/s`, CYAN);
        S.trail = [];
        S.step = -1;
        setMode('surface');
        return;
      }
      if (isMoon) {
        S.r1 = Math.hypot(S.ship!.x, S.ship!.y);
        S.departAngle = Math.atan2(S.ship!.y, S.ship!.x);
        push('Trans-Lunar Injection burn', CYAN);
      } else {
        S.departAngle = earthAng(S.day);
        // Convert the parking-orbit offset (Earth frame, px) to AU so the path starts at the ship.
        S.offX = (S.ship!.x * cam.moonPx) / cam.scale;
        S.offY = (S.ship!.y * cam.moonPx) / cam.scale;
        push('Trans-Mars Injection burn', CYAN);
      }
      S.trail = [];
      S.insertT = S.time;
      S.ship = shipOnTransfer(0); // switch frames now so the trail never mixes Earth- and Sun-frame points
      setMode('transfer');
    }

    function shipOnTransfer(tau: number): FramePt {
      if (isMoon) {
        const p = hohmannPoint(S.r1, 1, S.departAngle, tau);
        return { f: 'earth', x: p.r * Math.cos(p.theta), y: p.r * Math.sin(p.theta) };
      }
      const p = hohmannPoint(earth.semiMajorAxisAU, mars.semiMajorAxisAU, S.departAngle, tau);
      const blend = 1 - clamp01(tau / 0.08);
      return { f: 'sun', x: p.r * Math.cos(p.theta) + S.offX * blend, y: p.r * Math.sin(p.theta) + S.offY * blend };
    }

    function runSteps(steps: { text: string; ok: boolean }[], dvFrom: number, dvSpan: number, onFail: Mode, next: () => void) {
      const k = Math.floor(S.modeT / STEP_S);
      if (k > S.step && k < steps.length) {
        S.step = k;
        const s = steps[k];
        push(s.text, s.ok ? GREEN : RED);
        if (dvSpan > 0) { S.dvUsed = Math.min(o.totalDv, dvFrom + (dvSpan * (k + 1)) / steps.length); dvTick(); }
        if (!s.ok) {
          S.failStep = k;
          S.crashFrom = onFail === 'crash' ? 'landing' : 'surface';
          if (onFail === 'crash') S.boom = S.shipScreen ? { ...S.shipScreen } : null;
          setMode(onFail);
          S.step = -1;
          return;
        }
      }
      if (k >= steps.length) { S.step = -1; next(); }
    }

    function update(dt: number, cam: Cam) {
      S.time += dt;
      S.modeT += dt;
      if (S.zoom !== S.zoomTarget) {
        S.zoom = S.zoomTarget > S.zoom ? Math.min(S.zoomTarget, S.zoom + dt / ZOOM_S) : Math.max(S.zoomTarget, S.zoom - dt / ZOOM_S);
      }
      if (isLeo && S.leoR > 0) S.orbAng += dt * 0.9;
      S.fit = lerp(S.fit, S.fitTarget, 1 - Math.exp(-dt * 2.2));
      if (Math.abs(S.fit - S.fitTarget) < 0.002) S.fit = S.fitTarget;
      const prev = S.ship ? { ...S.ship } : null;

      switch (S.mode) {
        case 'idle': {
          S.day += dt * (nearEarth ? 1.2 : 14);
          if (launchReq.current) {
            launchReq.current = false;
            S.fitTarget = INNER_FIT;
            if (nearEarth) { S.zoomTarget = 1; startAscent(cam); }
            else {
              const wait = daysToWindow(marsPhase(S.day), idealPhase, relRate);
              if (wait > 3 && o.failPhase !== 'liftoff') {
                S.warpTo = S.day + wait;
                push(`Waiting ${fmt(wait)} days for the Mars launch window`, CYAN);
                setMode('warp');
              } else startAscent(cam);
            }
          }
          break;
        }
        case 'warp': {
          const remaining = S.warpTo - S.day;
          S.day = Math.min(S.warpTo, S.day + dt * Math.max(40, Math.min(320, remaining * 1.6)));
          if (S.day >= S.warpTo - 1e-6) { push(`Window open: Mars ${fmt(idealPhase, 1)}° ahead of Earth`, GREEN); startAscent(cam); }
          break;
        }
        case 'pad': {
          S.ship = { f: 'earth', x: 0, y: cam.earthR / cam.moonPx };
          if (S.modeT > 1.3 && S.flag === 0) { S.flag = 1; push(`TWR ${fmt(o.twr, 2)}: thrust can't beat weight`, RED); }
          if (S.modeT > 2.8) { push('Engines shut down, still on the pad', RED); finish(); }
          break;
        }
        case 'ascent': {
          S.day += dt * 0.02;
          let u = clamp01(S.modeT / ASCENT_S);
          const failHere = o.failPhase === 'ascent';
          if (failHere && u >= o.failProgress) u = o.failProgress;
          S.dvUsed = Math.min(o.totalDv, DV_TO_ORBIT * u);
          const rE = cam.earthR / cam.moonPx;
          const r = rE * (1 + 0.9 * u);
          const ang = (S.ascentAngle0 + u * 270) * DEG;
          S.ship = { f: 'earth', x: r * Math.cos(ang), y: r * Math.sin(ang) };
          S.u = u;
          dvTick();
          if (failHere && u >= o.failProgress) {
            S.fallU = u;
            push(o.twr < 1.2 ? 'Too heavy: the climb stalls' : 'Engine cutoff: out of fuel before orbit', RED);
            S.fallFrom = r;
            setMode('fallback');
          } else if (u >= 1) {
            push(`Orbit reached (${fmt(DV_TO_ORBIT)} m/s spent)`, GREEN);
            startTransfer(cam);
          }
          break;
        }
        case 'fallback': {
          const k = clamp01(S.modeT / 1.6);
          const rE = cam.earthR / cam.moonPx;
          const r = lerp(S.fallFrom, rE, k * k);
          const ang = Math.atan2(S.ship!.y, S.ship!.x) + dt * 0.8;
          S.ship = { f: 'earth', x: r * Math.cos(ang), y: r * Math.sin(ang) };
          S.u = S.fallU * (1 - k * k);
          if (k >= 1) { S.crashFrom = 'ascent'; push('Fell back to Earth', RED); S.boom = S.shipScreen ? { ...S.shipScreen } : null; setMode('crash'); }
          break;
        }
        case 'transfer': {
          let tau = clamp01(S.modeT / TS);
          const failHere = o.failPhase === 'transfer';
          if (failHere && tau >= o.failProgress) tau = o.failProgress;
          S.day = S.departDay + tau * transferDays;
          S.tau = tau;
          S.dvUsed = Math.min(o.totalDv, DV_TO_ORBIT + target.transferDv * tau);
          S.ship = shipOnTransfer(tau);
          dvTick();
          if (S.flag === 0 && tau > 0.5) { S.flag = 1; push(`Day ${fmt(S.day - S.launchDay)}: halfway, coasting`, WHITE); }
          if (failHere && tau >= o.failProgress) {
            push('Out of fuel mid-transfer!', RED);
            push(`Δv: ${fmt(o.totalDv)} / ${fmt(o.requiredDv)} m/s`, RED);
            setMode('drift');
          } else if (tau >= 1) {
            push(`Arrived at ${target.name} after ${fmt(transferDays, isMoon ? 1 : 0)} days`, GREEN);
            S.dvUsed = transferEndDv;
            setMode('landing');
            S.step = -1;
          }
          break;
        }
        case 'drift': {
          S.day += dt * (transferDays / TS) * 0.6;
          if (S.ship) S.ship = { ...S.ship, x: S.ship.x + S.vel.x * dt, y: S.ship.y + S.vel.y * dt };
          S.shipAlpha = 1 - clamp01(S.modeT / 3);
          if (S.flag === 0 && S.modeT > 1.2) { S.flag = 1; push('Drifting into deep space…', RED); }
          if (S.modeT > 3) finish();
          break;
        }
        case 'landing': {
          S.day += dt * (nearEarth ? 0.02 : 0.3);
          S.ship = targetFramePt();
          runSteps(o.landingSteps, transferEndDv, target.landingDv, 'crash', () => setMode('surface'));
          break;
        }
        case 'surface': {
          S.day += dt * (nearEarth ? 0.02 : 0.3);
          S.ship = targetFramePt();
          runSteps(o.surfaceSteps, 0, 0, 'lost', () => { push('MISSION SUCCESS', GREEN); finish(); });
          break;
        }
        case 'crash':
        case 'lost': {
          S.day += dt * (nearEarth ? 0.02 : 0.3);
          if (S.mode === 'lost') S.shipAlpha = Math.max(0.35, 1 - S.modeT / 2);
          else S.shipAlpha = 0;
          if (S.modeT > 1.8) finish();
          break;
        }
        case 'done': {
          if (!S.finished && S.modeT > END_HOLD_S) { S.finished = true; completeRef.current(); }
          // Celebration spark fountain at the landing site for the first seconds of success
          if (o.success && S.modeT < 5 && S.shipScreen) {
            const n = Math.max(1, Math.round(dt * 90));
            for (let i = 0; i < n; i++) {
              const a = -Math.PI / 2 + (rand() - 0.5) * 2.2;
              const sp = 30 + rand() * 110;
              S.sparks.push({
                x: S.shipScreen.x, y: S.shipScreen.y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: S.time,
                col: ['#7ee081', '#ffd166', '#7fd4ff', '#ffffff', '#ff9ecf'][Math.floor(rand() * 5)],
              });
            }
          }
          break;
        }
      }

      // Track velocity (frame units / s) for drifting, plus the trail
      if (prev && S.ship && prev.f === S.ship.f && dt > 0 && S.mode !== 'drift') {
        S.vel = { x: (S.ship.x - prev.x) / dt, y: (S.ship.y - prev.y) / dt };
      }
      // Celebration sparks: rise, fall under light gravity, fade out
      for (const p of S.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt; p.vx *= (1 - 0.6 * dt); }
      S.sparks = S.sparks.filter((p) => S.time - p.t < 1.6);
      if (S.sparks.length > 600) S.sparks.splice(0, S.sparks.length - 600);
      if (S.ship && ['ascent', 'transfer', 'drift', 'fallback'].includes(S.mode)) {
        const last = S.trail[S.trail.length - 1];
        if (!last || last.f !== S.ship.f || Math.hypot(last.x - S.ship.x, last.y - S.ship.y) > (S.ship.f === 'sun' ? 0.004 : 0.006)) {
          S.trail.push({ ...S.ship });
          if (S.trail.length > 800) S.trail.shift();
        }
      }
    }

    // ---- Rendering -----------------------------------------------------------
    function render(cam: Cam) {
      const { w, h, toS, fromFrame, earthS, moonPx, earthR, ez } = cam;
      ctx.clearRect(0, 0, w, h);
      const bgG = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      bgG.addColorStop(0, '#1b1046');
      bgG.addColorStop(0.55, '#110a2e');
      bgG.addColorStop(1, '#08051a');
      ctx.fillStyle = bgG;
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }

      const sun = toS(0, 0);
      const planetAlpha = 1 - ez * 0.85;

      // Orbits
      ctx.lineWidth = 1;
      for (const p of PLANETS) {
        const r = warpR(p.semiMajorAxisAU) * cam.scale;
        if (r > 20000) continue;
        ctx.strokeStyle = p.id === 'mars' && targetId === 'mars' ? 'rgba(226,100,58,0.35)' : `rgba(140,160,200,${0.22 * planetAlpha + 0.05})`;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sun
      if (sun.x > -200 && sun.x < w + 200 && sun.y > -200 && sun.y < h + 200) {
        const g = ctx.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, 40);
        g.addColorStop(0, 'rgba(255,240,180,1)');
        g.addColorStop(0.3, 'rgba(255,200,80,0.9)');
        g.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, 40, 0, Math.PI * 2);
        ctx.fill();
        drawBody('sun', sun.x, sun.y, 14, sun, '#fff3c4');
      }

      // Mars launch-window guide lines (idle/warp only)
      if (targetId === 'mars' && (S.mode === 'idle' || S.mode === 'warp')) {
        const mp = toS(Math.cos(marsAng(S.day)) * mars.semiMajorAxisAU, Math.sin(marsAng(S.day)) * mars.semiMajorAxisAU);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(earthS.x, earthS.y); ctx.lineTo(sun.x, sun.y); ctx.lineTo(mp.x, mp.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Planets
      const hits: typeof hitsRef.current = [];
      for (const p of PLANETS) {
        const a = planetAngle(p.id, p.periodDays, S.day);
        const pos = p.id === 'earth' ? earthS : toS(Math.cos(a) * p.semiMajorAxisAU, Math.sin(a) * p.semiMajorAxisAU);
        if (pos.x < -50 || pos.x > w + 50 || pos.y < -50 || pos.y > h + 50) continue;
        const r = p.id === 'earth' ? earthR : p.drawRadius;
        ctx.globalAlpha = p.id === 'earth' ? 1 : planetAlpha;
        if (p.id === 'saturn') drawRings(pos.x, pos.y, r, 'back');
        drawBody(p.id, pos.x, pos.y, r, sun, p.color);
        if (p.id === 'saturn') drawRings(pos.x, pos.y, r, 'front');
        hits.push({ id: p.id, x: pos.x, y: pos.y, r: Math.max(r, 9) });
        if (pickedRef.current === p.id) {
          ctx.strokeStyle = 'rgba(127,212,255,0.9)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        }
        if (p.id === 'mars' && targetId === 'mars') {
          const pulse = r + 5 + Math.sin(S.time * 3) * 2;
          ctx.strokeStyle = 'rgba(226,100,58,0.6)';
          ctx.beginPath(); ctx.arc(pos.x, pos.y, pulse, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(220,228,245,0.8)';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, pos.x, pos.y + r + (p.id === 'saturn' ? 17 : 13));
        ctx.globalAlpha = 1;
      }
      hitsRef.current = hits;

      // Moon and its orbit (exaggerated in solar view, enlarged when zoomed)
      ctx.strokeStyle = isMoon ? 'rgba(207,211,218,0.35)' : 'rgba(207,211,218,0.18)';
      ctx.beginPath();
      ctx.arc(earthS.x, earthS.y, moonPx, 0, Math.PI * 2);
      ctx.stroke();
      const ma = moonAng(S.day);
      const mPos = fromFrame({ f: 'earth', x: Math.cos(ma), y: Math.sin(ma) });
      const mR = lerp(3, 12, ez);
      drawBody('moon', mPos.x, mPos.y, mR, sun, MOON.color);
      if (isMoon) {
        const pulse = mR + 4 + Math.sin(S.time * 3) * 2;
        ctx.strokeStyle = 'rgba(207,211,218,0.6)';
        ctx.beginPath(); ctx.arc(mPos.x, mPos.y, pulse, 0, Math.PI * 2); ctx.stroke();
        if (ez > 0.5) {
          ctx.fillStyle = 'rgba(220,228,245,0.8)';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Moon', mPos.x, mPos.y + mR + 13);
        }
      }

      // Constellation: satellites from earlier Earth Orbit missions keep orbiting
      const rEn = earthR / moonPx; // Earth radius in Earth-local units
      const satScale = lerp(0.45, 1.15, ez);
      satellites.forEach((sat, i) => {
        const shell = rEn * (2.1 + 0.35 * (i % 5));
        const ang = (i * 2.399) + S.time * (0.9 / (1 + 0.25 * (i % 5)));
        if (ez > 0.25) {
          ctx.strokeStyle = 'rgba(199,178,255,0.16)';
          ctx.beginPath(); ctx.arc(earthS.x, earthS.y, shell * moonPx, 0, Math.PI * 2); ctx.stroke();
        }
        const sp = fromFrame({ f: 'earth', x: Math.cos(ang) * shell, y: Math.sin(ang) * shell });
        drawSat(sp.x, sp.y, satScale, -ang, sat.partId);
        if (ez > 0.6 && satellites.length <= 6) {
          ctx.fillStyle = 'rgba(232,220,255,0.75)'; ctx.font = '10px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(sat.name, sp.x, sp.y - 10 * satScale - 4);
        }
      });
      if (isLeo && S.leoR > 0) {
        ctx.strokeStyle = 'rgba(127,212,255,0.35)'; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(earthS.x, earthS.y, S.leoR * moonPx, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }

      // Planned transfer path (dashed)
      if (S.mode === 'transfer' || S.mode === 'drift') {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(127,212,255,0.35)';
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const p = fromFrame(shipOnTransfer(i / 80));
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Trail
      if (S.trail.length > 1) {
        ctx.strokeStyle = S.mode === 'drift' || S.mode === 'fallback' ? 'rgba(255,107,107,0.8)' : 'rgba(127,212,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        S.trail.forEach((p, i) => { const s = fromFrame(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        if (S.ship && S.mode !== 'landing' && S.mode !== 'surface') { const s = fromFrame(S.ship); ctx.lineTo(s.x, s.y); }
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Liftoff shockwave expanding from the launch site
      if ((S.mode === 'ascent' || S.mode === 'pad') && S.time - S.liftoffT < 1.2 && S.time - S.liftoffT >= 0) {
        const k = (S.time - S.liftoffT) / 1.2;
        ctx.strokeStyle = `rgba(255,220,150,${0.8 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(earthS.x, earthS.y, earthR + 4 + k * 46, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      // Orbit-insertion pulse where the injection burn completes
      if (S.shipScreen && S.time - S.insertT < 1.5 && S.time - S.insertT >= 0) {
        const k = (S.time - S.insertT) / 1.5;
        ctx.strokeStyle = `rgba(127,227,255,${0.9 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(S.shipScreen.x, S.shipScreen.y, 6 + k * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Ship
      if (S.ship && S.shipAlpha > 0 && S.mode !== 'idle' && S.mode !== 'warp') {
        let s = fromFrame(S.ship);
        const inOrbit = isLeo && S.leoR > 0;
        if (!inOrbit && (S.mode === 'landing' || S.mode === 'surface' || S.mode === 'lost' || (S.mode === 'done' && o.success))) {
          const r = isMoon ? mR : mars.drawRadius;
          s = { x: s.x, y: s.y - r - 4 };
        }
        if (S.shipScreen) {
          const dx = s.x - S.shipScreen.x, dy = s.y - S.shipScreen.y;
          if (Math.hypot(dx, dy) > 0.3) S.heading = Math.atan2(dy, dx);
        }
        if (!inOrbit && (S.mode === 'landing' || S.mode === 'surface')) S.heading = -Math.PI / 2;
        S.shipScreen = s;
        ctx.save();
        ctx.globalAlpha = S.shipAlpha;
        ctx.translate(s.x, s.y);
        ctx.rotate(S.heading);
        const thrusting = S.mode === 'ascent' || S.mode === 'pad' || (S.mode === 'transfer' && S.modeT / TS < 0.15);
        if (thrusting) {
          ctx.fillStyle = `rgba(255,${150 + Math.random() * 80},60,0.9)`;
          ctx.beginPath(); ctx.moveTo(-5, -2.5); ctx.lineTo(-11 - Math.random() * 6, 0); ctx.lineTo(-5, 2.5); ctx.fill();
        }
        if (inOrbit && S.mode !== 'lost' && (S.mode !== 'surface' || S.step >= 0)) {
          ctx.restore();
          drawSat(s.x, s.y, lerp(0.6, 1.4, ez), S.heading + Math.PI / 2, (rocket.find((p) => ['cubesat', 'comms-sat', 'telescope'].includes(p.partId))?.partId) ?? 'comms-sat');
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.globalAlpha = 0;
        }
        ctx.fillStyle = S.mode === 'lost' ? '#8a93a6' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Debris from stage separation
      S.debris = S.debris.filter((d) => S.time - d.t < 2);
      for (const d of S.debris) {
        const age = S.time - d.t;
        ctx.fillStyle = `rgba(180,190,210,${1 - age / 2})`;
        ctx.fillRect(d.x + d.vx * age, d.y + d.vy * age, 2.5, 2.5);
      }

      // Explosion
      if (S.boom && (S.mode === 'crash' || S.mode === 'done')) {
        const age = S.mode === 'crash' ? S.modeT : 1.8 + S.modeT;
        if (age < 2.5) {
          for (let i = 0; i < 3; i++) {
            const r = (age * 30) * (1 + i * 0.5);
            ctx.strokeStyle = `rgba(255,${140 - i * 40},60,${Math.max(0, 1 - age / 2.5)})`;
            ctx.lineWidth = 3 - i;
            ctx.beginPath(); ctx.arc(S.boom.x, S.boom.y, r, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.lineWidth = 1;
        }
      }

      // Celebration: pulsing glow, triple success rings and a spark fountain at the landing site
      if (S.mode === 'done' && o.success && S.shipScreen) {
        const gl = 0.5 + 0.2 * Math.sin(S.time * 4);
        const g = ctx.createRadialGradient(S.shipScreen.x, S.shipScreen.y, 0, S.shipScreen.x, S.shipScreen.y, 46);
        g.addColorStop(0, `rgba(126,224,129,${0.35 * gl + 0.2})`);
        g.addColorStop(1, 'rgba(126,224,129,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(S.shipScreen.x, S.shipScreen.y, 46, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const ph = (S.modeT / 1.2 + i / 3) % 1;
          ctx.strokeStyle = `rgba(126,224,129,${0.9 * (1 - ph)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(S.shipScreen.x, S.shipScreen.y, 8 + ph * 44, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.lineWidth = 1;
        for (const p of S.sparks) {
          const age = S.time - p.t;
          ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
          ctx.fillStyle = p.col;
          ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
        }
        ctx.globalAlpha = 1;
      }

      drawHud(cam);
    }

    function drawHud(cam: Cam) {
      const { w, h } = cam;
      const narrow = w < 560;
      // Top-left mission info
      ctx.textAlign = 'left';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(160,175,205,0.9)';
      const launched = S.mode !== 'idle' && S.mode !== 'warp';
      ctx.fillText(launched ? `MISSION DAY ${fmt(Math.max(0, S.day - S.launchDay), 1)}` : 'PRE-LAUNCH', 16, 24);
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = WHITE;
      ctx.fillText(isLeo && S.mode === 'surface' ? 'Satellite operations' : isLeo && S.mode === 'done' && o.success ? 'Satellite in orbit' : PHASE_LABEL[S.mode], 16, 44);

      // Δv gauge
      const bw = narrow ? 150 : 220;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(16, 54, bw, 8);
      const avail = Math.max(o.totalDv, 1);
      ctx.fillStyle = S.dvUsed >= o.totalDv - 1 && launched && !o.success ? RED : CYAN;
      ctx.fillRect(16, 54, bw * clamp01(S.dvUsed / Math.max(avail, o.requiredDv)), 8);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(16 + bw * clamp01(o.totalDv / Math.max(avail, o.requiredDv)), 51, 2, 14);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(200,210,230,0.85)';
      ctx.fillText(`Δv used ${fmt(S.dvUsed)} / ${fmt(o.totalDv)} m/s available`, 16, 78);

      // Popups (top-centre)
      S.popups = S.popups.filter((p) => S.time - p.t < POPUP_LIFE);
      const visible = S.popups.slice(-5);
      ctx.textAlign = 'center';
      visible.forEach((p, i) => {
        const age = S.time - p.t;
        const alpha = Math.min(1, age * 4, (POPUP_LIFE - age) * 1.5);
        const y = (narrow ? 104 : 30) + i * 30 - Math.min(age * 12, 6);
        ctx.font = '600 14px system-ui, sans-serif';
        const tw = Math.min(ctx.measureText(p.text).width, w - 40);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = 'rgba(10,16,34,0.85)';
        roundRect(w / 2 - tw / 2 - 12, y - 16, tw + 24, 24, 12);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, w / 2, y, w - 40);
        ctx.globalAlpha = 1;
      });

      // Bottom-left: launch-window / system info
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(190,200,225,0.85)';
      const lines: string[] = [];
      if (isLeo) {
        lines.push(`Low Earth orbit: ${LEO_ALTITUDE_KM} km · one orbit every ${Math.round(LEO_PERIOD_MIN)} min · ${fmt(LEO_SPEED_KMS, 1)} km/s`);
        lines.push(`Your satellites in orbit: ${satellites.length + (o.success && S.mode === 'done' ? 1 : 0)}`);
      } else if (!isMoon) {
        const ph = marsPhase(S.day);
        lines.push(`Mars phase angle: ${fmt(ph, 1)}°  ·  Hohmann ideal: ${fmt(idealPhase, 1)}°`);
        lines.push(`Transfer time: ${fmt(marsTransferDays)} days  ·  next window in ${fmt(daysToWindow(ph, idealPhase, relRate))} days`);
        if (S.fit > 2) lines.unshift('Outer planets: distances beyond Mars are log-compressed to fit');
      } else {
        lines.push(`Earth–Moon: ${fmt(MOON.distanceKm)} km  ·  Moon period ${MOON.periodDays} d`);
        lines.push(`Hohmann transfer from 200 km orbit: ${fmt(moonTransferDays, 1)} days${cam.ez > 0.5 ? '  ·  Earth–Moon view enlarged' : ''}`);
      }
      lines.forEach((l, i) => ctx.fillText(l, 16, h - 18 - (lines.length - 1 - i) * 16, w - 32));

      // Bottom-right: data citation
      if (!narrow) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(150,165,195,0.7)';
        ctx.fillText(`Orbits & periods: ${DATA_CITATION}`, w - 16, h - 34);
        ctx.fillText(`Positions for ${today.toISOString().slice(0, 10)}: JPL approx. elements`, w - 16, h - 18);
      }
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // ---- Main loop -----------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      update(dt, camera(w, h));
      render(camera(w, h));
      camRef.current = { mode: S.mode, modeT: S.modeT, time: S.time, u: S.u, tau: S.tau, sepIdx: S.sepIdx, step: S.step, failStep: S.failStep, crashFrom: S.crashFrom };
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [outcome, targetId, target]);

  const launch = () => {
    launchReq.current = true;
    setLaunched(true);
  };

  return (
    <div className="orbit-screen">
      <div className="orbit-bar">
        <button className="btn ghost sm" onClick={onBack}>← Back to Build</button>
        <div className="orbit-title">
          <strong>Mission to {target.name}</strong>
          <span className="muted small">
            {targetId === 'leo' ? `${LEO_ALTITUDE_KM} km orbit` : `g = ${target.gravity} m/s² · air: ${atmosphereLabel(target)}`} · Δv {fmt(outcome.totalDv)} / {fmt(outcome.requiredDv)} m/s
          </span>
        </div>
        {!launched
          ? <button className="btn primary" onClick={launch}>🚀 Launch</button>
          : <button className="btn ghost sm" onClick={onComplete}>Skip to results →</button>}
      </div>
      <div className="orbit-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left, y = e.clientY - rect.top;
          const hit = hitsRef.current.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r + 6);
          setPicked(hit ? hit.id : null);
        }} />
        {picked && <PlanetCard id={picked} onClose={() => setPicked(null)} />}
        <FlightCam rocket={rocket} outcome={outcome} targetId={targetId} camRef={camRef} stepS={STEP_S} />
        {!launched && (
          <div className="orbit-hint">
            Press <b>Launch</b> when ready · Click a planet for NASA facts
          </div>
        )}
      </div>
    </div>
  );
}
