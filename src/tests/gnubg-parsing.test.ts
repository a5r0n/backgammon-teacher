import { describe, it, expect } from 'vitest';
import {
	parseAnalysisOutput,
	boardToGnubgSetup,
	findMatchingCandidate,
	parseHintOutput,
	parseMoveNotation,
	createEmptyCandidate
} from '$lib/analysis/gnubg.js';
import { initialBoard } from '$lib/backgammon/board.js';
import type { DiceRoll, Move } from '$lib/backgammon/types.js';

describe('gnubg pure-TS parsing (post-refactor)', () => {
	it('boardToGnubgSetup converts initial board to gnubg commands', () => {
		const board = initialBoard();
		const result = boardToGnubgSetup(board);
		expect(typeof result).toBe('string');
		expect(result).toContain('set board simple');
		expect(result).toContain('new game');
	});

	it('boardToGnubgSetup is deterministic', () => {
		const board = initialBoard();
		expect(boardToGnubgSetup(board)).toBe(boardToGnubgSetup(board));
	});

	it('boardToGnubgSetup includes 26 numbers (bar + 24 points + bar)', () => {
		const board = initialBoard();
		const result = boardToGnubgSetup(board);
		const simpleLine = result.split('\n').find((l) => l.startsWith('set board simple'));
		expect(simpleLine).toBeDefined();
		const numbers = simpleLine!.replace('set board simple ', '').trim().split(' ');
		expect(numbers.length).toBe(26);
	});

	it('findMatchingCandidate matches exact move from candidates', () => {
		const move: Move = {
			checkerMoves: [
				{ from: 24, to: 18 },
				{ from: 13, to: 7 }
			]
		};
		const candidates = [
			{
				move: {
					checkerMoves: [
						{ from: 24, to: 18 },
						{ from: 13, to: 7 }
					]
				},
				equity: 0.1,
				winProb: 0.52,
				gammonProb: 0.15,
				bgProb: 0.02,
				loseProb: 0.48,
				loseGammonProb: 0.13,
				loseBgProb: 0.015
			},
			{
				move: {
					checkerMoves: [
						{ from: 24, to: 18 },
						{ from: 8, to: 2 }
					]
				},
				equity: 0.05,
				winProb: 0.51,
				gammonProb: 0.14,
				bgProb: 0.018,
				loseProb: 0.49,
				loseGammonProb: 0.135,
				loseBgProb: 0.016
			}
		];
		const board = initialBoard();
		const result = findMatchingCandidate(candidates, move, board);
		expect(result).toBeDefined();
		if (result) {
			expect(result.equity).toBe(0.1);
		}
	});

	it('parseMoveNotation parses simple move', () => {
		const dice: DiceRoll = { die1: 6, die2: 3 };
		const moves = parseMoveNotation('24/18 13/10', dice);
		expect(moves.length).toBeGreaterThan(0);
		expect(moves[0].checkerMoves.length).toBe(2);
	});

	it('createEmptyCandidate returns pass move', () => {
		const c = createEmptyCandidate();
		expect(c.move.checkerMoves).toEqual([]);
		expect(c.equity).toBe(0);
	});

	it('parseHintOutput parses gnubg hint text', () => {
		const output = `
 1. Cubeful  2-ply   24/18 13/10        Eq.: +0.100
    0.520 0.150 0.020 - 0.480 0.130 0.015

 2. Cubeful  2-ply   8/2 6/3            Eq.: +0.050
    0.510 0.140 0.018 - 0.490 0.135 0.016
`;
		const dice: DiceRoll = { die1: 6, die2: 3 };
		const candidates = parseHintOutput(output, dice);
		expect(candidates.length).toBe(2);
		expect(candidates[0].move.checkerMoves.length).toBeGreaterThan(0);
	});

	it('gnubg.ts exports only pure-TS functions (no class, no subprocess)', async () => {
		const mod = await import('$lib/analysis/gnubg.js');
		// These MUST exist after refactor:
		expect(typeof mod.parseAnalysisOutput).toBe('function');
		expect(typeof mod.boardToGnubgSetup).toBe('function');
		expect(typeof mod.findMatchingCandidate).toBe('function');
		expect(typeof mod.parseHintOutput).toBe('function');
		expect(typeof mod.parseMoveNotation).toBe('function');
		expect(typeof mod.createEmptyCandidate).toBe('function');

		// These must NOT exist after refactor:
		expect((mod as any).GnubgAdapter).toBeUndefined();
		expect((mod as any).getGnubgAdapter).toBeUndefined();
	});
});
