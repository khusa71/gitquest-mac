import { useLayoutEffect, useRef, useState } from 'react';
import type { LearningPath, LevelSummary } from '../../shared/view-model';
import { levelName } from './Workspace';

const PATH_TEXT: Record<LearningPath, string> = {
  agents: 'Your path for working with AI coding agents runs down main.',
  classic: 'Your path runs down main, level by level.',
  self: 'Pick any topic.',
};

/** Graph gutter: lane x positions (main, then the optional branch). */
const LANE_X = [12, 40] as const;
const GUTTER = 64;

/**
 * The levels drawn like `git log --graph`: the suggested path is main, optional levels sit on a branch that
 * forks off the level before them and merges back into the next one on main.
 */
export function Levels({ levels, path, openLevel, openLesson }: { levels: readonly LevelSummary[]; path: LearningPath | null; openLevel: (l: LevelSummary) => void; openLesson: (l: LevelSummary) => void }) {
  const rows = [...levels].sort((a, b) => a.number - b.number);
  const lane = (l: LevelSummary): 0 | 1 => (l.suggestedOrder === null ? 1 : 0);
  const list = useRef<HTMLOListElement>(null);
  // Vertical centre of each row, measured (rows grow with their text).
  const [ys, setYs] = useState<number[]>([]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = (): void => {
      const next = [...el.children].map((c) => (c as HTMLElement).offsetTop + (c as HTMLElement).offsetHeight / 2);
      setYs((prev) => (prev.length === next.length && prev.every((y, i) => y === next[i]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [levels]);

  const paths: { d: string; lane: 0 | 1 }[] = [];
  if (ys.length === rows.length) {
    const main = rows.map((l, i) => (lane(l) === 0 ? i : -1)).filter((i) => i >= 0);
    main.slice(1).forEach((i, k) => paths.push({ d: `M${LANE_X[0]} ${ys[main[k]!]} V${ys[i]}`, lane: 0 }));
    // Each run of optional levels: fork from the main level above, merge into the main level below.
    for (let i = 0; i < rows.length; i++) {
      if (lane(rows[i]!) === 0 || (i > 0 && lane(rows[i - 1]!) === 1)) continue;
      let j = i;
      while (j + 1 < rows.length && lane(rows[j + 1]!) === 1) j++;
      const [x0, x1] = LANE_X;
      const top = ys[i]!, bottom = ys[j]!;
      if (i > 0) {
        const from = ys[i - 1]!;
        paths.push({ d: `M${x0} ${from} C${x0} ${(from + top) / 2} ${x1} ${(from + top) / 2} ${x1} ${top}`, lane: 1 });
      }
      if (j > i) paths.push({ d: `M${x1} ${top} V${bottom}`, lane: 1 });
      if (j + 1 < rows.length) {
        const to = ys[j + 1]!;
        paths.push({ d: `M${x1} ${bottom} C${x1} ${(bottom + to) / 2} ${x0} ${(bottom + to) / 2} ${x0} ${to}`, lane: 1 });
      }
      i = j;
    }
  }
  const done = levels.reduce((s, l) => s + l.done, 0);
  const planned = levels.reduce((s, l) => s + l.planned, 0);

  return (
    <main className="page">
      <div className="levels-top">
        <div>
          <h1 className="page-title">Levels</h1>
          <p className="muted page-sub">{path ? PATH_TEXT[path] : ''} Optional levels branch off and merge back. Every level is open.</p>
        </div>
        <span className="small muted">{done} of {planned} missions done</span>
      </div>

      <div className="level-graph">
        <svg className="level-rail" aria-hidden="true">
          {paths.map((p) => <path key={p.d} d={p.d} className={`lane-${p.lane}`} />)}
          {ys.length === rows.length && rows.map((l, i) => {
            const here = l.missions.some((m) => m.state === 'current');
            const complete = l.planned > 0 && l.done >= l.planned;
            return (
              <circle
                key={l.id}
                cx={LANE_X[lane(l)]}
                cy={ys[i]}
                r={here ? 7 : 5}
                className={`lane-${lane(l)}${complete ? ' complete' : ''}${here ? ' here' : ''}`}
              />
            );
          })}
        </svg>
        <ol ref={list} className="plain level-rows" aria-label="Levels" style={{ paddingLeft: GUTTER }}>
          {rows.map((l) => (
            <li key={l.id}><LevelRow level={l} optional={lane(l) === 1} openLevel={openLevel} openLesson={openLesson} /></li>
          ))}
        </ol>
      </div>
    </main>
  );
}

/** "Lesson read · quiz 6 of 7", null when the level has no lesson yet. */
export function lessonStatus(lesson: LevelSummary['lesson']): string | null {
  if (lesson.slides === 0) return null;
  if (lesson.quizScore !== null) return `Lesson read · quiz ${lesson.quizScore} of ${lesson.quizTotal}`;
  return lesson.read ? 'Lesson read · quiz not taken' : `Lesson · ${lesson.slides} slides`;
}

function LevelRow({ level, optional, openLevel, openLesson }: { level: LevelSummary; optional: boolean; openLevel: (l: LevelSummary) => void; openLesson: (l: LevelSummary) => void }) {
  const here = level.missions.some((m) => m.state === 'current');
  const complete = level.planned > 0 && level.done >= level.planned;
  const playable = level.missions.length > 0;
  const progress = `${level.done} of ${level.planned}${optional ? ' · optional' : ''}`;
  const status = here
    ? <span className="small tone-accent">{progress} · you are here</span>
    : complete
      ? <span className="small tone-success">{progress} done</span>
      : <span className="small muted">{progress}{playable ? '' : ' · coming soon'}</span>;
  const body = (
    <span className="level-text">
      <span><b>{levelName(level)}{level.online ? ' · online' : ''}</b> <span className="muted">{level.topics}</span></span>
      <span className="level-status">
        {status}
        {level.warning && <span className="small tone-attention">{level.warning}</span>}
      </span>
    </span>
  );
  const lesson = lessonStatus(level.lesson);
  return (
    <div className={`dcard level-card${here ? ' here' : ''}`}>
      {playable ? (
        <button type="button" className="level-open" onClick={() => openLevel(level)}>{body}</button>
      ) : (
        <div className="level-open">{body}</div>
      )}
      {lesson && (
        <div className="level-lesson">
          <span className="small muted">{lesson}</span>
          <button type="button" className="btn sm" onClick={() => openLesson(level)} aria-label={`Read the ${level.title} lesson`}>Lesson</button>
        </div>
      )}
    </div>
  );
}
