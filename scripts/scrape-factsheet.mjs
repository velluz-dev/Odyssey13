#!/usr/bin/env node
/**
 * Scrapes the NASA Planetary Fact Sheet (NSSDCA) into src/data/factsheet.json.
 *
 *   npm run data:factsheet            # fetch live from nssdc.gsfc.nasa.gov
 *   node scripts/scrape-factsheet.mjs page.html   # parse a saved copy
 *
 * Source: https://nssdc.gsfc.nasa.gov/planetary/factsheet/
 */
import { readFile, writeFile } from 'node:fs/promises';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first'); // NASA's IPv6 route can hang; IPv4 is reliable

const URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
const OUT = new globalThis.URL('../src/data/factsheet.json', import.meta.url);

/** Row label on the page → JSON key and unit. */
const FIELDS = {
  'Mass': ['mass', '1e24 kg'],
  'Diameter': ['diameter', 'km'],
  'Density': ['density', 'kg/m³'],
  'Gravity': ['gravity', 'm/s²'],
  'Escape Velocity': ['escapeVelocity', 'km/s'],
  'Rotation Period': ['rotationPeriod', 'hours'],
  'Length of Day': ['lengthOfDay', 'hours'],
  'Distance from Sun': ['distanceFromSun', '1e6 km'],
  'Perihelion': ['perihelion', '1e6 km'],
  'Aphelion': ['aphelion', '1e6 km'],
  'Orbital Period': ['orbitalPeriod', 'days'],
  'Orbital Velocity': ['orbitalVelocity', 'km/s'],
  'Orbital Inclination': ['orbitalInclination', 'degrees'],
  'Orbital Eccentricity': ['orbitalEccentricity', ''],
  'Obliquity to Orbit': ['obliquity', 'degrees'],
  'Mean Temperature': ['meanTemperature', '°C'],
  'Surface Pressure': ['surfacePressure', 'bars'],
  'Number of Moons': ['numberOfMoons', ''],
  'Ring System?': ['ringSystem', ''],
  'Global Magnetic Field?': ['magneticField', ''],
};

const strip = (html) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** "10,747" → 10747, "27.3*" → 27.3, "-1407.6" → -1407.6, "Yes" → true, "Unknown*" → null */
function value(raw) {
  const s = raw.replace(/\*/g, '').trim();
  if (/^yes$/i.test(s)) return true;
  if (/^no$/i.test(s)) return false;
  if (/^unknown$/i.test(s) || s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : s;
}

export function parse(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1])));
  const header = rows.find((r) => r.includes('MERCURY') && r.includes('NEPTUNE'));
  if (!header) throw new Error('Fact sheet table header not found: did the page layout change?');
  const names = header.slice(1).map((n) => n.toLowerCase());
  const bodies = Object.fromEntries(names.map((n) => [n, {}]));
  const units = {};
  for (const r of rows) {
    const label = r[0]?.replace(/\s*\(.*$/, '').trim();
    const field = FIELDS[label];
    if (!field || r.length < names.length + 1) continue;
    const [key, unit] = field;
    units[key] = unit;
    names.forEach((n, i) => { bodies[n][key] = value(r[i + 1]); });
  }
  return { source: 'NASA Planetary Fact Sheet, NSSDCA', url: URL, units, bodies };
}

const file = process.argv[2];
const html = file ? await readFile(file, 'utf8') : await (await fetch(URL)).text();
const data = { ...parse(html), retrieved: new Date().toISOString().slice(0, 10) };
const missing = Object.values(FIELDS).map(([k]) => k).filter((k) => !(k in data.units));
if (missing.length) console.warn('Fields not found on page:', missing.join(', '));
await writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${Object.keys(data.bodies).length} bodies × ${Object.keys(data.units).length} fields → src/data/factsheet.json`);
