/**
 * Client-side gnubg WASM adapter.
 * Wraps the gnubg-web Emscripten build for in-browser analysis.
 * Falls back to local heuristic analysis if WASM is not available.
 */

import type { BoardState, DiceRoll, Move, PositionAnalysis } from '$lib/backgammon/types.js';
import { boardToGnubgSetup, parseAnalysisOutput, createEmptyCandidate } from './gnubg.js';
import { analyzePositionLocal } from './local.js';

let gnubgModule: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;
let outputBuffer: string[] = [];

/**
 * Run a command on the gnubg WASM module via _run_command.
 * Allocates a C string buffer, writes the command, and calls _run_command.
 * Output is captured via the Module.print callback into outputBuffer.
 */
function runCommand(cmd: string): string {
	outputBuffer = [];
	const len = gnubgModule.lengthBytesUTF8(cmd) + 1;
	const ptr = gnubgModule._malloc(len);
	gnubgModule.stringToUTF8(cmd, ptr, len);
	gnubgModule._run_command(ptr);
	gnubgModule._free(ptr);
	return outputBuffer.join('\n');
}

/**
 * Initialize the gnubg WASM module.
 * Loads the Emscripten-generated JS and WASM from /wasm/.
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

			// Configure the Emscripten Module object before loading the script.
			// gnubg.js reads from the global Module variable on load.
			const moduleConfig: any = {
				locateFile: (path: string) => `/wasm/${path}`,
				print: (text: string) => {
					outputBuffer.push(text);
				},
				printErr: (text: string) => {
					// Suppress stderr noise from gnubg startup
				},
				noInitialRun: true
			};

			// Set global Module for gnubg.js to pick up
			(window as any).Module = moduleConfig;

			// Load gnubg.js via a script tag (it's not an ES module)
			await new Promise<void>((resolve, reject) => {
				const script = document.createElement('script');
				script.src = '/wasm/gnubg.js';
				script.async = true;

				// gnubg.js sets onRuntimeInitialized when WASM is ready
				moduleConfig.onRuntimeInitialized = () => {
					gnubgModule = (window as any).Module;
					// Initialize gnubg
					gnubgModule._start();
					resolve();
				};

				script.onerror = () => reject(new Error('Failed to load gnubg.js'));

				// Timeout after 30 seconds
				const timeout = setTimeout(() => {
					reject(new Error('gnubg WASM initialization timed out'));
				}, 30000);

				const origResolve = moduleConfig.onRuntimeInitialized;
				moduleConfig.onRuntimeInitialized = () => {
					clearTimeout(timeout);
					origResolve();
				};

				document.head.appendChild(script);
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
 * Analyze a position using gnubg WASM or fallback to local heuristics.
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

	// Fallback: use local heuristic-based analysis
	return analyzePositionLocal(board, dice, playedMove);
}

/**
 * WASM-based analysis using gnubg _run_command.
 */
async function analyzeWithWasm(
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): Promise<PositionAnalysis> {
	try {
		const setupCmd = boardToGnubgSetup(board);

		// Execute gnubg commands via WASM
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
			const result = runCommand(cmd);
			if (result) rawOutput += result + '\n';
		}

		return parseAnalysisOutput(rawOutput, board, dice, playedMove);
	} catch (err) {
		console.warn('WASM analysis failed, falling back:', err);
		return analyzePositionLocal(board, dice, playedMove);
	}
}
