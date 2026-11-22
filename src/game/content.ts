/**
 * Registry of every level and mission, in level order. Content lives in src/game/levels/levelN.ts.
 */
import type { Level, Mission } from './model';
import { level0 } from './levels/level0';
import { level1 } from './levels/level1';
import { level2 } from './levels/level2';
import { level3 } from './levels/level3';
import { level4 } from './levels/level4';
import { level5 } from './levels/level5';
import { level6 } from './levels/level6';
import { level7 } from './levels/level7';
import { level8 } from './levels/level8';
import { level9 } from './levels/level9';
import { level10 } from './levels/level10';
import { level11 } from './levels/level11';

export { TEAMMATES, ORIGIN_URL, type TeammateId, type Mission, type Level, type PreludeStep, type CheckDef } from './model';
export { FILES, ROOT_COMMANDS } from './levels/level1';

/** Setup commits are dated BASE + 1 minute per command of the chain, so canonical hashes reproduce. */
export const STORY_BASE_DATE = Date.parse('2026-01-05T09:00:00Z');

export const LEVEL_LIST: readonly Level[] = [level0, level1, level2, level3, level4, level5, level6, level7, level8, level9, level10, level11];

/** Every playable mission, in level order then story order. */
export const MISSIONS: readonly Mission[] = LEVEL_LIST.flatMap((level) => level.missions);

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}

export function levelOf(missionId: string): Level | undefined {
  return LEVEL_LIST.find((level) => level.missions.some((mission) => mission.id === missionId));
}

/** Map summaries (kept for the view builder). */
export interface LevelDef {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly topics: string;
  readonly planned: number;
  readonly missions: readonly string[];
  readonly warning?: string;
  readonly online?: boolean;
}

export const LEVELS: readonly LevelDef[] = LEVEL_LIST.map((level) => ({
  id: level.id,
  number: level.number,
  title: level.title,
  topics: level.topics,
  planned: Math.max(level.planned, level.missions.length),
  missions: level.missions.map((mission) => mission.id),
  ...(level.warning === undefined ? {} : { warning: level.warning }),
  ...(level.online === true ? { online: true } : {}),
}));

/** Level number → position in the agents path; levels absent are "go deeper". */
export const AGENTS_ORDER: Readonly<Record<number, number>> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 7: 5, 9: 6, 10: 7 };
