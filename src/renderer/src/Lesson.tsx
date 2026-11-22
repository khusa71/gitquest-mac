import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Diagram, GitQuestApi, Lesson as LessonData, Slide } from '../../shared/api';
import { DiagramView, inline } from './diagrams';
import { Check, Cross } from './icons';
import { speak, stopSpeaking } from './read-aloud';

interface Props {
  api: GitQuestApi;
  levelId: string;
  /** "1 Foundations" */
  levelLabel: string;
  act: (p: Promise<unknown>) => void;
  /** Leaves the lesson for the level's missions. */
  practice: () => void;
  practiceLabel: string;
}

export function Lesson({ api, levelId, levelLabel, act, practice, practiceLabel }: Props) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<'slides' | 'quiz'>('slides');
  const [reading, setReading] = useState(false);
  // Changing slide, switching to the quiz or leaving the lesson stops the voice.
  useEffect(() => {
    stopSpeaking();
    setReading(false);
  }, [slide, mode]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    act(api.lessons.get(levelId).then(({ lesson: l, progress }) => {
      setLesson(l);
      setSlide(Math.max(0, Math.min(progress.slide, l.slides.length - 1)));
    }));
  }, [api, act, levelId]);

  const count = lesson?.slides.length ?? 0;
  const go = (index: number): void => {
    if (index < 0 || index >= count || index === slide) return;
    setSlide(index);
    act(api.lessons.setSlide(levelId, index));
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (mode !== 'slides') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
      e.preventDefault();
      goRef.current(slide + (e.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, slide]);

  if (lesson === null) {
    return (
      <main className="page lesson-page" aria-busy="true">
        <p className="lesson-col muted">Loading the lesson…</p>
      </main>
    );
  }
  const current = lesson.slides[slide];
  const empty = count === 0;
  return (
    <main className="page lesson-page">
      <div className="lesson-col">
        <div className="lesson-top">
          <div>
            <p className="small muted">Lesson · {levelLabel}</p>
            <h1 className="page-title">{lesson.title || levelLabel}</h1>
            {lesson.summary && <p className="muted page-sub">{lesson.summary}</p>}
          </div>
          <div className="lesson-actions">
            {/* The last slide offers the quiz in its own navigation, so the header does not repeat it there. */}
            {!empty && lesson.quiz.length > 0 && (
              mode === 'slides'
                ? slide < count - 1 && <button type="button" className="btn" onClick={() => setMode('quiz')}>Take the quiz</button>
                : <button type="button" className="btn" onClick={() => setMode('slides')}>Back to the slides</button>
            )}
            {!empty && mode === 'slides' && current && (
              <button
                type="button"
                className="btn"
                aria-pressed={reading}
                onClick={() => {
                  if (reading) {
                    stopSpeaking();
                    setReading(false);
                  } else {
                    setReading(true);
                    speak(slideText(current), () => setReading(false), undefined, () => document.querySelector('.lesson-slide'));
                  }
                }}
              >
                {reading ? 'Stop reading' : 'Read aloud'}
              </button>
            )}
            <button type="button" className="btn" onClick={practice}>{practiceLabel}</button>
          </div>
        </div>

        {empty ? (
          <section className="panel subtle lesson-slide">
            <p className="muted">This lesson is still being written. The missions are ready to play.</p>
          </section>
        ) : mode === 'quiz' ? (
          <Quiz api={api} levelId={levelId} lesson={lesson} act={act} practice={practice} practiceLabel={practiceLabel} />
        ) : (
          <>
            <section className="panel subtle lesson-slide" aria-roledescription="slide" aria-labelledby="slide-title">
              {current && <SlideView slide={current} />}
            </section>
            <nav className="lesson-nav" aria-label="Slides">
              <button type="button" className="btn" disabled={slide === 0} onClick={() => go(slide - 1)}>
                Previous
              </button>
              <span className="small muted lesson-count" aria-live="polite" title="Left and right arrow keys move between slides">
                {slide + 1} of {count}
                <span className="sr-only">: {current?.title}</span>
              </span>
              {slide < count - 1 ? (
                <button type="button" className="btn primary" onClick={() => go(slide + 1)}>Next</button>
              ) : lesson.quiz.length > 0 ? (
                <button type="button" className="btn primary" onClick={() => setMode('quiz')}>Take the quiz</button>
              ) : (
                <button type="button" className="btn primary" onClick={practice}>{practiceLabel}</button>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  const title = <h2 id="slide-title" className="slide-title">{slide.title}</h2>;
  if (slide.kind === 'commands') {
    return (
      <>
        {title}
        <table className="cmd-table">
          <thead>
            <tr><th scope="col">Command</th><th scope="col">What it does</th></tr>
          </thead>
          <tbody>
            {slide.rows.map((r) => (
              <tr key={r.command} className={r.danger ? 'is-danger' : undefined}>
                <td><code>{r.command}</code>{r.danger && <span className="danger-tag">Can lose work</span>}</td>
                <td>{inline(r.does)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  if (slide.kind === 'pitfalls') {
    return (
      <>
        {title}
        <ol className="plain pitfalls">
          {slide.items.map((p, i) => (
            <li key={i}>
              <div><span className="small pit-label">Mistake</span><p>{inline(p.mistake)}</p></div>
              <svg aria-hidden="true" width="40" height="10" viewBox="0 0 40 10"><path d="M0 5h36M32 1l4 4-4 4" stroke="#9198a1" strokeWidth="1.5" fill="none" /></svg>
              <div><span className="small pit-label fix">Way out</span><p>{inline(p.fix)}</p></div>
            </li>
          ))}
        </ol>
      </>
    );
  }
  return (
    <>
      {title}
      <Concept body={slide.body} diagram={slide.diagram} />
      {slide.remember && (
        <p className="remember"><span className="strong">Remember</span><span>{inline(slide.remember)}</span></p>
      )}
    </>
  );
}

/** Text and diagram side by side when the diagram fits at its natural width next to readable text; else stacked. */
function Concept({ body, diagram }: { body: string; diagram: Diagram | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !diagram) return;
    const decide = (): void => {
      el.classList.add('measuring');
      const fig = el.querySelector<HTMLElement>(':scope > .diagram');
      // Natural width, plus anything that still overflows a scroller inside it (labels drawn past their padding).
      const overflow = Math.max(0, ...[...(fig?.querySelectorAll<HTMLElement>('*') ?? [])].map((n) => n.scrollWidth - n.clientWidth).filter((d) => d > 1 && d < 2000));
      const natural = (fig?.getBoundingClientRect().width ?? 0) + overflow;
      el.classList.remove('measuring');
      const layout = natural + 48 + 400 <= el.clientWidth ? 'side' : 'stack';
      el.style.setProperty('--diagram-width', `${Math.ceil(natural)}px`);
      if (el.dataset.layout !== layout) el.dataset.layout = layout;
    };
    decide();
    // The flow diagram pads itself for labels after its first layout: check again once that has settled.
    const frame = requestAnimationFrame(decide);
    // Re-decide when the slide's width changes, or when the diagram's own content does (the flow diagram
    // measures its boxes in a ResizeObserver and then pads itself for its labels).
    let last = el.clientWidth;
    const ro = new ResizeObserver((entries) => {
      if (entries.some((e) => e.target !== el) || el.clientWidth !== last) {
        last = el.clientWidth;
        decide();
      }
    });
    ro.observe(el);
    el.querySelectorAll('.flow-pad').forEach((pad) => ro.observe(pad));
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [diagram]);
  return (
    <div className="concept" ref={box} data-layout="stack">
      <div className="slide-body">
        {body.split(/\n\s*\n/).map((p, i) => <p key={i}>{inline(p.trim())}</p>)}
      </div>
      {diagram && <DiagramView diagram={diagram} />}
    </div>
  );
}

// Quiz ----------------------------------------------------------------------------

function Quiz({ api, levelId, lesson, act, practice, practiceLabel }: {
  api: GitQuestApi; levelId: string; lesson: LessonData; act: Props['act']; practice: () => void; practiceLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<{ option: string; correct: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const total = lesson.quiz.length;
  const q = lesson.quiz[index];

  useEffect(() => heading.current?.focus(), [index, done]);
  useEffect(() => { if (picked) nextBtn.current?.focus(); }, [picked]);

  const choose = (optionId: string): void => {
    if (!q || picked || busy.current) return;
    busy.current = true;
    act(api.lessons.answer(levelId, q.id, optionId).then(({ correct }) => {
      setPicked({ option: optionId, correct });
      if (correct) setScore((s) => s + 1);
    }).finally(() => { busy.current = false; }));
  };
  const next = (): void => {
    setPicked(null);
    if (index + 1 >= total) setDone(true);
    else setIndex(index + 1);
  };
  const retry = (): void => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (done || !q) {
    return (
      <section className="panel subtle lesson-slide quiz quiz-done" aria-labelledby="quiz-score">
        <h2 id="quiz-score" ref={heading} tabIndex={-1} className="slide-title">You got {score} of {total} right</h2>
        <p className="muted">
          {score === total
            ? 'Every answer right. You are ready for the missions.'
            : 'Read the explanations again or retry the quiz. Only your latest answer to each question counts.'}
        </p>
        <div className="quiz-actions">
          <button type="button" className="btn primary" onClick={practice}>{practiceLabel}</button>
          <button type="button" className="btn" onClick={retry}>Retry the quiz</button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel subtle lesson-slide quiz" aria-labelledby="quiz-question">
      <p className="small muted">Question {index + 1} of {total}</p>
      <h2 id="quiz-question" ref={heading} tabIndex={-1} className="slide-title">{inline(q.question)}</h2>
      {q.diagram && <DiagramView diagram={q.diagram} />}
      <ul className="plain quiz-options" aria-label="Answers">
        {q.options.map((o, k) => {
          const state = !picked ? '' : o.id === q.correct ? 'right' : o.id === picked.option ? 'wrong' : 'other';
          return (
            <li key={o.id}>
              <button type="button" className={`quiz-option ${state}`} disabled={picked !== null} aria-pressed={picked?.option === o.id} onClick={() => choose(o.id)}>
                <span className="quiz-key mono" aria-hidden="true">{'ABCD'[k]}</span>
                <span className="grow">{inline(o.text)}</span>
                {state === 'right' && <span className="quiz-mark right"><Check />Correct answer</span>}
                {state === 'wrong' && <span className="quiz-mark wrong"><Cross />Your answer</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="quiz-feedback" aria-live="polite">
        {picked && (
          <>
            <p className={`strong ${picked.correct ? 'right' : 'wrong'}`}>{picked.correct ? 'Correct.' : 'Not quite.'}</p>
            <p>{inline(q.explanation)}</p>
            <div className="quiz-actions">
              <button type="button" ref={nextBtn} className="btn primary" onClick={next}>
                {index + 1 >= total ? 'See your score' : 'Next question'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Plain text of a slide for reading aloud (code spans become spoken words in read-aloud). */
function slideText(slide: Slide): string {
  switch (slide.kind) {
    case 'concept':
      return [slide.title, slide.body.replace(/\n\n/g, ' '), slide.remember ? `Remember: ${slide.remember}` : ''].filter(Boolean).join('. ');
    case 'commands':
      return [slide.title, ...slide.rows.map((r) => `\`${r.command}\`: ${r.does}${r.danger ? ' This can lose work.' : ''}`)].join('. ');
    case 'pitfalls':
      return [slide.title, ...slide.items.map((i) => `${i.mistake} The way out: ${i.fix}`)].join(' ');
  }
}
