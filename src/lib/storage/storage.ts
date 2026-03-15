import { R2GameStorage } from './r2.js';
import type { GameStorage } from './types.js';

export function getStorage(bucket: R2Bucket): GameStorage {
	return new R2GameStorage(bucket);
}

export type { SavedGame, GameStorage } from './types.js';
