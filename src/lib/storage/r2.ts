import type { SavedGame, GameStorage } from './types.js';

export class R2GameStorage implements GameStorage {
	constructor(private bucket: R2Bucket) {}

	async saveGame(userId: string, game: SavedGame): Promise<void> {
		const key = `${userId}/${game.date}.json`;
		const existing = await this.bucket.get(key);
		const games: SavedGame[] = existing ? await existing.json() : [];
		games.push(game);
		await this.bucket.put(key, JSON.stringify(games));
	}

	async loadGames(userId: string, date: string): Promise<SavedGame[]> {
		const obj = await this.bucket.get(`${userId}/${date}.json`);
		return obj ? await obj.json() : [];
	}

	async loadGamesByRange(userId: string, fromDate: string, toDate: string): Promise<SavedGame[]> {
		const listed = await this.bucket.list({ prefix: `${userId}/` });
		const allGames: SavedGame[] = [];
		for (const item of listed.objects) {
			const dateStr = item.key.replace(`${userId}/`, '').replace('.json', '');
			if (dateStr >= fromDate && dateStr <= toDate) {
				const obj = await this.bucket.get(item.key);
				if (obj) allGames.push(...((await obj.json()) as SavedGame[]));
			}
		}
		return allGames.sort((a, b) => b.timestamp - a.timestamp);
	}

	async loadLatestGames(userId: string, count: number): Promise<SavedGame[]> {
		const listed = await this.bucket.list({ prefix: `${userId}/`, limit: 100 });
		const keys = listed.objects.map((o) => o.key).sort().reverse();
		const allGames: SavedGame[] = [];
		for (const key of keys) {
			if (allGames.length >= count) break;
			const obj = await this.bucket.get(key);
			if (obj) allGames.push(...((await obj.json()) as SavedGame[]));
		}
		return allGames.slice(0, count);
	}
}
