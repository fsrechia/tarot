import { describe, expect, it } from 'vitest';
import { cardBounds, fitCamera, screenToCanvas, spreadBounds, zoomAround } from '../../src/engine/geometry';
import { celticCross, threeCard } from '../../src/spreads/tarot';

const card = { width: 100, height: 170 };

describe('zoomAround', () => {
  it('keeps the focus point fixed', () => {
    const cam = { zoom: 1, x: 40, y: 30 };
    const focus = { x: 300, y: 200 };
    const before = screenToCanvas(focus, cam);
    const after = zoomAround(cam, 2, focus);
    const now = screenToCanvas(focus, after);
    expect(now.x).toBeCloseTo(before.x);
    expect(now.y).toBeCloseTo(before.y);
    expect(after.zoom).toBe(2);
  });

  it('clamps zoom', () => {
    expect(zoomAround({ zoom: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }).zoom).toBe(3);
    expect(zoomAround({ zoom: 1, x: 0, y: 0 }, 0.01, { x: 0, y: 0 }).zoom).toBe(0.25);
  });
});

describe('cardBounds', () => {
  it('swaps width and height for a sideways card', () => {
    const b = cardBounds({ x: 0, y: 0 }, card, 90);
    expect(b.maxX - b.minX).toBe(170);
    expect(b.maxY - b.minY).toBe(100);
  });
});

describe('fitCamera', () => {
  it('fits a wide spread inside a narrow viewport', () => {
    const bounds = spreadBounds(celticCross, card)!;
    const viewport = { left: 0, top: 0, width: 360, height: 640 };
    const cam = fitCamera(bounds, viewport, 16);
    const w = (bounds.maxX - bounds.minX) * cam.zoom;
    const h = (bounds.maxY - bounds.minY) * cam.zoom;
    expect(w).toBeLessThanOrEqual(360 - 32 + 0.001);
    expect(h).toBeLessThanOrEqual(640 - 32 + 0.001);
    // centred
    const cx = ((bounds.minX + bounds.maxX) / 2) * cam.zoom + cam.x;
    expect(cx).toBeCloseTo(180);
  });

  it('does not zoom above maxZoom for a small spread', () => {
    const bounds = spreadBounds(threeCard, card)!;
    const cam = fitCamera(bounds, { left: 0, top: 0, width: 2000, height: 2000 }, 16, 1.25);
    expect(cam.zoom).toBe(1.25);
  });
});
