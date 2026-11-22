import { existsSync, watch } from 'node:fs';

/**
 * Watches the repo (recursive) for changes made outside the terminal, e.g. an edit in VS Code.
 * Events while `isQuiet()` are ignored; the rest are debounced 300 ms.
 * Returns a close function, or null when the directory doesn't exist yet (re-arm after setup).
 */
export function watchRepo(dir: string, isQuiet: () => boolean, onChange: () => void): (() => void) | null {
  if (!existsSync(dir)) return null;
  let timer: NodeJS.Timeout | null = null;
  try {
    const w = watch(dir, { recursive: true }, () => {
      if (isQuiet()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!isQuiet()) onChange();
      }, 300);
    });
    w.on('error', (e) => console.error('[gitquest] repo watcher', e));
    return () => {
      if (timer) clearTimeout(timer);
      w.close();
    };
  } catch (e) {
    console.error('[gitquest] could not watch', dir, e);
    return null;
  }
}
