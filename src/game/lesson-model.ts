/**
 * Lessons: the theory that comes before each level's missions.
 * One file per level: src/game/lessons/levelN.ts exports `lessonN: Lesson`. Guide: docs/LESSON-GUIDE.md.
 */

/** A diagram drawn by the app's own components from static data (no images). */
export type Diagram =
  | {
      /** Commit graph: oldest first. `lane` = branch the commit was made on; refs label a commit. */
      readonly kind: 'graph';
      readonly commits: readonly {
        readonly id: string;
        readonly message: string;
        readonly parents: readonly string[];
        readonly lane: string;
        readonly refs?: readonly string[];
        /** Faded and dashed (unreachable or "what would happen"). */
        readonly ghost?: boolean;
      }[];
      readonly head: string;
      readonly caption?: string;
    }
  | {
      /** Disk → Index → HEAD with per-file versions; null = absent. */
      readonly kind: 'areas';
      readonly files: readonly { readonly path: string; readonly disk: string | null; readonly index: string | null; readonly head: string | null }[];
      readonly caption?: string;
    }
  | {
      /** Boxes joined by arrows, laid out left → right in rows (e.g. your repo → origin → teammate). */
      readonly kind: 'flow';
      readonly nodes: readonly { readonly id: string; readonly label: string; readonly detail?: string; readonly row?: number }[];
      readonly edges: readonly { readonly from: string; readonly to: string; readonly label?: string }[];
      readonly caption?: string;
    }
  | {
      /** Before → after of a command, as two small graphs or two file listings. */
      readonly kind: 'before-after';
      readonly command: string;
      readonly before: Diagram;
      readonly after: Diagram;
      readonly caption?: string;
    }
  | {
      /** Plain monospaced text: a file, a terminal transcript, a conflict, a YAML snippet. */
      readonly kind: 'code';
      readonly title?: string;
      readonly text: string;
    };

export type Slide =
  | {
      readonly kind: 'concept';
      readonly id: string;
      readonly title: string;
      /** 2–5 short paragraphs of plain English (separate paragraphs with \n\n). Inline `code` with backticks. */
      readonly body: string;
      readonly diagram?: Diagram;
      /** One-line mental model shown under the body. */
      readonly remember?: string;
    }
  | {
      /** Reference table of commands for the level. */
      readonly kind: 'commands';
      readonly id: string;
      readonly title: string;
      readonly rows: readonly { readonly command: string; readonly does: string; readonly danger?: boolean }[];
    }
  | {
      /** Mistakes people make and how to get out. */
      readonly kind: 'pitfalls';
      readonly id: string;
      readonly title: string;
      readonly items: readonly { readonly mistake: string; readonly fix: string }[];
    };

export interface QuizQuestion {
  readonly id: string;
  readonly question: string;
  /** Optional diagram the question is about. */
  readonly diagram?: Diagram;
  /** 3–4 options; exactly one correct. */
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correct: string;
  /** Why the correct answer is right (and the tempting wrong one is wrong). */
  readonly explanation: string;
}

export interface Lesson {
  /** Same id as the Level it belongs to. */
  readonly levelId: string;
  readonly title: string;
  /** One sentence: what you will understand after the lesson. */
  readonly summary: string;
  /** 6–14 slides. */
  readonly slides: readonly Slide[];
  /** 5–8 questions. */
  readonly quiz: readonly QuizQuestion[];
  /** Topics from the topic list taught here only in theory (not practised in a mission). */
  readonly theoryOnly: readonly string[];
}
