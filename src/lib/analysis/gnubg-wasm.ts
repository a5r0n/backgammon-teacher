/**
 * Client-side gnubg WASM adapter.
 * Wraps the gnubg-web Emscripten build for in-browser analysis.
 * Falls back to pure-TS move generation if WASM is not available.
 */

import type { BoardState, DiceRoll, Move, PositionAnalysis } from '$lib/backgammon/types.js';
import { boardToGnubgSetup, parseAnalysisOutput, createEmptyCandidate } from './gnubg.js';
import { generateLegalMoves } from '$lib/backgammon/rules.js';

let gnubgModule: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;

/**
 * Initialize the gnubg WASM module.
 * Loads the WASM binary and data files from /wasm/.
 * Safe to call multiple times — only initializes once.
 */
export async function initGnubg(): Promise<void> {
	if (gnubgModule) return;
	if (initFailed) return;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		try {
			// Only load WASM in browser environment
			if (typeof window === 'undefined') {
				initFailed = true;
				return;
			}
			// Dynamic import of the Emscripten-generated JS loader
			const url = new URL('/wasm/gnubg.js', window.location.origin).href;
			const createModule = (await import(/* @vite-ignore */ url)).default;
			gnubgModule = await createModule({
				locateFile: (path: string) => `/wasm/${path}`
			});
		} catch (err) {
			console.warn('gnubg WASM initialization failed, using fallback:', err);
			initFailed = true;
			gnubgModule = null;
		}
	})();

	return initPromise;
}

/**
 * Check if the WASM module is loaded and ready.
 */
export function isReady(): boolean {
	return gnubgModule !== null;
}

/**
 * Analyze a position using gnubg WASM or fallback to pure-TS.
 */
export async function analyzePosition(
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): Promise<PositionAnalysis> {
	// Try WASM first
	await initGnubg();

	if (gnubgModule) {
		return analyzeWithWasm(board, dice, playedMove);
	}

	// Fallback: use pure-TS legal move generation (no equity data)
	return analyzeWithFallback(board, dice, playedMove);
}

/**
 * WASM-based analysis using gnubg ccall.
 */
async function analyzeWithWasm(
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): Promise<PositionAnalysis> {
	try {
		const setupCmd = boardToGnubgSetup(board);

		// Execute gnubg commands via WASM
		// The gnubg-web Emscripten module exposes a CommandInterface
		const commands = [
			'set automatic game off',
			'set automatic roll off',
			'set evaluation chequerplay evaluation plies 2',
			setupCmd,
			'set turn 1',
			`set dice ${dice.die1} ${dice.die2}`,
			'hint'
		];

		let rawOutput = '';
		for (const cmd of commands) {
			// gnubg-web exposes different APIs depending on the build.
			// Try ccall first, then direct command interface
			if (gnubgModule.ccall) {
				const result = gnubgModule.ccall(
					'command_run',
					'string',
					['string'],
					[cmd]
				);
				if (result) rawOutput += result + '\n';
			} else if (gnubgModule.commandRun) {
				const result = gnubgModule.commandRun(cmd);
				if (result) rawOutput += result + '\n';
			}
		}

		return parseAnalysisOutput(rawOutput, board, dice, playedMove);
	} catch (err) {
		console.warn('WASM analysis failed, falling back:', err);
		return analyzeWithFallback(board, dice, playedMove);
	}
}

/**
 * Fallback analysis using pure TypeScript (no equity data).
 * Generates legal moves and returns them as candidates with zero equity.
 */
function analyzeWithFallback(
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): PositionAnalysis {
	const legalMoves = generateLegalMoves(board, dice);

	if (legalMoves.length === 0) {
		const empty = createEmptyCandidate();
		return {
			bestMove: empty,
			playedMove: empty,
			candidates: [empty],
			equityLoss: 0,
			positionType: 'unknown'
		};
	}

	// Without gnubg, we can't compute equity — return all moves as equal
	const candidates = legalMoves.slice(0, 10).map((move) => ({
		move,
		equity: 0,
		winProb: 0.5,
		gammonProb: 0,
		bgProb: 0,
		loseProb: 0.5,
		loseGammonProb: 0,
		loseBgProb: 0
	}));

	const bestMove = candidates[0];
	let playedMoveAnalysis = null;

	if (playedMove) {
		const moveKey = playedMove.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		playedMoveAnalysis =
			candidates.find((c) => {
				const key = c.move.checkerMoves
					.map((cm) => `${cm.from}-${cm.to}`)
					.sort()
					.join(',');
				return key === moveKey;
			}) || null;
	}

	return {
		bestMove,
		playedMove: playedMoveAnalysis,
		candidates,
		equityLoss: 0,
		positionType: 'unknown'
	};
}
