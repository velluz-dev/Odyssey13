/**
 * validation.ts: rocket physics and mission rules.
 *
 * Every function here is PURE: same input, same output, no side effects.
 * The UI only displays what these functions return.
 *
 * Key equations
 *   Tsiolkovsky rocket equation:   Δv = Isp × g0 × ln(m0 / mf)
 *   Thrust-to-weight ratio:        TWR = thrust / (mass × g0)
 *   Combined Isp of an engine cluster: Isp = ΣF / Σ(F / Isp)   (thrust-weighted)
 */
import { PARTS_BY_ID, type PartDef, type PartCategory } from '../data/parts';
import {
  G0, DV_TO_ORBIT, MIN_LIFTOFF_TWR, TARGETS, LEO_ALTITUDE_KM, LEO_PERIOD_MIN, LEO_SPEED_KMS, type TargetId,
} from '../data/planets';

/** One part placed on the rocket. The rocket is an array ordered TOP → BOTTOM. */
export interface PlacedPart {
  uid: string;
  partId: string;
}

/** Format a number with thousands separators: 13700 → "13,700". */
export const fmt = (n: number, digits = 0): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function getPart(id: string): PartDef {
  const p = PARTS_BY_ID[id];
  if (!p) throw new Error(`Unknown part: ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Core physics
// ---------------------------------------------------------------------------

/**
 * Tsiolkovsky rocket equation.
 * @param isp specific impulse (s)
 * @param m0  mass at ignition, full tanks (kg)
 * @param mf  mass at burnout, empty tanks (kg)
 * @returns delta-v in m/s (0 if the stage cannot produce any)
 */
export function tsiolkovsky(isp: number, m0: number, mf: number): number {
  if (isp <= 0 || mf <= 0 || m0 <= mf) return 0;
  return isp * G0 * Math.log(m0 / mf);
}

/**
 * Effective Isp of several engines firing together.
 * Mass flow of one engine = F / (Isp × g0), so Isp_total = ΣF / Σ(F / Isp).
 */
export function combinedIsp(engines: PartDef[]): number {
  const thrust = engines.reduce((s, e) => s + e.thrust, 0);
  const flowTerm = engines.reduce((s, e) => s + (e.isp > 0 ? e.thrust / e.isp : 0), 0);
  return flowTerm > 0 ? thrust / flowTerm : 0;
}

/** Thrust-to-weight ratio: above 1 the rocket rises, below 1 it stays on the pad. */
export function thrustToWeight(thrustN: number, massKg: number, g = G0): number {
  return massKg > 0 ? thrustN / (massKg * g) : 0;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * Split the stack into stages at each decoupler.
 * The decoupler belongs to the stage BELOW it, because it is dropped with that stage.
 * Returns stages bottom-first: result[0] is Stage 1, which fires first at liftoff.
 */
export function splitIntoStages(rocket: PlacedPart[]): PlacedPart[][] {
  const segments: PlacedPart[][] = [[]];
  for (const p of rocket) {
    if (getPart(p.partId).category === 'decoupler') segments.push([p]);
    else segments[segments.length - 1].push(p);
  }
  return segments.filter((s) => s.length > 0).reverse();
}

export interface StageInfo {
  /** 1 = bottom stage (fires first) */
  number: number;
  uids: string[];
  parts: PartDef[];
  dryMass: number;
  fuelMass: number;
  thrust: number;
  isp: number;
  /** Mass of this stage plus everything above it, tanks full */
  m0: number;
  /** Same, after this stage burns all its own fuel */
  mf: number;
  dv: number;
}

export interface RocketAnalysis {
  stages: StageInfo[];
  totalMass: number;
  dryMass: number;
  fuelMass: number;
  /** Thrust of Stage 1 engines (the ones burning at liftoff), N */
  liftoffThrust: number;
  twr: number;
  totalDv: number;
  /** Part counts by part id */
  counts: Record<string, number>;
  categories: PartCategory[];
}

/** Analyze a rocket: masses, per-stage delta-v, liftoff TWR. */
export function analyzeRocket(rocket: PlacedPart[]): RocketAnalysis {
  const base = splitIntoStages(rocket).map((seg, i) => {
    const parts = seg.map((p) => getPart(p.partId));
    const engines = parts.filter((p) => p.thrust > 0);
    return {
      number: i + 1,
      uids: seg.map((p) => p.uid),
      parts,
      dryMass: parts.reduce((s, p) => s + p.dryMass, 0),
      fuelMass: parts.reduce((s, p) => s + p.fuelMass, 0),
      thrust: engines.reduce((s, p) => s + p.thrust, 0),
      isp: combinedIsp(engines),
    };
  });

  // Stage i lifts itself plus every stage above it, but burns only its own fuel.
  const stages: StageInfo[] = base.map((st, i) => {
    const m0 = base.slice(i).reduce((s, x) => s + x.dryMass + x.fuelMass, 0);
    const mf = m0 - st.fuelMass;
    const dv = st.thrust > 0 ? tsiolkovsky(st.isp, m0, mf) : 0;
    return { ...st, m0, mf, dv };
  });

  const all = rocket.map((p) => getPart(p.partId));
  const dryMass = all.reduce((s, p) => s + p.dryMass, 0);
  const fuelMass = all.reduce((s, p) => s + p.fuelMass, 0);
  const totalMass = dryMass + fuelMass;
  const liftoffThrust = stages[0]?.thrust ?? 0;
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.id] = (counts[p.id] ?? 0) + 1;

  return {
    stages,
    totalMass,
    dryMass,
    fuelMass,
    liftoffThrust,
    twr: thrustToWeight(liftoffThrust, totalMass),
    totalDv: stages.reduce((s, st) => s + st.dv, 0),
    counts,
    categories: [...new Set(all.map((p) => p.category))],
  };
}

/** Total delta-v needed: Earth surface → orbit → target surface. */
export function requiredDv(targetId: TargetId): number {
  return DV_TO_ORBIT + TARGETS[targetId].dvFromOrbit;
}

/** Mass to remove to bring liftoff TWR up to MIN_LIFTOFF_TWR with the current engines. */
export function excessMassForTwr(a: RocketAnalysis): number {
  return Math.max(0, a.totalMass - a.liftoffThrust / (MIN_LIFTOFF_TWR * G0));
}

/** Cumulative delta-v at which each stage (except the last) runs dry and separates. */
export function separationDvs(a: RocketAnalysis): number[] {
  const out: number[] = [];
  let sum = 0;
  a.stages.slice(0, -1).forEach((st) => {
    sum += st.dv;
    out.push(sum);
  });
  return out;
}

const has = (a: RocketAnalysis, partId: string) => (a.counts[partId] ?? 0) > 0;
const hasCat = (a: RocketAnalysis, cat: PartCategory) => a.categories.includes(cat);

// ---------------------------------------------------------------------------
// Live checklist (Build screen)
// ---------------------------------------------------------------------------

export type CheckStatus = 'ok' | 'fail' | 'warn';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

const REQUIRED_CATEGORIES: { cat: PartCategory; label: string; hint: string }[] = [
  { cat: 'payload', label: 'Payload', hint: 'Add a Probe Core or Rover' },
  { cat: 'tank', label: 'Fuel tank', hint: 'Engines need propellant' },
  { cat: 'engine', label: 'Engine', hint: 'Add a Launch Engine at the bottom' },
  { cat: 'power', label: 'Power', hint: 'Add a Solar Panel or RTG' },
  { cat: 'comms', label: 'Comms', hint: 'Add an Antenna to phone home' },
];

/** Build the live checklist for a rocket and target. */
export function buildChecklist(
  rocket: PlacedPart[],
  targetId: TargetId,
  a: RocketAnalysis = analyzeRocket(rocket),
): CheckItem[] {
  const t = TARGETS[targetId];
  const items: CheckItem[] = [];

  // 1. Required part categories
  for (const r of REQUIRED_CATEGORIES) {
    const ok = hasCat(a, r.cat);
    items.push({ id: `req-${r.cat}`, label: r.label, status: ok ? 'ok' : 'fail', detail: ok ? undefined : r.hint });
  }

  // 2. Landing parts this target requires
  for (const req of t.requiredLanding) {
    const ok = has(a, req.partId);
    items.push({
      id: `land-${req.partId}`,
      label: `${getPart(req.partId).name} (${t.name})`,
      status: ok ? 'ok' : 'fail',
      detail: ok ? undefined : `Needed to ${req.why}`,
    });
  }

  // 3. Parts that are useless at this target (warning only)
  for (const u of t.uselessParts) {
    if (has(a, u.partId)) {
      const n = a.counts[u.partId];
      items.push({
        id: `useless-${u.partId}`,
        label: `${getPart(u.partId).name}: ${u.why}`,
        status: 'warn',
        detail: `+${fmt(getPart(u.partId).dryMass * n)} kg you don't need`,
      });
    }
  }

  // 4. Stages that carry fuel but have no engine
  for (const st of a.stages) {
    if (st.fuelMass > 0 && st.thrust === 0) {
      items.push({
        id: `stage-noengine-${st.number}`,
        label: `Stage ${st.number} has fuel but no engine`,
        status: 'warn',
        detail: 'That fuel is dead weight. Add an engine to this stage.',
      });
    }
  }

  // 5. Liftoff thrust-to-weight
  if (a.totalMass === 0) {
    items.push({ id: 'twr', label: 'Liftoff TWR', status: 'fail', detail: 'Add parts to the rocket' });
  } else if (a.twr < MIN_LIFTOFF_TWR) {
    const fix = a.liftoffThrust > 0
      ? `Remove ${fmt(excessMassForTwr(a))} kg or add an engine.`
      : 'Stage 1 has no engine. Add a Launch Engine at the bottom.';
    items.push({
      id: 'twr',
      label: `Too heavy to lift off: TWR ${fmt(a.twr, 2)}`,
      status: 'fail',
      detail: `${fix} (need ≥ ${MIN_LIFTOFF_TWR})`,
    });
  } else {
    items.push({ id: 'twr', label: `Liftoff TWR ${fmt(a.twr, 2)} ≥ ${MIN_LIFTOFF_TWR}`, status: 'ok' });
  }

  // 6. Delta-v budget
  const req = requiredDv(targetId);
  const dvOk = a.totalDv >= req;
  items.push({
    id: 'dv',
    label: dvOk ? `Δv ${fmt(a.totalDv)} / ${fmt(req)} m/s` : `Not enough Δv: ${fmt(a.totalDv)} / ${fmt(req)} m/s`,
    status: dvOk ? 'ok' : 'fail',
    detail: dvOk
      ? `${fmt(a.totalDv - req)} m/s spare`
      : `Short by ${fmt(req - a.totalDv)} m/s. Add fuel or another stage.`,
  });

  return items;
}

/** The Launch button is enabled only when nothing is failing. Warnings are allowed. */
export const canLaunch = (items: CheckItem[]): boolean => items.every((i) => i.status !== 'fail');

// ---------------------------------------------------------------------------
// Mission simulation (decides what happens after Launch)
// ---------------------------------------------------------------------------

export type MissionPhase = 'liftoff' | 'ascent' | 'transfer' | 'landing' | 'surface';

/** What a landing/surface step shows in the flight camera. */
export type StepKind = 'entry' | 'parachute' | 'parachute-useless' | 'descent' | 'touchdown' | 'deploy' | 'power' | 'comms' | 'ops';

export interface MissionStep {
  kind: StepKind;
  text: string;
  ok: boolean;
  failTitle?: string;
  tip?: string;
}

export interface MissionOutcome {
  success: boolean;
  targetId: TargetId;
  /** Phase where the mission failed, or null on success */
  failPhase: MissionPhase | null;
  /** How far into the failing phase it got (0..1), which drives the animation */
  failProgress: number;
  title: string;
  reason: string;
  tip: string;
  totalDv: number;
  requiredDv: number;
  twr: number;
  totalMass: number;
  stageDv: number[];
  separationDv: number[];
  landingSteps: MissionStep[];
  surfaceSteps: MissionStep[];
}

const ok = (kind: StepKind, text: string): MissionStep => ({ kind, text, ok: true });
const bad = (kind: StepKind, text: string, failTitle: string, tip: string): MissionStep => ({ kind, text, ok: false, failTitle, tip });

/**
 * Fly the mission on paper. Checks happen in flight order (liftoff, ascent,
 * transfer, landing, surface) and the first problem ends the mission.
 */
export function simulateMission(rocket: PlacedPart[], targetId: TargetId): MissionOutcome {
  const a = analyzeRocket(rocket);
  const t = TARGETS[targetId];
  const req = requiredDv(targetId);
  const landingStartDv = DV_TO_ORBIT + t.transferDv;
  const twrFix = a.liftoffThrust > 0
    ? `Remove ${fmt(excessMassForTwr(a))} kg or add another Launch Engine to Stage 1.`
    : 'Put a Launch Engine at the bottom of the rocket (Stage 1).';

  // --- Landing sequence (depends on the target's atmosphere) -----------------
  const landingSteps: MissionStep[] = [];
  const orbitOnly = targetId === 'leo';
  const dvForLanding = a.totalDv - landingStartDv;
  if (!orbitOnly) {
    if (t.atmosphere !== 'none') {
      landingSteps.push(has(a, 'heat-shield')
        ? ok('entry', 'Atmospheric entry at ~5.5 km/s: heat shield holds at ~1,300 °C')
        : bad('entry', 'No heat shield: burned up during entry at ~5.5 km/s',
          'Burned up on entry', 'Add a Heat Shield. Entry heating reaches ~1,300 °C.'));
      landingSteps.push(has(a, 'parachute')
        ? ok('parachute', 'Supersonic parachute deployed')
        : bad('parachute', `No parachute: the thin air couldn't slow the lander. Impact at ~400 m/s`,
          'Crashed on landing', 'Add a Parachute. Perseverance used a 21.5 m one.'));
    } else if (has(a, 'parachute')) {
      landingSteps.push(ok('parachute-useless', 'Parachute deployed… and does nothing. No atmosphere, wasted mass.'));
    }
    landingSteps.push(dvForLanding >= t.landingDv
      ? ok('descent', `Powered descent: retro-rockets burn ${fmt(t.landingDv)} m/s`)
      : bad('descent', `Out of fuel in powered descent. Crashed at ~${fmt(t.landingDv - Math.max(0, dvForLanding))} m/s`,
        'Crashed on landing', `Add ${fmt(req - a.totalDv)} m/s more Δv. Tanks on the upper stage help most.`));
    landingSteps.push(has(a, 'landing-legs')
      ? ok('touchdown', `Touchdown on ${t.label}!`)
      : bad('touchdown', 'No landing legs: the lander tipped over and broke on touchdown',
        'Tipped over on landing', 'Add Landing Legs.'));
  }

  // --- Surface operations ---------------------------------------------------
  const power = a.stages.flatMap((s) => s.parts).filter((p) => p.category === 'power');
  const payloadName = a.stages.flatMap((st) => st.parts).find((p) => p.category === 'payload')?.name ?? 'Payload';
  const surfaceSteps: MissionStep[] = [
    power.length > 0
      ? ok('power', `Power online: ${[...new Set(power.map((p) => p.name))].join(' + ')}`)
      : bad('power', 'No power source: batteries drained within hours',
        orbitOnly ? 'In orbit, then lost power' : 'Landed, then lost power', 'Add a Solar Panel or an RTG.'),
    hasCat(a, 'comms')
      ? ok('comms', 'Antenna locked on Earth: first data received by the Deep Space Network')
      : bad('comms', "No antenna: the lander can't phone home",
        orbitOnly ? 'In orbit, but silent' : 'Landed, but silent', 'Add an Antenna.'),
    ok('ops', orbitOnly
      ? `${payloadName} operating: one orbit every ${Math.round(LEO_PERIOD_MIN)} min at ${fmt(LEO_SPEED_KMS * 3600)} km/h`
      : has(a, 'rover') ? 'Rover rolls out to explore!' : 'Probe starts science operations!'),
  ];
  if (orbitOnly) surfaceSteps.unshift(ok('deploy', `Fairing open: ${payloadName} released into a ${LEO_ALTITUDE_KM} km orbit`));

  const base = {
    targetId,
    totalDv: a.totalDv,
    requiredDv: req,
    twr: a.twr,
    totalMass: a.totalMass,
    stageDv: a.stages.map((s) => s.dv),
    separationDv: separationDvs(a),
    landingSteps,
    surfaceSteps,
  };
  const fail = (phase: MissionPhase, progress: number, title: string, reason: string, tip: string): MissionOutcome =>
    ({ ...base, success: false, failPhase: phase, failProgress: Math.max(0, Math.min(1, progress)), title, reason, tip });

  // 1. Liftoff: thrust must exceed weight.
  if (a.twr < 1) {
    return fail('liftoff', 0, 'Never left the pad',
      `Thrust is less than weight: liftoff TWR ${fmt(a.twr, 2)} (needs > 1, ideally ≥ ${MIN_LIFTOFF_TWR}).`, twrFix);
  }
  // 2. Sluggish climb: gravity losses eat the fuel.
  if (a.twr < MIN_LIFTOFF_TWR) {
    return fail('ascent', 0.3, 'Fell back to Earth',
      `Too heavy to climb: liftoff TWR ${fmt(a.twr, 2)} < ${MIN_LIFTOFF_TWR}. The slow climb wasted fuel fighting gravity.`, twrFix);
  }
  // 3. Reaching orbit.
  if (a.totalDv < DV_TO_ORBIT) {
    return fail('ascent', a.totalDv / DV_TO_ORBIT, 'Fell back to Earth',
      `Not enough Δv to reach orbit: ${fmt(a.totalDv)} / ${fmt(DV_TO_ORBIT)} m/s.`,
      'Reaching orbit alone costs 9,400 m/s. Add tanks to Stage 1 or add a second stage.');
  }
  // 4. Is there anything to deliver?
  if (!hasCat(a, 'payload')) {
    return fail('transfer', 0, 'Nothing to deliver',
      `Reached orbit, but the rocket carries no payload to send to ${t.label}.`, 'Add a Probe Core or Rover at the top.');
  }
  // 5. The transfer burn(s).
  if (a.totalDv < landingStartDv) {
    const progress = (a.totalDv - DV_TO_ORBIT) / t.transferDv;
    return fail('transfer', progress, 'Ran out of fuel mid-transfer',
      `Not enough delta-v: ${fmt(a.totalDv - DV_TO_ORBIT)} / ${fmt(t.dvFromOrbit)} m/s after orbit `
      + `(total ${fmt(a.totalDv)} / ${fmt(req)} m/s). Fuel ran out ${Math.round(progress * 100)}% of the way to ${t.label}.`,
      `You need ${fmt(req - a.totalDv)} m/s more. Fuel on the upper stage counts most, since the Space Engine's Isp is 450 s.`);
  }
  // 6. Entry, descent and landing.
  const li = landingSteps.findIndex((s) => !s.ok);
  if (li >= 0) {
    const s = landingSteps[li];
    const dvNote = s.failTitle === 'Crashed on landing' && dvForLanding < t.landingDv
      ? ` Δv after orbit: ${fmt(Math.max(0, a.totalDv - DV_TO_ORBIT))} / ${fmt(t.dvFromOrbit)} m/s.` : '';
    return fail('landing', (li + 1) / landingSteps.length, s.failTitle!, s.text + '.' + dvNote, s.tip!);
  }
  // 7. Surface operations.
  const si = surfaceSteps.findIndex((s) => !s.ok);
  if (si >= 0) {
    const s = surfaceSteps[si];
    return fail('surface', (si + 1) / surfaceSteps.length, s.failTitle!, `${orbitOnly ? 'Satellite deployed' : `Touchdown on ${t.label}`}! But: ${s.text}.`, s.tip!);
  }

  return {
    ...base,
    success: true,
    failPhase: null,
    failProgress: 1,
    title: orbitOnly ? `Mission success: ${payloadName} is orbiting Earth!` : `Mission success: landed on ${t.label}!`,
    reason: `Δv ${fmt(a.totalDv)} / ${fmt(req)} m/s (${fmt(a.totalDv - req)} m/s to spare), liftoff TWR ${fmt(a.twr, 2)}.`,
    tip: orbitOnly ? 'Your satellite now orbits Earth in every future mission. Try the Moon next!' : has(a, 'rover') ? 'Try the other target next!' : 'Can you carry the heavier Rover too?',
  };
}
