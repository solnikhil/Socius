/**
 * Socius's own silhouette: a soft nine-lobed "cookie" no specialist can pick, traced
 * as a smooth closed curve through points on r(θ) = 16.4 + 1.25·cos 9θ.
 */
export const sociusPath = (() => {
  const steps = 72;
  const pts = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    const r = 16.4 + 1.25 * Math.cos(9 * t);
    return [20 + r * Math.sin(t), 21 - r * Math.cos(t)] as const;
  });
  const at = (i: number) => pts[(i + steps) % steps]!;
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  // Catmull-Rom segments as cubic Béziers keep the scallops smooth.
  for (let i = 0; i < steps; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return `${d}z`;
})();
