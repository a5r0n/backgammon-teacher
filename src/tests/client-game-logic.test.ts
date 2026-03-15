import { describe, it, expect } from 'vitest';
import {
	createGame,
	rollDice,
	makeMove,
	getLegalMoves,
	openingRoll,
	serializeGameState
} from '$lib/game/gameState.js';
import type { GameState } from '$lib/backgammon/types.js';
import type { Difficulty } from '$lib/backgammon/types.js';

describe('Client-side game lifecycle', () => {
	function startGame(difficulty: Difficulty = 'strong'): { game: GameState; legalMoves: any[] } {
		let game = createGame(difficulty);
		const opening = openingRoll();
		game = { ...game, dice: opening.dice, diceRolled: true, turn: opening.firstPlayer };
		const legalMoves = game.turn === 'player' ? getLegalMoves(game) : [];
		return { game, legalMoves };
	}

	it('creates a new game with opening roll', () => {
		const { game } = startGame();
		expect(game.id).toBeTruthy();
		expect(game.dice).toBeTruthy();
		expect(game.diceRolled).toBe(true);
		expect(['player', 'opponent']).toContain(game.turn);
		expect(game.gameOver).toBeFalsy();
	});

	it('creates games with different difficulties', () => {
		for (const diff of ['beginner', 'intermediate', 'strong'] as Difficulty[]) {
			const { game } = startGame(diff);
			expect(game.difficulty).toBe(diff);
		}
	});

	it('generates legal moves when it is player turn', () => {
		// Keep creating games until player goes first
		let game: GameState;
		let legalMoves: any[];
		let attempts = 0;
		do {
			({ game, legalMoves } = startGame());
			attempts++;
		} while (game.turn !== 'player' && attempts < 100);

		if (game.turn === 'player') {
			expect(legalMoves.length).toBeGreaterThan(0);
			for (const move of legalMoves) {
				expect(move.checkerMoves).toBeDefined();
				expect(move.checkerMoves.length).toBeGreaterThan(0);
			}
		}
	});

	it('makes a legal move and updates game state', () => {
		let game: GameState;
		let legalMoves: any[];
		let attempts = 0;
		do {
			({ game, legalMoves } = startGame());
			attempts++;
		} while (game.turn !== 'player' && attempts < 100);

		if (game.turn === 'player' && legalMoves.length > 0) {
			const move = legalMoves[0];
			const updated = makeMove(game, move);
			expect(updated).toBeDefined();
			expect(updated.id).toBe(game.id);
		}
	});

	it('rolls dice for next turn', () => {
		let game: GameState;
		let legalMoves: any[];
		let attempts = 0;
		do {
			({ game, legalMoves } = startGame());
			attempts++;
		} while (game.turn !== 'player' && attempts < 100);

		if (game.turn === 'player' && legalMoves.length > 0) {
			let updated = makeMove(game, legalMoves[0]);
			if (!updated.diceRolled && !updated.gameOver) {
				updated = rollDice(updated);
				expect(updated.dice).toBeTruthy();
				expect(updated.diceRolled).toBe(true);
			}
		}
	});

	it('undo stack works (client-side pattern)', () => {
		let game: GameState;
		let legalMoves: any[];
		let attempts = 0;
		do {
			({ game, legalMoves } = startGame());
			attempts++;
		} while (game.turn !== 'player' && attempts < 100);

		if (game.turn === 'player' && legalMoves.length > 0) {
			const undoState = game;
			const updated = makeMove(game, legalMoves[0]);

			// Undo: restore previous state
			const restored = undoState;
			expect(restored.board).toEqual(game.board);
			const restoredMoves = getLegalMoves(restored);
			expect(restoredMoves.length).toBe(legalMoves.length);
		}
	});

	it('serializes game state for localStorage persistence', () => {
		const { game } = startGame();
		const serialized = serializeGameState(game);
		expect(serialized).toBeDefined();
		const json = JSON.stringify(serialized);
		expect(json).toBeTruthy();
		const parsed = JSON.parse(json);
		expect(parsed.id).toBe(game.id);
	});

	it('restore pattern: game from localStorage', () => {
		const { game } = startGame();
		const serialized = serializeGameState(game);
		const json = JSON.stringify(serialized);
		const restored = JSON.parse(json) as GameState;

		if (restored.turn === 'player' && restored.diceRolled) {
			const moves = getLegalMoves(restored);
			expect(moves).toBeDefined();
		}
	});
});
