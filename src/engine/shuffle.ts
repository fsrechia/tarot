import type { Rng } from './types';

/**
 * Returns a uniformly distributed number in [0, 1) using the Web Crypto API when
 * available, falling back to Math.random.
 */
export const cryptoRandom: Rng = () => {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }
  return Math.random();
};

/** Fisher–Yates shuffle. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng = cryptoRandom): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Deterministic RNG (mulberry32) for tests and reproducible readings. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
