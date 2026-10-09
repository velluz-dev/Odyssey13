import { useEffect, useRef } from 'react';

/*
 * Celebration: confetti rain + rising sparks + an opening burst, drawn over the
 * Result screen when a mission succeeds. Pure canvas, self-cleaning on unmount.
 */

const COLORS = ['#7ee081', '#ffd166', '#7fd4ff', '#ff9ecf', '#ffffff', '#c7b2ff'];

interface P {
  kind: 'confetti' | 'spark' | 'burst';
  x: number; y: number; vx: number; vy: number;
  w: number; rot: number; vr: number;
  col: string; ph: number; life: number; age: number;
}

export default function Celebration() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let seed = (Date.now() % 2147483646) + 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    let W = 0, H = 0;
    const fit = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);

    const pick = () => COLORS[(rand() * COLORS.length) | 0];
    const confetti = (top: boolean): P => ({
      kind: 'confetti', x: rand() * W, y: top ? -10 - rand() * H * 0.3 : rand() * H,
      vx: (rand() - 0.5) * 30, vy: 70 + rand() * 110,
      w: 5 + rand() * 6, rot: rand() * Math.PI * 2, vr: (rand() - 0.5) * 9,
      col: pick(), ph: rand() * Math.PI * 2, life: 0, age: 0,
    });
    const spark = (): P => ({
      kind: 'spark', x: rand() * W, y: H * (0.55 + rand() * 0.45),
      vx: (rand() - 0.5) * 24, vy: -(30 + rand() * 70),
      w: 1.2 + rand() * 1.8, rot: 0, vr: 0,
      col: pick(), ph: rand() * Math.PI * 2, life: 0, age: 0,
    });

    const parts: P[] = Array.from({ length: 130 }, () => confetti(false));
    for (let i = 0; i < 45; i++) parts.push(spark());
    // Opening burst from the top of the card
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, sp = 90 + rand() * 260;
      parts.push({
        kind: 'burst', x: W / 2, y: H * 0.28,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        w: 2 + rand() * 3, rot: 0, vr: 0,
        col: pick(), ph: rand() * Math.PI * 2, life: 1.1 + rand() * 0.7, age: 0,
      });
    }

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        if (p.kind === 'confetti') {
          p.x += (p.vx + Math.sin(t * 2 + p.ph) * 26) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > H + 14) Object.assign(p, confetti(true));
          const flutter = Math.abs(Math.sin(t * 5 + p.ph));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.35 + 0.65 * flutter);
          ctx.fillStyle = p.col;
          ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
          ctx.restore();
        } else if (p.kind === 'spark') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < H * 0.15 || p.x < -8 || p.x > W + 8) Object.assign(p, spark(), { y: H + 6 });
          ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 9 + p.ph);
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          p.age += dt;
          if (p.age >= p.life) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 190 * dt;
          ctx.globalAlpha = 1 - p.age / p.life;
          ctx.fillStyle = p.col;
          ctx.fillRect(p.x - p.w / 2, p.y - p.w / 2, p.w, p.w);
          ctx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, []);

  return <canvas ref={ref} className="celebration" aria-hidden="true" />;
}
