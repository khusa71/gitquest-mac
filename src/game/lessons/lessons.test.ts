import { describe, expect, it } from 'vitest';
import { LEVEL_LIST } from '../content';
import type { Diagram, Lesson } from '../lesson-model';
import { LESSONS, lessonFor } from '.';
import { emptyProgress } from '../progress';
import { lessonSummary } from '../view';

const FRENCH = /(^|[\s"'(])(le|les|une|avec|dans|vous|nous|est|pour la)(?=[\s.,;:!?"')]|$)/;
const ACCENTS = /[À-ɏ‘’“”]/;

/** Every string inside a value, with a readable path. */
function strings(value: unknown, where: string): [string, string][] {
  if (typeof value === 'string') return [[where, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${where}[${i}]`));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([k, v]) => strings(v, `${where}.${k}`));
  return [];
}

/** Problems with a diagram's data (empty = well formed). */
function diagramProblems(d: Diagram, where: string): string[] {
  switch (d.kind) {
    case 'graph': {
      const ids = d.commits.map((c) => c.id);
      const problems = d.commits.flatMap((c, i) =>
        c.parents.filter((p) => !ids.slice(0, i).includes(p)).map((p) => `${where}: ${c.id} has parent ${p} that is not an earlier commit`),
      );
      if (new Set(ids).size !== ids.length) problems.push(`${where}: duplicate commit ids`);
      if (!ids.includes(d.head)) problems.push(`${where}: head ${d.head} is not a commit`);
      return problems;
    }
    case 'areas':
      return d.files.length === 0 ? [`${where}: no files`] : [];
    case 'flow': {
      const ids = new Set(d.nodes.map((n) => n.id));
      const problems = d.edges.flatMap((e) => [e.from, e.to].filter((id) => !ids.has(id)).map((id) => `${where}: edge to unknown node ${id}`));
      if (ids.size !== d.nodes.length) problems.push(`${where}: duplicate node ids`);
      if (d.nodes.length === 0) problems.push(`${where}: no nodes`);
      return problems;
    }
    case 'before-after':
      return [
        ...(d.command.trim() === '' ? [`${where}: empty command`] : []),
        ...diagramProblems(d.before, `${where}.before`),
        ...diagramProblems(d.after, `${where}.after`),
      ];
    case 'code':
      return d.text.trim() === '' ? [`${where}: empty code`] : [];
  }
}

function lessonDiagrams(lesson: Lesson): [string, Diagram][] {
  return [
    ...lesson.slides.flatMap((s) => (s.kind === 'concept' && s.diagram ? [[`slide ${s.id}`, s.diagram] as [string, Diagram]] : [])),
    ...lesson.quiz.flatMap((q) => (q.diagram ? [[`question ${q.id}`, q.diagram] as [string, Diagram]] : [])),
  ];
}

describe('lessons registry', () => {
  it('has exactly one lesson per level', () => {
    for (const level of LEVEL_LIST) expect(lessonFor(level.id), `lesson for ${level.id}`).toBeDefined();
    expect(new Set(LESSONS.map((l) => l.levelId)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) expect(LEVEL_LIST.map((l) => l.id), `${lesson.levelId} is a level`).toContain(lesson.levelId);
  });
});

describe('lesson summary on the level map', () => {
  const lesson = LESSONS.find((l) => l.slides.length > 0 && l.quiz.length > 0);
  it.runIf(lesson !== undefined)('is read once the last slide was reached, scored once every question is answered', () => {
    if (!lesson) return;
    const at = (entry: { slide: number; read: boolean; quiz: Record<string, string> }) =>
      lessonSummary(lesson.levelId, { ...emptyProgress(), lessons: { [lesson.levelId]: entry } });
    expect(lessonSummary(lesson.levelId, emptyProgress())).toEqual({ slides: lesson.slides.length, read: false, quizScore: null, quizTotal: lesson.quiz.length });
    expect(at({ slide: 0, read: true, quiz: {} }).read).toBe(true);
    const [first, ...rest] = lesson.quiz;
    const wrong = first!.options.find((o) => o.id !== first!.correct)!.id;
    expect(at({ slide: 0, read: false, quiz: { [first!.id]: wrong } })).toMatchObject({ read: true, quizScore: null });
    const all = Object.fromEntries([[first!.id, wrong], ...rest.map((q) => [q.id, q.correct])]);
    expect(at({ slide: 0, read: false, quiz: all }).quizScore).toBe(lesson.quiz.length - 1);
  });
});

describe.each(LEVEL_LIST.map((level) => [level.id, lessonFor(level.id)] as const))('lesson %s', (levelId, lesson) => {
  if (lesson === undefined) return;
  if (lesson.slides.length === 0 && lesson.quiz.length === 0) {
    it.todo(`write the ${levelId} lesson (stub file)`);
    return;
  }

  it('has a title, a summary and 6 to 14 slides with unique ids', () => {
    expect(lesson.title.trim()).not.toBe('');
    expect(lesson.summary.trim()).not.toBe('');
    expect(lesson.slides.length).toBeGreaterThanOrEqual(6);
    expect(lesson.slides.length).toBeLessThanOrEqual(14);
    const ids = lesson.slides.map((s) => s.id);
    expect(new Set(ids).size, 'unique slide ids').toBe(ids.length);
  });

  it('has exactly one commands slide and one pitfalls slide, both filled', () => {
    const commands = lesson.slides.filter((s) => s.kind === 'commands');
    const pitfalls = lesson.slides.filter((s) => s.kind === 'pitfalls');
    expect(commands).toHaveLength(1);
    expect(pitfalls).toHaveLength(1);
    for (const s of commands) if (s.kind === 'commands') expect(s.rows.length).toBeGreaterThan(0);
    for (const s of pitfalls) if (s.kind === 'pitfalls') expect(s.items.length).toBeGreaterThan(0);
    for (const s of lesson.slides) if (s.kind === 'concept') expect(s.body.trim(), `slide ${s.id} body`).not.toBe('');
  });

  it('has 5 to 8 quiz questions with 3 or 4 options, a valid answer and an explanation', () => {
    expect(lesson.quiz.length).toBeGreaterThanOrEqual(5);
    expect(lesson.quiz.length).toBeLessThanOrEqual(8);
    const ids = lesson.quiz.map((q) => q.id);
    expect(new Set(ids).size, 'unique question ids').toBe(ids.length);
    for (const q of lesson.quiz) {
      const options = q.options.map((o) => o.id);
      expect(options.length, `${q.id} options`).toBeGreaterThanOrEqual(3);
      expect(options.length, `${q.id} options`).toBeLessThanOrEqual(4);
      expect(new Set(options).size, `${q.id} unique option ids`).toBe(options.length);
      expect(options, `${q.id} correct answer`).toContain(q.correct);
      expect(q.explanation.trim(), `${q.id} explanation`).not.toBe('');
    }
  });

  it('draws well-formed diagrams', () => {
    expect(lessonDiagrams(lesson).flatMap(([where, d]) => diagramProblems(d, where))).toEqual([]);
  });

  it('is plain English: no accents, curly quotes or French words', () => {
    for (const [where, text] of strings(lesson, levelId)) {
      expect(text, `${where}: no accents or curly quotes`).not.toMatch(ACCENTS);
      expect(text, `${where}: English only`).not.toMatch(FRENCH);
    }
  });
});
