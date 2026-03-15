import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { verifyGoogleToken } from '$lib/auth/google.js';
import { getStorage } from '$lib/storage/storage.js';
import type { SavedGame } from '$lib/storage/types.js';

interface AuthResult {
	userId: string;
	email: string;
	name: string;
}

async function getUser(request: Request, env: App.Platform['env']): Promise<AuthResult> {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		throw error(401, 'Missing authorization token');
	}
	const token = authHeader.slice(7);
	try {
		const user = await verifyGoogleToken(token, env.PUBLIC_GOOGLE_CLIENT_ID, env.AUTH_CACHE);
		return { userId: user.userId, email: user.email, name: user.name };
	} catch (err) {
		console.error('[games] Token verification failed:', err);
		throw error(401, 'Invalid authorization token');
	}
}

/** POST /api/games — save a completed game */
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform!.env;
	const user = await getUser(request, env);
	const body = await request.json();
	const game = body.game as SavedGame;

	if (!game?.id || !game.date) {
		throw error(400, 'Missing required fields: game.id, game.date');
	}

	console.log(
		`[games] Save: ${user.email} (${user.name}) — ${game.difficulty}, winner=${game.winner}, moves=${game.moveCount}`
	);

	const storage = getStorage(env.GAME_FILES);
	await storage.saveGame(user.userId, game);
	return json({ ok: true });
};

/** GET /api/games?from=YYYY-MM-DD&to=YYYY-MM-DD or GET /api/games (latest 20) */
export const GET: RequestHandler = async ({ request, url, platform }) => {
	const env = platform!.env;
	const user = await getUser(request, env);
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const storage = getStorage(env.GAME_FILES);

	let games: SavedGame[];
	if (from && to) {
		games = await storage.loadGamesByRange(user.userId, from, to);
	} else {
		games = await storage.loadLatestGames(user.userId, 20);
	}

	return json({ games });
};
