/**
 * planetTextures.ts: renders textured, sunlit, spinning planet spheres for the canvas.
 *
 * Textures: Solar System Scope 2K maps (CC BY 4.0), https://www.solarsystemscope.com/textures/
 * Each equirectangular map is projected onto an orthographic sphere pixel by pixel,
 * lit from the Sun's direction, and cached until the spin angle or light changes.
 */

import { FACTSHEET } from '../data/planets';

export type BodyId = 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

const FILES: Record<BodyId, string> = {
  sun: '2k_sun.jpg',
  mercury: '2k_mercury.jpg',
  venus: '2k_venus_atmosphere.jpg',
  earth: '2k_earth_daymap.jpg',
  moon: '2k_moon.jpg',
  mars: '2k_mars.jpg',
  jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg',
  uranus: '2k_uranus.jpg',
  neptune: '2k_neptune.jpg',
};

/** Sidereal rotation period, days, from the scraped fact sheet (Sun: 25.38 d). Negative = retrograde. */
const SPIN_DAYS = Object.fromEntries((Object.keys(FILES) as BodyId[]).map((id) => [
  id, id === 'sun' ? 25.38 : FACTSHEET.bodies[id].rotationPeriod / 24,
])) as Record<BodyId, number>;

/** URL of a texture, relative to the deployed base path. */
export const textureUrl = (id: BodyId) => `${import.meta.env.BASE_URL}textures/${FILES[id]}`;

/**
 * Visual spin in degrees per real second: Earth turns 10°/s, others in proportion
 * to their real rotation rate, clamped so slow rotators still visibly turn.
 */
export function spinDegPerSec(id: BodyId): number {
  const rate = 10 / Math.abs(SPIN_DAYS[id]);
  return Math.sign(SPIN_DAYS[id]) * Math.max(0.4, Math.min(10, rate));
}

interface Tex { data: Uint8ClampedArray; w: number; h: number }
const textures: Partial<Record<BodyId, Tex>> = {};
let loadingStarted = false;

/** Start loading every texture once; spheres fall back to flat colour until loaded. */
export function loadPlanetTextures(): void {
  if (loadingStarted) return;
  loadingStarted = true;
  for (const id of Object.keys(FILES) as BodyId[]) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // Downsample to 1024×512 for sampling, which is plenty for spheres ≤160 px
      const w = 1024, h = 512;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      cx.drawImage(img, 0, 0, w, h);
      textures[id] = { data: cx.getImageData(0, 0, w, h).data, w, h };
    };
    img.src = textureUrl(id);
  }
}

interface Cached { canvas: HTMLCanvasElement; size: number; lon: number; lx: number; ly: number }
const cache = new Map<BodyId, Cached>();

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Get a sphere image for a body.
 * @param sizePx  diameter in device pixels
 * @param lonDeg  spin angle (central meridian), degrees
 * @param lx,ly   unit vector toward the Sun in screen space (ignored for the Sun)
 * @returns a canvas to drawImage, or null while the texture is still loading
 */
export function sphereImage(id: BodyId, sizePx: number, lonDeg: number, lx: number, ly: number): HTMLCanvasElement | null {
  const tex = textures[id];
  if (!tex) return null;
  const size = Math.max(8, Math.min(160, Math.round(sizePx)));
  const hit = cache.get(id);
  if (hit && hit.size === size && angDiff(hit.lon, lonDeg) < 1.2 && Math.hypot(hit.lx - lx, hit.ly - ly) < 0.03) return hit.canvas;

  const canvas = hit?.size === size ? hit.canvas : document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(size, size);
  const px = out.data;
  const r = size / 2;
  const emissive = id === 'sun';
  // Light comes from the Sun's screen direction, tilted toward the top-down viewer
  // so the visible face is mostly lit with a terminator on the far side
  const lz = 0.9, ln = Math.hypot(lx, ly, lz) || 1;
  const Lx = lx / ln, Ly = ly / ln, Lz = lz / ln;
  const rot = (lonDeg * Math.PI) / 180;
  const { data, w, h } = tex;

  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5 - r) / r;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - r) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      // Orthographic sphere → latitude/longitude → texture coordinates
      const lat = Math.asin(-ny);
      const lon = Math.atan2(nx, nz) + rot;
      let u = lon / (2 * Math.PI);
      u -= Math.floor(u);
      const v = 0.5 - lat / Math.PI;
      const ti = ((Math.min(h - 1, (v * h) | 0) * w) + ((u * w) | 0)) * 4;
      const shade = emissive
        ? 0.55 + 0.5 * nz // limb darkening
        : 0.16 + 0.98 * Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const o = (y * size + x) * 4;
      px[o] = Math.min(255, data[ti] * shade);
      px[o + 1] = Math.min(255, data[ti + 1] * shade);
      px[o + 2] = Math.min(255, data[ti + 2] * shade);
      px[o + 3] = Math.min(255, (1 - Math.sqrt(d2)) * r * 2 * 255); // anti-aliased edge
    }
  }
  ctx.putImageData(out, 0, 0);
  cache.set(id, { canvas, size, lon: lonDeg, lx, ly });
  return canvas;
}
