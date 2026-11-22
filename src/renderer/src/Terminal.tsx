import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { GitQuestApi } from '../../shared/api';

// GitHub Primer dark terminal colours.
const THEME = {
  background: '#010409', foreground: '#e6edf3', cursor: '#e6edf3', cursorAccent: '#010409',
  selectionBackground: '#264f78',
  black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#ffffff',
};

export function Terminal({ api }: { api: GitQuestApi }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new XTerm({
      fontFamily: '"SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const offData = api.terminal.onData((d) => term.write(d));
    const input = term.onData((d) => api.terminal.write(d));
    let size = '';
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      fit.fit();
      const next = `${term.cols}x${term.rows}`;
      if (next !== size) {
        size = next;
        api.terminal.resize(term.cols, term.rows);
      }
    });
    ro.observe(el);
    term.focus();
    return () => {
      ro.disconnect();
      offData();
      input.dispose();
      term.dispose();
    };
  }, [api]);

  return <div ref={host} className="term-host" aria-label="Terminal, zsh in the practice repo" />;
}
