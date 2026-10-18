export const mod = (a, n) => ((a % n) + n) % n;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);

// mulberry32: small seeded PRNG so a seed always gives the same track
export function rng(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// mix a #rrggbb colour towards white (a>0) or black (a<0)
export function shade(h, a) {
  const n = parseInt(h.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const T = a > 0 ? 255 : 0, k = Math.abs(a);
  r = Math.round(r + (T - r) * k); g = Math.round(g + (T - g) * k); b = Math.round(b + (T - b) * k);
  return `rgb(${r},${g},${b})`;
}
