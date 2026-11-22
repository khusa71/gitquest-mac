/** Registry of every level's lesson (docs/LESSON-GUIDE.md). One file per level: ./levelN.ts. */
import type { Lesson } from '../lesson-model';
import { lesson0 } from './level0';
import { lesson1 } from './level1';
import { lesson2 } from './level2';
import { lesson3 } from './level3';
import { lesson4 } from './level4';
import { lesson5 } from './level5';
import { lesson6 } from './level6';
import { lesson7 } from './level7';
import { lesson8 } from './level8';
import { lesson9 } from './level9';
import { lesson10 } from './level10';
import { lesson11 } from './level11';

export type { Lesson, Slide, Diagram, QuizQuestion } from '../lesson-model';

export const LESSONS: readonly Lesson[] = [lesson0, lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7, lesson8, lesson9, lesson10, lesson11];

export function lessonFor(levelId: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.levelId === levelId);
}
