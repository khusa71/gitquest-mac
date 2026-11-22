import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** A panel size in px, clamped and remembered per key (localStorage may be unavailable). */
export function usePanelSize(key: string, initial: number, min: number, max: number) {
  const clamp = useCallback((n: number) => Math.round(Math.min(max, Math.max(min, n))), [min, max]);
  const [size, setSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return saved > 0 ? clamp(saved) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(size));
    } catch {
      // Sizes are a convenience; nothing to do without storage.
    }
  }, [key, size]);
  const set = useCallback((n: number) => setSize(clamp(n)), [clamp]);
  return { size, set, initial };
}

interface Props {
  readonly label: string;
  readonly orientation: 'vertical' | 'horizontal';
  readonly panel: { readonly size: number; readonly set: (n: number) => void; readonly initial: number };
  readonly min: number;
  readonly max: number;
  /** 1 when dragging right/down grows the panel, -1 when it shrinks it. */
  readonly grows: 1 | -1;
}

/** Draggable divider between two panels: mouse drag, arrow keys (Shift for bigger steps), double-click to reset. */
export function Splitter({ label, orientation, panel, min, max, grows }: Props) {
  const vertical = orientation === 'vertical';

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const start = vertical ? event.clientX : event.clientY;
    const startSize = panel.size;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add(vertical ? 'resizing-x' : 'resizing-y');
    const move = (e: globalThis.PointerEvent) => panel.set(startSize + grows * ((vertical ? e.clientX : e.clientY) - start));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const back = vertical ? 'ArrowLeft' : 'ArrowUp';
    const forward = vertical ? 'ArrowRight' : 'ArrowDown';
    if (event.key === back) panel.set(panel.size - grows * step);
    else if (event.key === forward) panel.set(panel.size + grows * step);
    else if (event.key === 'Home') panel.set(min);
    else if (event.key === 'End') panel.set(max);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={panel.size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}. Drag, or use the arrow keys. Double-click to reset.`}
      className={vertical ? 'splitter splitter-x' : 'splitter splitter-y'}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => panel.set(panel.initial)}
    />
  );
}
