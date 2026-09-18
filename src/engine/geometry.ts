/**
 * Geometry helpers shared by the renderer and the camera.
 *
 * Canvas space: pixels at zoom 1, with the spread origin at (0, 0). The canvas
 * element is positioned so that its (0, 0) is the top-left of the table
 * surface; the camera offsets and scales it.
 *
 *   screen = canvas * zoom + offset
 */
import type { LooseCard, SlotDef, SpreadDef } from './types';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Camera {
  zoom: number;
  x: number;
  y: number;
}

export interface CardSize {
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Screen → canvas coordinates. */
export function screenToCanvas(p: Point, cam: Camera): Point {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

/** Canvas → screen coordinates. */
export function canvasToScreen(p: Point, cam: Camera): Point {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y };
}

/** Card units → canvas pixels (centre point). */
export function unitsToCanvas(p: Point, card: CardSize): Point {
  return { x: p.x * card.width, y: p.y * card.height };
}

/** Canvas pixels → card units. */
export function canvasToUnits(p: Point, card: CardSize): Point {
  return { x: p.x / card.width, y: p.y / card.height };
}

/** Zooms so that the canvas point under `focus` (screen coords) stays put. */
export function zoomAround(cam: Camera, newZoom: number, focus: Point): Camera {
  const zoom = clampZoom(newZoom);
  const before = screenToCanvas(focus, cam);
  return { zoom, x: focus.x - before.x * zoom, y: focus.y - before.y * zoom };
}

/** Axis-aligned bounding box of a (possibly rotated) card centred at `c`. */
export function cardBounds(c: Point, card: CardSize, rotation = 0): Bounds {
  const sideways = Math.abs(((rotation % 180) + 180) % 180 - 90) < 1;
  const w = sideways ? card.height : card.width;
  const h = sideways ? card.width : card.height;
  return { minX: c.x - w / 2, minY: c.y - h / 2, maxX: c.x + w / 2, maxY: c.y + h / 2 };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  return list.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

/** Bounding box, in canvas pixels, of every slot of a spread. */
export function spreadBounds(spread: SpreadDef, card: CardSize): Bounds | null {
  return unionBounds(spread.slots.map((s) => cardBounds(unitsToCanvas(s, card), card, s.rotation ?? 0)));
}

/** Bounding box of slots plus loose cards. */
export function tableBounds(spread: SpreadDef, loose: readonly LooseCard[], card: CardSize): Bounds | null {
  const all = [
    ...spread.slots.map((s) => cardBounds(unitsToCanvas(s, card), card, s.rotation ?? 0)),
    ...loose.map((l) => cardBounds(unitsToCanvas(l, card), card, 0)),
  ];
  return unionBounds(all);
}

/**
 * Camera that fits `bounds` inside `viewport` (a rect in screen coordinates)
 * with `padding` pixels on every side. Never zooms above `maxZoom`.
 */
export function fitCamera(bounds: Bounds | null, viewport: Rect, padding = 16, maxZoom = 1.25): Camera {
  const vw = Math.max(1, viewport.width - padding * 2);
  const vh = Math.max(1, viewport.height - padding * 2);
  if (!bounds) {
    return { zoom: 1, x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
  }
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(Math.min(vw / bw, vh / bh, maxZoom));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    x: viewport.left + viewport.width / 2 - cx * zoom,
    y: viewport.top + viewport.height / 2 - cy * zoom,
  };
}

/** Distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Rect of a slot in canvas pixels (unrotated card size at slot centre). */
export function slotRect(slot: SlotDef, card: CardSize): Rect {
  const c = unitsToCanvas(slot, card);
  return { left: c.x - card.width / 2, top: c.y - card.height / 2, width: card.width, height: card.height };
}
