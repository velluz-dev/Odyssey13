/** Small "i" bubble with a one-sentence explanation shown on hover or focus. */
export default function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} aria-label={text}>
      i<span className="info-bubble" role="tooltip">{text}</span>
    </span>
  );
}

export const TIPS = {
  twr: 'Thrust-to-weight ratio = engine thrust ÷ rocket weight: above 1 the rocket rises, and NASA-style launches want about 1.2 or more so they don’t waste fuel fighting gravity.',
  dv: 'Delta-v (Δv) is the total change in speed your fuel can buy, from the rocket equation Δv = Isp × 9.81 × ln(full mass ÷ empty mass), and every maneuver spends some of it.',
  isp: 'Specific impulse (Isp) measures engine efficiency: more seconds means more push from each kilogram of fuel.',
  stages: 'Staging drops empty tanks and engines so the rest of the rocket is lighter, which is why real rockets use 2–3 stages.',
};
