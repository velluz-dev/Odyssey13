/**
 * parts.ts: every buildable rocket part, in one editable file.
 *
 * Units: mass in kg, thrust in newtons (N), specific impulse (Isp) in seconds.
 *
 * Balancing note:
 *   Reaching the Mars surface costs 9,400 + 4,300 = 13,700 m/s of delta-v.
 *   A tank that is 90% propellant caps any single stage at a mass ratio of 10, and that
 *   is too low for a 2-stage rocket to reach 13.7 km/s. Real orbital stages are ~92–96%
 *   propellant, so tanks here are 95% fuel (each tank's total mass is unchanged).
 *   The Heavy Tank is just 4 Large Tanks in one part, to save clicks.
 *   Reference builds (PRESETS below) reach Mars with a small margin.
 */

export type PartCategory =
  | 'payload'
  | 'tank'
  | 'engine'
  | 'power'
  | 'comms'
  | 'landing'
  | 'decoupler';

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  /** Structure mass, kg (stays with the rocket after the fuel is burned) */
  dryMass: number;
  /** Propellant mass, kg */
  fuelMass: number;
  /** Engine thrust, N (0 for non-engines) */
  thrust: number;
  /** Specific impulse, s (0 for non-engines) */
  isp: number;
  color: string;
  description: string;
}

export const CATEGORY_INFO: Record<PartCategory, { label: string; color: string }> = {
  payload: { label: 'Payload', color: '#ffd166' },
  tank: { label: 'Fuel Tanks', color: '#5aa9ff' },
  engine: { label: 'Engines', color: '#ff6b6b' },
  power: { label: 'Power', color: '#7ee081' },
  comms: { label: 'Comms', color: '#c792ea' },
  landing: { label: 'Landing', color: '#ff9f43' },
  decoupler: { label: 'Staging', color: '#9aa4b2' },
};

const c = (cat: PartCategory) => CATEGORY_INFO[cat].color;

export const PARTS: PartDef[] = [
  // Payload
  {
    id: 'probe-core', name: 'Probe Core', category: 'payload',
    dryMass: 500, fuelMass: 0, thrust: 0, isp: 0, color: c('payload'),
    description: 'Flight computer, science instruments and reaction wheels.',
  },
  {
    id: 'cubesat', name: 'CubeSat (6U)', category: 'payload',
    dryMass: 12, fuelMass: 0, thrust: 0, isp: 0, color: '#ffe8a3',
    description: 'Shoebox-sized satellite built from 10 cm cubes: cheap science in orbit.',
  },
  {
    id: 'comms-sat', name: 'Comms Satellite', category: 'payload',
    dryMass: 1200, fuelMass: 0, thrust: 0, isp: 0, color: '#f2c76b',
    description: 'Relays data and TV signals; gold foil keeps its electronics at a safe temperature.',
  },
  {
    id: 'telescope', name: 'Space Telescope', category: 'payload',
    dryMass: 2500, fuelMass: 0, thrust: 0, isp: 0, color: '#e8eaee',
    description: 'Looks at the universe above the blurring air (NASA Hubble: 11,110 kg).',
  },
  {
    id: 'rover', name: 'Rover', category: 'payload',
    dryMass: 900, fuelMass: 0, thrust: 0, isp: 0, color: '#ffe29a',
    description: 'Six-wheeled surface explorer (NASA Perseverance: ~1,025 kg).',
  },

  // Fuel tanks (95% propellant, see the note above)
  {
    id: 'tank-small', name: 'Small Fuel Tank', category: 'tank',
    dryMass: 100, fuelMass: 1900, thrust: 0, isp: 0, color: c('tank'),
    description: 'Compact propellant tank: 2 t when full.',
  },
  {
    id: 'tank-large', name: 'Large Fuel Tank', category: 'tank',
    dryMass: 400, fuelMass: 7600, thrust: 0, isp: 0, color: '#3d8bf0',
    description: 'Main propellant tank: 8 t when full.',
  },
  {
    id: 'tank-heavy', name: 'Heavy Fuel Tank', category: 'tank',
    dryMass: 1600, fuelMass: 30400, thrust: 0, isp: 0, color: '#2a6fd0',
    description: 'Booster-class tank (= 4 Large Tanks): 32 t when full.',
  },

  // Engines
  {
    id: 'engine-launch', name: 'Launch Engine', category: 'engine',
    dryMass: 1000, fuelMass: 0, thrust: 1_200_000, isp: 300, color: c('engine'),
    description: 'High thrust for liftoff; lower efficiency (Isp 300 s).',
  },
  {
    id: 'engine-space', name: 'Space Engine', category: 'engine',
    dryMass: 150, fuelMass: 0, thrust: 30_000, isp: 450, color: '#ff8e8e',
    description: 'Low thrust and very efficient in vacuum (Isp 450 s). Too weak for liftoff.',
  },

  // Power
  {
    id: 'solar-panel', name: 'Solar Panel', category: 'power',
    dryMass: 40, fuelMass: 0, thrust: 0, isp: 0, color: c('power'),
    description: 'Light, but weaker far from the Sun and under dust.',
  },
  {
    id: 'rtg', name: 'RTG', category: 'power',
    dryMass: 60, fuelMass: 0, thrust: 0, isp: 0, color: '#5cc96a',
    description: 'Radioisotope generator: power day and night (Curiosity/Perseverance use one).',
  },

  // Comms
  {
    id: 'antenna', name: 'Antenna', category: 'comms',
    dryMass: 20, fuelMass: 0, thrust: 0, isp: 0, color: c('comms'),
    description: 'High-gain dish to talk to NASA’s Deep Space Network.',
  },

  // Landing
  {
    id: 'heat-shield', name: 'Heat Shield', category: 'landing',
    dryMass: 250, fuelMass: 0, thrust: 0, isp: 0, color: c('landing'),
    description: 'Protects against ~1,300 °C during atmospheric entry.',
  },
  {
    id: 'parachute', name: 'Parachute', category: 'landing',
    dryMass: 60, fuelMass: 0, thrust: 0, isp: 0, color: '#ffb870',
    description: 'Slows the lander, but only where there is air.',
  },
  {
    id: 'landing-legs', name: 'Landing Legs', category: 'landing',
    dryMass: 100, fuelMass: 0, thrust: 0, isp: 0, color: '#e88a2e',
    description: 'Absorb the touchdown and keep the lander upright.',
  },

  // Staging
  {
    id: 'decoupler', name: 'Decoupler', category: 'decoupler',
    dryMass: 50, fuelMass: 0, thrust: 0, isp: 0, color: c('decoupler'),
    description: 'Splits the stack into stages: everything below it is dropped when its fuel runs out.',
  },
];

export const PARTS_BY_ID: Record<string, PartDef> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

/** Example builds, listed top → bottom. Used by the "Load example" button. */
export const PRESETS: Record<'leo' | 'moon' | 'mars', string[]> = {
  leo: [
    'comms-sat', 'antenna', 'solar-panel',
    'tank-large', 'engine-space',
    'decoupler',
    'tank-heavy', 'engine-launch',
  ],
  mars: [
    'probe-core', 'antenna', 'solar-panel', 'parachute', 'heat-shield', 'landing-legs',
    'tank-large', 'tank-large', 'tank-large', 'engine-space',
    'decoupler',
    'tank-heavy', 'tank-heavy', 'engine-launch',
  ],
  moon: [
    'probe-core', 'antenna', 'solar-panel', 'landing-legs',
    'tank-large', 'tank-large', 'tank-large', 'tank-large', 'engine-space',
    'decoupler',
    'tank-heavy', 'tank-heavy', 'tank-heavy', 'tank-heavy', 'engine-launch', 'engine-launch',
  ],
};

/** Short, to-the-point explainers shown when hovering a part: what it does, and when to use it. */
export const PART_HELP: Record<string, { what: string; use: string }> = {
  'cubesat': { what: 'Tiny satellite built from 10 cm cubes.', use: 'Cheapest Earth Orbit payload: only 12 kg.' },
  'comms-sat': { what: 'Relays signals between places on Earth.', use: 'Earth Orbit payload. Bring power + an antenna.' },
  'telescope': { what: 'Sees deep space without the air blurring it.', use: 'Heavy Earth Orbit payload (2,500 kg).' },
  'probe-core': { what: 'The brain: computer + science instruments.', use: 'Light payload for Moon or Mars landings.' },
  'rover': { what: 'Six-wheeled explorer that drives on the surface.', use: 'Heavier payload (900 kg): needs more fuel.' },
  'tank-small': { what: 'Holds 1.9 t of propellant.', use: 'Top up Δv without adding much mass.' },
  'tank-large': { what: 'Holds 7.6 t of propellant.', use: 'Main fuel for the upper stage.' },
  'tank-heavy': { what: 'Holds 30.4 t of propellant.', use: 'Booster fuel for Stage 1.' },
  'engine-launch': { what: 'High thrust, lower efficiency (Isp 300 s).', use: 'Put at the very bottom to lift off (TWR ≥ 1.2).' },
  'engine-space': { what: 'Low thrust, very efficient (Isp 450 s).', use: 'Upper stage only: too weak to lift off.' },
  'solar-panel': { what: 'Turns sunlight into electricity.', use: 'Light power source for any target.' },
  'rtg': { what: 'Nuclear battery: power day and night.', use: 'Use where sunlight is weak or dusty.' },
  'antenna': { what: "Sends data home to NASA's Deep Space Network.", use: 'Required: without it the mission is silent.' },
  'heat-shield': { what: 'Survives ~1,300 °C when diving into air.', use: 'Required for Mars. Dead weight elsewhere.' },
  'parachute': { what: 'Slows the lander down in an atmosphere.', use: 'Mars only: the Moon has no air.' },
  'landing-legs': { what: 'Absorb touchdown and keep the lander upright.', use: 'Required for Moon and Mars landings.' },
  'decoupler': { what: 'Splits the rocket into stages.', use: 'Drop empty tanks to save mass → more Δv.' },
};
