# Odyssey13

A 2D space-mission design game for the **NASA Space Apps Challenge 2026: "Space Mission Design Game"**.
Build a rocket, check it against real physics, then fly a Hohmann transfer to the **Moon** or **Mars**.

**Team Phantom6.** Data: NASA NSSDCA Planetary Fact Sheet; JPL Approximate Positions of the Planets.
Planet textures: [Solar System Scope](https://www.solarsystemscope.com/textures/) 2K maps, CC BY 4.0 (in `public/textures/`).

## How to play

1. **Build.** Pick a target and click parts to stack them, listed top → bottom. A **Decoupler** splits the stack into stages; Stage 1 is the bottom stage and fires first. The live checklist on the right shows ✅/❌ for required parts, landing gear for the chosen target, liftoff TWR and Δv.
2. **Launch.** Planets orbit at real relative speeds, starting from today's real positions. For Mars, the game fast-forwards to the next launch window (Mars ~44° ahead of Earth), then flies the 259-day transfer. For the Moon, the view zooms into the Earth–Moon system. Popups show stage separations and each landing step.
3. **Result.** Success, or the exact reason for failure with numbers (e.g. *"Not enough delta-v: 3,850 / 4,300 m/s after orbit"*) and a tip to fix it.

Use **Load example** for a working build. **Launch anyway** lets you fly a broken rocket and see it fail realistically: it stays on the pad, falls back to Earth, runs out of fuel mid-transfer, burns up, crashes or tips over.

## Run locally

Needs Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

*(The project was scaffolded equivalently to `npm create vite@latest odyssey13 -- --template react-ts`.)*

## Deploy

**Vercel:** import the repo in Vercel. The Vite preset is detected automatically (build `npm run build`, output `dist`). Or run `npx vercel --prod`.

**GitHub Pages:** push to `main`, then in *Settings → Pages* set **Source = GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) builds and publishes `dist/`. `vite.config.ts` uses `base: './'`, so the site works from any sub-path.

## Code map

| File | What it does |
|---|---|
| `src/data/parts.ts` | All parts (mass, fuel, thrust, Isp, colour) and example builds. **Edit to rebalance.** |
| `src/data/planets.ts` | NASA fact-sheet data, Δv budgets per target, landing rules |
| `src/logic/validation.ts` | Pure physics: Tsiolkovsky Δv per stage, TWR, checklist, mission simulation |
| `src/logic/orbits.ts` | Pure orbital mechanics: Hohmann transfer time, launch-window phase angle, Kepler's equation |
| `src/components/Builder.tsx` | Build screen: parts panel, target picker, rocket stack |
| `src/components/RocketPreview.tsx` | SVG vector rocket with stage brackets |
| `src/components/Checklist.tsx` | Stat cards, Δv progress bar, live checklist, launch buttons |
| `src/components/OrbitView.tsx` | Canvas solar system and mission animation |
| `src/components/planetTextures.ts` | Projects the 2K texture maps onto lit, spinning spheres (spin rates from NASA rotation periods) |
| `src/components/Result.tsx` | Success/failure screen |

## The physics

- **Rocket equation (per stage):** `Δv = Isp × 9.81 × ln(m0 / mf)`. Here `m0` is the stage plus everything above it with full tanks, and `mf` is the same after the stage burns its own fuel. Several engines in one stage combine as `Isp = ΣF / Σ(F/Isp)`.
- **Liftoff TWR:** `Stage-1 thrust / (total mass × 9.81)`. Must be ≥ 1.2.
- **Δv budget:** Earth → low orbit 9,400 m/s. LEO → Moon surface 5,700 m/s (TLI + capture + fully powered descent). LEO → Mars surface 4,300 m/s (TMI + heat-shield aerobraking + short powered descent).
- **Orbits:** circular, angular speed = 360° / period (Mercury 88 d, Venus 224.7 d, Earth 365.25 d, Mars 687 d, Moon 27.32 d). The Mars transfer takes `T = ½ · a^1.5` years with `a = (1 + 1.524)/2 AU`, which is about 259 days. The ideal launch phase angle is `180° − 360° × T / 687 d`, about 44°.

### Balancing note
The original spec had tanks at 90% fuel (Small 200 kg dry / 1,800 kg fuel). At that ratio no 2-stage rocket can reach the 13,700 m/s needed for Mars: even a stage made only of tanks caps out near 6,800 m/s at Isp 300 s. Real orbital stages are about 92–96% propellant, so the tanks are now **95% fuel with the same total mass** (Small 100/1,900, Large 400/7,600). A **Heavy Tank** (equal to 4 Large) saves clicks. With these numbers the example builds reach Mars with 117 m/s to spare (90 t rocket) and the Moon with 467 m/s (163 t rocket). All numbers live in `parts.ts`.
