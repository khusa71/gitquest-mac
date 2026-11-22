// Octicon-style 16px glyphs. Decorative: callers carry the text.

export const CheckCircle = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="#3fb950" d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0Z" /></svg>
);

export const CurrentCircle = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.25" fill="none" stroke="#4493f8" strokeWidth="1.5" /><circle cx="8" cy="8" r="2.5" fill="#4493f8" /></svg>
);

export const EmptyCircle = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);

export const Check = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="#3fb950" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" /></svg>
);

export const Cross = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="#f85149" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" /></svg>
);

/** Shared arrowhead marker for diagram lines; place once inside an <svg>. */
export const ArrowMarker = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible">
      <path d="M0 0 L4 2 L0 4 Z" fill="#9198a1" />
    </marker>
  </defs>
);

export const Alert = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="#d29922" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" /></svg>
);
