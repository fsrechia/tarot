import { describe, expect, it } from 'vitest';
import { seededRng, shuffle } from '../../src/engine/shuffle';

describe('shuffle', () => {
  it('keeps every element exactly once', () => {
    const input = Array.from({ length: 22 }, (_, i) => i);
    const out = shuffle(input, seededRng(1));
    expect(out).toHaveLength(22);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4];
    const copy = [...input];
    shuffle(input, seededRng(7));
    expect(input).toEqual(copy);
  });

  it('is deterministic for a seed', () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    expect(shuffle(input, seededRng(42))).toEqual(shuffle(input, seededRng(42)));
  });

  it('actually changes order for a non-trivial deck', () => {
    const input = Array.from({ length: 22 }, (_, i) => i);
    expect(shuffle(input, seededRng(3))).not.toEqual(input);
  });
});
