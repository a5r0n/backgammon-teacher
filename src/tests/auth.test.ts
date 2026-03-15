import { describe, it, expect } from 'vitest';
import { verifyGoogleToken } from '$lib/auth/google.js';
import type { GoogleUser } from '$lib/auth/google.js';

describe('verifyGoogleToken', () => {
	it('returns dev user for dev-test-token', async () => {
		const user = await verifyGoogleToken('dev-test-token', 'any-client-id');
		expect(user).toEqual({
			userId: 'dev-user-001',
			email: 'dev@backgammon-teacher.local',
			name: 'Developer'
		});
	});

	it('throws on invalid JWT format (no dots)', async () => {
		await expect(verifyGoogleToken('not-a-jwt', 'client-id')).rejects.toThrow(
			'Invalid JWT format'
		);
	});

	it('throws on JWT with only 2 parts', async () => {
		await expect(verifyGoogleToken('part1.part2', 'client-id')).rejects.toThrow(
			'Invalid JWT format'
		);
	});

	it('GoogleUser interface has required fields', () => {
		const user: GoogleUser = { userId: '123', email: 'a@b.com', name: 'Test' };
		expect(user.userId).toBe('123');
		expect(user.picture).toBeUndefined();
	});

	it('GoogleUser interface allows optional picture', () => {
		const user: GoogleUser = {
			userId: '123',
			email: 'a@b.com',
			name: 'Test',
			picture: 'http://pic'
		};
		expect(user.picture).toBe('http://pic');
	});
});
