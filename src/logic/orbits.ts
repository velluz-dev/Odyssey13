/**
 * orbits.ts: pure orbital-mechanics helpers for the animation.
 *
 * Planets move on circular orbits at angular speed ω = 360° / period.
 * The spacecraft flies a Hohmann transfer: half of an ellipse whose periapsis
 * touches the departure orbit and whose apoapsis touches the target orbit.
 */

export const DEG = Math.PI / 180;

/** Modulo that always returns a value in [0, n). */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Angle (deg) of a body on a circular orbit after `days`. */
export function bodyAngleDeg(angle0Deg: number, periodDays: number, days: number): number {
  return angle0Deg + (360 * days) / periodDays;
}

/**
 * Hohmann transfer time around the Sun, in days.
 * Kepler's 3rd law in AU and years: T = a^1.5, and the transfer is half an orbit.
 */
export function hohmannDaysAroundSun(r1AU: number, r2AU: number): number {
  const a = (r1AU + r2AU) / 2;
  return 0.5 * Math.pow(a, 1.5) * 365.25;
}

/** Hohmann transfer time around Earth (km), in days. μ_Earth = 398,600 km³/s². */
export function hohmannDaysAroundEarth(r1Km: number, r2Km: number): number {
  const MU = 398_600.4418;
  const a = (r1Km + r2Km) / 2;
  return (Math.PI * Math.sqrt((a * a * a) / MU)) / 86_400;
}

/**
 * Ideal phase angle (target ahead of departure planet) for a Hohmann launch window:
 * the target must travel (180° − phase) during the transfer.
 */
export function idealPhaseAngleDeg(targetPeriodDays: number, transferDays: number): number {
  return 180 - (360 * transferDays) / targetPeriodDays;
}

/** Days until the current phase angle shrinks down to the ideal one. */
export function daysToWindow(currentPhaseDeg: number, idealPhaseDeg: number, relativeRateDegPerDay: number): number {
  return mod(currentPhaseDeg - idealPhaseDeg, 360) / relativeRateDegPerDay;
}

/** Solve Kepler's equation M = E − e·sin E for the eccentric anomaly E (Newton's method). */
export function solveKepler(M: number, e: number): number {
  let E = e > 0.8 ? Math.PI : M;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

/**
 * Position on an outbound Hohmann half-ellipse.
 * @param r1 departure orbit radius (periapsis)
 * @param r2 target orbit radius (apoapsis)
 * @param startAngle departure angle (rad)
 * @param tau fraction of the transfer TIME elapsed, 0..1
 * @returns polar position { r, theta } in the same units as r1/r2
 */
export function hohmannPoint(r1: number, r2: number, startAngle: number, tau: number) {
  const a = (r1 + r2) / 2;
  const e = (r2 - r1) / (r2 + r1);
  const M = Math.PI * Math.max(0, Math.min(1, tau)); // mean anomaly grows linearly with time
  const E = solveKepler(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return { r: a * (1 - e * Math.cos(E)), theta: startAngle + nu };
}
