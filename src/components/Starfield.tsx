import { useEffect, useRef } from 'react';

/** Fixed full-screen starfield drawn once per resize (vector dots, no images). */
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    // Deterministic pseudo-random so stars don't jump on resize
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 260 }, () => ({
      x: rand(), y: rand(), r: rand() * 1.1 + 0.25, a: rand() * 0.6 + 0.15, hue: rand(),
    }));

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx.fillStyle = s.hue > 0.85 ? `rgba(255,214,170,${s.a})` : s.hue < 0.15 ? `rgba(170,200,255,${s.a})` : `rgba(255,255,255,${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
