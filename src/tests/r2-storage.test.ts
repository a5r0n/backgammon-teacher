import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2GameStorage } from '$lib/storage/r2.js';
import type { SavedGame } from '$lib/storage/types.js';

function createMockBucket(): R2Bucket {
	const store = new Map<string, string>();

	return {
		get: vi.fn(async (key: string) => {
			const data = store.get(key);
			if (!data) return null;
			return { json: async () => JSON.parse(data), text: async () => data } as any;
		}),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value as string);
		}),
		list: vi.fn(async (opts?: { prefix?: string; limit?: number }) => {
			const prefix = opts?.prefix || '';
			const objects = Array.from(store.keys())
				.filter((k) => k.startsWith(prefix))
				.map((key) => ({ key }));
			return { objects };
		}),
		delete: vi.fn(),
		head: vi.fn(),
		createMultipartUpload: vi.fn(),
		resumeMultipartUpload: vi.fn()
	} as unknown as R2Bucket;
}

function makeSavedGame(overrides: Partial<SavedGame> = {}): SavedGame {
	return {
		id: `game-${Date.now()}`,
		date: '2026-03-15',
		timestamp: Date.now(),
		difficulty: 'strong',
		winner: 'player',
		moveCount: 30,
		...overrides
	} as SavedGame;
}

describe('R2GameStorage', () => {
	let bucket: R2Bucket;
	let storage: R2GameStorage;

	beforeEach(() => {
		bucket = createMockBucket();
		storage = new R2GameStorage(bucket);
	});

	it('saves and loads a game by date', async () => {
		const game = makeSavedGame({ date: '2026-03-15' });
		await storage.saveGame('user-1', game);
		const loaded = await storage.loadGames('user-1', '2026-03-15');
		expect(loaded).toHaveLength(1);
		expect(loaded[0].id).toBe(game.id);
	});

	it('appends games to same date', async () => {
		const game1 = makeSavedGame({ id: 'g1', date: '2026-03-15' });
		const game2 = makeSavedGame({ id: 'g2', date: '2026-03-15' });
		await storage.saveGame('user-1', game1);
		await storage.saveGame('user-1', game2);
		const loaded = await storage.loadGames('user-1', '2026-03-15');
		expect(loaded).toHaveLength(2);
	});

	it('returns empty array for no games', async () => {
		const loaded = await storage.loadGames('user-1', '2026-01-01');
		expect(loaded).toEqual([]);
	});

	it('loads games by date range', async () => {
		await storage.saveGame(
			'user-1',
			makeSavedGame({ id: 'g1', date: '2026-03-10', timestamp: 1 })
		);
		await storage.saveGame(
			'user-1',
			makeSavedGame({ id: 'g2', date: '2026-03-15', timestamp: 2 })
		);
		await storage.saveGame(
			'user-1',
			makeSavedGame({ id: 'g3', date: '2026-03-20', timestamp: 3 })
		);

		const loaded = await storage.loadGamesByRange('user-1', '2026-03-10', '2026-03-15');
		expect(loaded.length).toBeGreaterThanOrEqual(2);
		expect(loaded.every((g) => g.date <= '2026-03-15')).toBe(true);
	});

	it('loads latest games with limit', async () => {
		for (let i = 1; i <= 5; i++) {
			await storage.saveGame(
				'user-1',
				makeSavedGame({
					id: `g${i}`,
					date: `2026-03-${String(i).padStart(2, '0')}`,
					timestamp: i
				})
			);
		}

		const loaded = await storage.loadLatestGames('user-1', 3);
		expect(loaded.length).toBeLessThanOrEqual(3);
	});

	it('isolates games between users', async () => {
		await storage.saveGame('user-1', makeSavedGame({ date: '2026-03-15' }));
		await storage.saveGame('user-2', makeSavedGame({ date: '2026-03-15' }));

		const user1Games = await storage.loadGames('user-1', '2026-03-15');
		const user2Games = await storage.loadGames('user-2', '2026-03-15');
		expect(user1Games).toHaveLength(1);
		expect(user2Games).toHaveLength(1);
	});
});
