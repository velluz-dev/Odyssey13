/**
 * planets.ts: real solar-system data.
 *
 * Source: NASA Planetary Fact Sheet, NSSDCA
 *   https://nssdc.gsfc.nasa.gov/planetary/factsheet/
 *   https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
 *   https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
 * Starting positions: JPL "Approximate Positions of the Planets" (mean longitude at J2000)
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Orbits are drawn as circles (all four planets have low eccentricity), and
 * angular speed = 360° / orbital period.
 */

export const DATA_CITATION = 'NASA Planetary Fact Sheet, NSSDCA';

/** Standard gravity, m/s². Used for the rocket equation and liftoff weight. */
export const G0 = 9.81;

/** Delta-v from Earth's surface to low Earth orbit, including gravity and drag losses (m/s). */
export const DV_TO_ORBIT = 9400;

/** Minimum liftoff thrust-to-weight ratio for an efficient climb. */
export const MIN_LIFTOFF_TWR = 1.2;

import factsheet from './factsheet.json';

/** Scraped NASA Planetary Fact Sheet (run `npm run data:factsheet` to refresh). */
export const FACTSHEET = factsheet;
export type FactBody = keyof typeof factsheet.bodies;
export const AU_KM = 149.6e6;

export type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export interface Planet {
  id: PlanetId;
  name: string;
  /** Orbital semi-major axis, AU */
  semiMajorAxisAU: number;
  /** Sidereal orbital period, days */
  periodDays: number;
  /** Mean longitude at J2000 epoch, degrees (JPL) */
  meanLongitudeJ2000: number;
  color: string;
  /** On-screen radius in px (planets are not drawn to scale) */
  drawRadius: number;
}

export const PLANETS: Planet[] = [
  { id: 'mercury', name: 'Mercury', semiMajorAxisAU: 0.387, periodDays: 88.0, meanLongitudeJ2000: 252.2503, color: '#b5a99a', drawRadius: 4 },
  { id: 'venus', name: 'Venus', semiMajorAxisAU: 0.723, periodDays: 224.7, meanLongitudeJ2000: 181.9791, color: '#e8c27a', drawRadius: 6 },
  { id: 'earth', name: 'Earth', semiMajorAxisAU: 1.0, periodDays: 365.25, meanLongitudeJ2000: 100.4646, color: '#4fa3ff', drawRadius: 8 },
  { id: 'mars', name: 'Mars', semiMajorAxisAU: 1.524, periodDays: 687.0, meanLongitudeJ2000: -4.5534, color: '#e2643a', drawRadius: 7 },
  // Outer planets: distance and period straight from the scraped fact sheet
  ...([
    ['jupiter', 'Jupiter', 34.3964, '#d8b48a', 13],
    ['saturn', 'Saturn', 49.9542, '#e3cf9a', 11],
    ['uranus', 'Uranus', 313.2381, '#9fd8e0', 9],
    ['neptune', 'Neptune', -55.1200, '#4f78d8', 9],
  ] as const).map(([id, name, l0, color, drawRadius]): Planet => ({
    id, name, color, drawRadius, meanLongitudeJ2000: l0,
    semiMajorAxisAU: factsheet.bodies[id].distanceFromSun * 1e6 / AU_KM,
    periodDays: factsheet.bodies[id].orbitalPeriod,
  })),
];

export const MOON = {
  name: 'Moon',
  /** Mean Earth–Moon distance, km */
  distanceKm: 384_400,
  /** Sidereal orbital period, days */
  periodDays: 27.3217,
  /** Mean longitude at J2000, degrees */
  meanLongitudeJ2000: 218.316,
  color: '#cfd3da',
};

/** Surface conditions (NASA Planetary Fact Sheet). */
export const SURFACE = {
  earth: { gravity: 9.81, atmosphere: 'yes', pressure: '1,014 mb' },
  moon: { gravity: 1.62, atmosphere: 'none', pressure: '~0 (vacuum)' },
  mars: { gravity: 3.71, atmosphere: 'thin', pressure: '6.36 mb (~0.6% of Earth)' },
} as const;

export type TargetId = 'leo' | 'moon' | 'mars';

export interface Target {
  id: TargetId;
  name: string;
  /** Used in sentences ("landed on the Moon" / "landed on Mars") */
  label: string;
  color: string;
  gravity: number;
  atmosphere: 'none' | 'thin' | 'thick';
  pressure: string;
  /** Delta-v from low Earth orbit to the surface, m/s */
  dvFromOrbit: number;
  /** Part of dvFromOrbit spent getting there (injection + capture), m/s */
  transferDv: number;
  /** Part of dvFromOrbit spent on the final powered descent, m/s */
  landingDv: number;
  dvNote: string;
  /** Landing parts this target requires, and why */
  requiredLanding: { partId: string; why: string }[];
  /** Parts that do nothing at this target (a warning, not an error) */
  uselessParts: { partId: string; why: string }[];
}

/** Short, readable atmosphere description for a target. */
export function atmosphereLabel(t: Target): string {
  return t.atmosphere === 'none' ? 'none (vacuum)' : t.atmosphere === 'thin' ? `thin CO₂, ${t.pressure}` : `thick air, ${t.pressure}`;
}

/** Low Earth orbit altitude used for satellite missions, km. */
export const LEO_ALTITUDE_KM = 400;
/** Orbital period at LEO_ALTITUDE_KM: T = 2π·√(a³/μ), μ_Earth = 398,600 km³/s². */
export const LEO_PERIOD_MIN = (2 * Math.PI * Math.sqrt((6371 + LEO_ALTITUDE_KM) ** 3 / 398_600.4418)) / 60;
/** Orbital speed at LEO_ALTITUDE_KM: v = √(μ/a). */
export const LEO_SPEED_KMS = Math.sqrt(398_600.4418 / (6371 + LEO_ALTITUDE_KM));

export const TARGETS: Record<TargetId, Target> = {
  leo: {
    id: 'leo',
    name: 'Earth Orbit',
    label: 'Earth orbit',
    color: '#4fa3ff',
    gravity: SURFACE.earth.gravity,
    atmosphere: 'thick',
    pressure: SURFACE.earth.pressure,
    dvFromOrbit: 0,
    transferDv: 0,
    landingDv: 0,
    dvNote: `Reach a ${LEO_ALTITUDE_KM} km low Earth orbit and deploy a satellite: no transfer, no landing`,
    requiredLanding: [],
    uselessParts: [
      { partId: 'heat-shield', why: 'Not needed in orbit, wasted mass' },
      { partId: 'parachute', why: 'Not needed in orbit, wasted mass' },
      { partId: 'landing-legs', why: 'Not needed in orbit, wasted mass' },
    ],
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    label: 'the Moon',
    color: MOON.color,
    gravity: SURFACE.moon.gravity,
    atmosphere: 'none',
    pressure: SURFACE.moon.pressure,
    dvFromOrbit: 5700,
    transferDv: 4000,
    landingDv: 1700,
    dvNote: 'Trans-lunar injection + lunar orbit capture + fully powered descent (no air to brake with)',
    requiredLanding: [
      { partId: 'landing-legs', why: 'touch down upright on the regolith' },
    ],
    uselessParts: [
      { partId: 'parachute', why: 'Useless on the Moon, wasted mass (no atmosphere)' },
    ],
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    label: 'Mars',
    color: '#e2643a',
    gravity: SURFACE.mars.gravity,
    atmosphere: 'thin',
    pressure: SURFACE.mars.pressure,
    dvFromOrbit: 4300,
    transferDv: 3600,
    landingDv: 700,
    dvNote: 'Trans-Mars injection + aerobraking with a heat shield + short powered descent',
    requiredLanding: [
      { partId: 'heat-shield', why: 'survive ~1,300 °C atmospheric entry' },
      { partId: 'parachute', why: 'slow down in the thin CO₂ air' },
      { partId: 'landing-legs', why: 'touch down upright' },
    ],
    uselessParts: [],
  },
};

/** Days since the J2000 epoch (2000-01-01 12:00 UTC). */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
}

/** Mean longitude (deg) of a body on a given date: L = L0 + 360° × t / period. */
export function meanLongitudeOnDate(l0: number, periodDays: number, date: Date): number {
  return l0 + (360 * daysSinceJ2000(date)) / periodDays;
}
