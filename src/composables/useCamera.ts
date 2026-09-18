/**
 * Pan / zoom / pinch camera for the table surface.
 *
 * - Coordinates are surface-local pixels (0,0 = top-left of the surface).
 * - Every pointer that goes down on the surface is tracked; move/up/cancel
 *   are listened on `window`, so a finger lifted over the toolbar can never
 *   leave a phantom pointer behind.
 * - One pointer pans only when it started on the background (or middle mouse).
 * - Two pointers always pinch-zoom + pan, even if the first one started on a
 *   card (the caller cancels its drag via `onPinchStart`).
 * - Wheel zooms around the cursor; trackpad pinch arrives as ctrl+wheel.
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import {
  clampZoom,
  distance,
  fitCamera,
  midpoint,
  screenToCanvas as s2c,
  zoomAround,
  type Bounds,
  type Camera,
  type Point,
  type Rect,
} from '../engine/geometry';

export interface CameraOptions {
  /** Whether a pointerdown target should start a pan (true for empty table). */
  isBackground: (target: EventTarget | null) => boolean;
  onPinchStart?: () => void;
  onUserMove?: () => void;
}

export interface Reserve {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TrackedPointer {
  id: number;
  x: number;
  y: number;
  pans: boolean;
}

export function useCamera(surface: Ref<HTMLElement | null>, opts: CameraOptions) {
  const camera = ref<Camera>({ zoom: 1, x: 0, y: 0 });
  const pointers = new Map<number, TrackedPointer>();
  const pointerCount = ref(0);

  let panAnchor: Point | null = null;
  let cameraAtAnchor: Camera | null = null;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  const transformStyle = computed(
    () => `translate(${camera.value.x}px, ${camera.value.y}px) scale(${camera.value.zoom})`,
  );

  const surfaceRect = (): DOMRect => surface.value?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);

  const toLocal = (e: { clientX: number; clientY: number }): Point => {
    const r = surfaceRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The part of the surface not covered by overlays (drawer, floating buttons). */
  const viewport = (reserve: Partial<Reserve> = {}): Rect => {
    const r = surfaceRect();
    const { top = 0, bottom = 0, left = 0, right = 0 } = reserve;
    return { left, top, width: Math.max(1, r.width - left - right), height: Math.max(1, r.height - top - bottom) };
  };

  const fit = (bounds: Bounds | null, reserve: Partial<Reserve> = {}, padding = 16, maxZoom = 1.25) => {
    camera.value = fitCamera(bounds, viewport(reserve), padding, maxZoom);
  };

  const zoomBy = (factor: number, focus?: Point) => {
    const r = surfaceRect();
    const f = focus ?? { x: r.width / 2, y: r.height / 2 };
    camera.value = zoomAround(camera.value, clampZoom(camera.value.zoom * factor), f);
  };

  const beginPan = (anchor: Point) => {
    panAnchor = anchor;
    cameraAtAnchor = { ...camera.value };
  };

  const onPointerDown = (e: PointerEvent) => {
    const p = toLocal(e);
    const pans = e.button === 1 || (e.button === 0 && opts.isBackground(e.target));
    pointers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, pans });
    pointerCount.value = pointers.size;

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values()) as [TrackedPointer, TrackedPointer];
      pinchStartDist = distance(a, b) || 1;
      pinchStartZoom = camera.value.zoom;
      beginPan(midpoint(a, b));
      opts.onPinchStart?.();
    } else if (pointers.size === 1 && pans) {
      beginPan(p);
      if (e.button === 1) e.preventDefault();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const tracked = pointers.get(e.pointerId);
    if (!tracked) return;
    const p = toLocal(e);
    tracked.x = p.x;
    tracked.y = p.y;

    if (pointers.size === 2 && panAnchor && cameraAtAnchor) {
      const [a, b] = Array.from(pointers.values()) as [TrackedPointer, TrackedPointer];
      const mid = midpoint(a, b);
      const zoom = clampZoom((pinchStartZoom * distance(a, b)) / pinchStartDist);
      // Keep the canvas point that was under the initial midpoint under the current midpoint.
      const anchorCanvas = s2c(panAnchor, cameraAtAnchor);
      camera.value = { zoom, x: mid.x - anchorCanvas.x * zoom, y: mid.y - anchorCanvas.y * zoom };
      opts.onUserMove?.();
    } else if (pointers.size === 1 && tracked.pans && panAnchor && cameraAtAnchor) {
      camera.value = {
        zoom: cameraAtAnchor.zoom,
        x: cameraAtAnchor.x + (p.x - panAnchor.x),
        y: cameraAtAnchor.y + (p.y - panAnchor.y),
      };
      opts.onUserMove?.();
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    pointerCount.value = pointers.size;
    if (pointers.size === 1) {
      // From pinch back to one finger: continue as a pan from here.
      const [rest] = Array.from(pointers.values()) as [TrackedPointer];
      rest.pans = true;
      beginPan(rest);
    } else if (pointers.size === 0) {
      panAnchor = null;
      cameraAtAnchor = null;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
    zoomBy(factor, toLocal(e));
    opts.onUserMove?.();
  };

  const onBlur = () => {
    pointers.clear();
    pointerCount.value = 0;
    panAnchor = null;
    cameraAtAnchor = null;
  };

  onMounted(() => {
    const el = surface.value;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
  });

  onBeforeUnmount(() => {
    const el = surface.value;
    el?.removeEventListener('pointerdown', onPointerDown);
    el?.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', onBlur);
  });

  const screenToCanvas = (client: { clientX: number; clientY: number }): Point => s2c(toLocal(client), camera.value);

  return { camera, transformStyle, pointerCount, fit, zoomBy, viewport, toLocal, screenToCanvas, surfaceRect };
}
