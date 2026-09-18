/**
 * Tap / long-press / drag recogniser for a single pointer.
 *
 * - A pointer that is released before moving `threshold` px is a *tap*.
 * - A pointer held still for `longPressMs` is a *long press* (no tap follows).
 * - Moving beyond the threshold starts a *drag*; the caller renders a ghost
 *   from `session` and receives `onDrop` with the final pointer position.
 * - `pointercancel`, window blur and an explicit `cancel()` (e.g. when a
 *   second finger starts a pinch) abort without side effects.
 *
 * Move/up/cancel are listened on `window` so the gesture survives the source
 * element being re-rendered or the pointer leaving the element.
 */
import { onBeforeUnmount, shallowRef, type ShallowRef } from 'vue';

export interface DragSession<T> {
  data: T;
  pointerId: number;
  pointerType: string;
  /** Current pointer position (client coordinates). */
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
  /** Where inside the source element the pointer grabbed it, as a fraction 0..1. */
  grabX: number;
  grabY: number;
  /** Source element size at grab time (client pixels). */
  width: number;
  height: number;
  /** True once the movement threshold was exceeded. */
  active: boolean;
}

export interface DragHandlers<T> {
  threshold?: number;
  longPressMs?: number;
  onTap?: (data: T, e: PointerEvent) => void;
  onLongPress?: (data: T, e: PointerEvent) => void;
  onDragStart?: (session: DragSession<T>) => void;
  onDrop?: (session: DragSession<T>, e: PointerEvent) => void;
  onCancel?: (session: DragSession<T>) => void;
}

export function usePointerDrag<T>(handlers: DragHandlers<T>) {
  const session: ShallowRef<DragSession<T> | null> = shallowRef(null);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  let captured: { el: Element; id: number } | null = null;

  const clearTimer = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  const detach = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    clearTimer();
    if (captured) {
      try {
        captured.el.releasePointerCapture?.(captured.id);
      } catch {
        /* already released */
      }
      captured = null;
    }
  };

  const finish = () => {
    detach();
    session.value = null;
  };

  const begin = (e: PointerEvent, data: T, el: HTMLElement) => {
    if (session.value) return;
    if (e.button !== 0) return; // left button / primary touch only
    const rect = el.getBoundingClientRect();
    const threshold = handlers.threshold ?? (e.pointerType === 'mouse' ? 4 : 8);
    session.value = {
      data,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      clientX: e.clientX,
      clientY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      grabX: rect.width ? (e.clientX - rect.left) / rect.width : 0.5,
      grabY: rect.height ? (e.clientY - rect.top) / rect.height : 0.5,
      width: rect.width,
      height: rect.height,
      active: false,
    };
    longPressed = false;
    thresholdPx = threshold;

    try {
      el.setPointerCapture(e.pointerId);
      captured = { el, id: e.pointerId };
    } catch {
      captured = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);

    if (handlers.onLongPress) {
      longPressTimer = setTimeout(() => {
        const s = session.value;
        if (!s || s.active) return;
        longPressed = true;
        handlers.onLongPress?.(s.data, e);
        finish();
      }, handlers.longPressMs ?? 450);
    }
  };

  let thresholdPx = 8;

  const onMove = (e: PointerEvent) => {
    const s = session.value;
    if (!s || e.pointerId !== s.pointerId) return;
    const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
    if (!s.active) {
      if (moved < thresholdPx) return;
      clearTimer();
      session.value = { ...s, active: true, clientX: e.clientX, clientY: e.clientY };
      handlers.onDragStart?.(session.value);
      return;
    }
    session.value = { ...s, clientX: e.clientX, clientY: e.clientY };
  };

  const onUp = (e: PointerEvent) => {
    const s = session.value;
    if (!s || e.pointerId !== s.pointerId) return;
    if (longPressed) return finish();
    if (s.active) {
      const final = { ...s, clientX: e.clientX, clientY: e.clientY };
      finish();
      handlers.onDrop?.(final, e);
    } else {
      finish();
      handlers.onTap?.(s.data, e);
    }
  };

  const onCancel = (e: PointerEvent) => {
    const s = session.value;
    if (!s || e.pointerId !== s.pointerId) return;
    cancel();
  };

  const onBlur = () => cancel();

  const cancel = () => {
    const s = session.value;
    if (!s) return;
    finish();
    handlers.onCancel?.(s);
  };

  onBeforeUnmount(detach);

  return { session, begin, cancel };
}
