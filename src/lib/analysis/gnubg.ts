/**
 * GNU Backgammon parsing and analysis utilities.
 * Pure TypeScript — no subprocess, no Node.js dependencies.
 * These functions parse gnubg output format and work with board state.
 */

import type {
	BoardState,
	CandidateMoveAnalysis,
	DiceRoll,
	Move,
	PositionAnalysis,
	CheckerMove
} from '$lib/backgammon/types.js';
import { BAR, OFF } from '$lib/backgammon/types.js';
import { generateLegalMoves, applyMove } from '$lib/backgammon/rules.js';

type CandidateWithAlternatives = CandidateMoveAnalysis & { moveAlternatives?: Move[] };

/**
 * Convert board state to gnubg commands to set up the position.
 * Uses gnubg's "simple" board format:
 *   set board simple <26 numbers>
 * where positions are: bar-player, point1..point24, bar-opponent
 * Positive = player (X), negative = opponent (O).
 */
export function boardToGnubgSetup(board: BoardState): string {
	const lines: string[] = ['new game'];

	const values: number[] = [board.playerBar, ...board.points, -board.opponentBar];

	lines.push(`set board simple ${values.join(' ')}`);

	return lines.join('\n');
}

/**
 * Parse gnubg analysis output (hint command) into a PositionAnalysis.
 */
export function parseAnalysisOutput(
	output: string,
	board: BoardState,
	dice: DiceRoll,
	playedMove?: Move
): PositionAnalysis {
	const candidates = parseHintOutput(output, dice);

	// Resolve move alternatives against legal moves
	const legalMoves = generateLegalMoves(board, dice);
	for (const candidate of candidates) {
		if (candidate.moveAlternatives && candidate.moveAlternatives.length > 1) {
			const resolved = resolveAlternative(candidate.moveAlternatives, legalMoves);
			if (resolved) {
				candidate.move = resolved;
			}
		}
		delete candidate.moveAlternatives;
	}

	if (candidates.length === 0) {
		const legal = generateLegalMoves(board, dice);
		if (legal.length === 0) {
			// Forced pass
			const emptyCandidate = createEmptyCandidate();
			return {
				bestMove: emptyCandidate,
				playedMove: emptyCandidate,
				candidates: [emptyCandidate],
				equityLoss: 0,
				positionType: 'unknown'
			};
		}
		console.warn(
			'GNU Backgammon returned no candidate moves for a position with legal moves. Output:',
			output.slice(0, 500)
		);
		const emptyCandidate = createEmptyCandidate();
		return {
			bestMove: emptyCandidate,
			playedMove: null,
			candidates: [],
			equityLoss: 0,
			positionType: 'unknown'
		};
	}

	const bestMove = candidates[0];
	let playedMoveAnalysis: CandidateMoveAnalysis | null = null;
	let equityLoss = 0;

	if (playedMove) {
		playedMoveAnalysis = findMatchingCandidate(candidates, playedMove, board) || null;
		if (playedMoveAnalysis) {
			equityLoss = bestMove.equity - playedMoveAnalysis.equity;
		}
	}

	return {
		bestMove,
		playedMove: playedMoveAnalysis,
		candidates,
		equityLoss: Math.max(0, equityLoss),
		positionType: 'unknown'
	};
}

/**
 * Parse gnubg hint output into candidate moves.
 * Actual gnubg output format:
 *   1. Cubeful 0-ply    8/5 6/5                      Eq.: +0.060
 *      0.517 0.145 0.006 - 0.483 0.132 0.006
 */
export function parseHintOutput(
	output: string,
	dice: DiceRoll
): CandidateWithAlternatives[] {
	const candidates: CandidateWithAlternatives[] = [];
	const lines = output.split('\n');

	const moveLineRegex = /^\s*(\d+)\.\s+\S+\s+\S+\s+(.+?)\s+Eq\.:\s+([+-]?\d+\.\d+)/;
	const probLineRegex =
		/^\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;

	let currentCandidate: Partial<CandidateWithAlternatives> | null = null;

	for (const line of lines) {
		const moveMatch = line.match(moveLineRegex);
		if (moveMatch) {
			if (currentCandidate) {
				candidates.push(fillCandidate(currentCandidate));
			}
			const moveNotation = moveMatch[2].trim();
			const moveAlternatives = parseMoveNotation(moveNotation, dice);
			const validMove =
				moveAlternatives.find((m) => m.checkerMoves.length > 0) || moveAlternatives[0];
			if (validMove.checkerMoves.length === 0) {
				console.warn(
					`Failed to parse gnubg move notation: "${moveNotation}" with dice ${dice.die1}-${dice.die2}`
				);
			}
			currentCandidate = {
				move: validMove,
				moveAlternatives,
				equity: parseFloat(moveMatch[3])
			};
			continue;
		}

		if (currentCandidate) {
			const probMatch = line.match(probLineRegex);
			if (probMatch) {
				currentCandidate.winProb = parseFloat(probMatch[1]);
				currentCandidate.gammonProb = parseFloat(probMatch[2]);
				currentCandidate.bgProb = parseFloat(probMatch[3]);
				currentCandidate.loseProb = parseFloat(probMatch[4]);
				currentCandidate.loseGammonProb = parseFloat(probMatch[5]);
				currentCandidate.loseBgProb = parseFloat(probMatch[6]);
			}
		}
	}

	if (currentCandidate) {
		candidates.push(fillCandidate(currentCandidate));
	}

	return candidates;
}

function fillCandidate(partial: Partial<CandidateWithAlternatives>): CandidateWithAlternatives {
	const w = partial.winProb ?? 0.5;
	const g = partial.gammonProb ?? 0;
	const bg = partial.bgProb ?? 0;
	const l = partial.loseProb ?? 0.5;
	const lg = partial.loseGammonProb ?? 0;
	const lbg = partial.loseBgProb ?? 0;
	const cubelessEquity = w + g + bg - l - lg - lbg;
	return {
		move: partial.move || { checkerMoves: [] },
		equity: cubelessEquity,
		winProb: w,
		gammonProb: g,
		bgProb: bg,
		loseProb: l,
		loseGammonProb: lg,
		loseBgProb: lbg,
		moveAlternatives: partial.moveAlternatives
	};
}

/**
 * Parse a move notation string like "24/18 13/11" or "8/7(2) 6/5(2)" into a Move object.
 * Returns multiple candidate expansions when a combined move can be decomposed in different orderings.
 * @internal — exported for testing and WASM adapter
 */
export function parseMoveNotation(notation: string, dice: DiceRoll): Move[] {
	const parts = notation.split(/\s+/);

	interface RawPart {
		from: number;
		to: number;
		isHit: boolean;
		count: number;
	}
	const rawParts: RawPart[] = [];

	for (const part of parts) {
		const chainMatch = part.match(/^(bar|\d+)((?:\/(?:off|\d+)\*?)+)(?:\((\d+)\))?$/i);
		if (chainMatch) {
			const startPoint =
				chainMatch[1].toLowerCase() === 'bar' ? BAR : parseInt(chainMatch[1]);
			const segments = chainMatch[2].match(/\/(off|\d+)(\*)?/gi) || [];
			const count = chainMatch[3] ? parseInt(chainMatch[3]) : 1;

			interface ChainSeg {
				from: number;
				to: number;
				isHit: boolean;
			}
			const chainSegs: ChainSeg[] = [];
			let currentFrom = startPoint;
			for (const seg of segments) {
				const segMatch = seg.match(/\/(off|\d+)(\*)?/i);
				if (!segMatch) continue;
				const to = segMatch[1].toLowerCase() === 'off' ? OFF : parseInt(segMatch[1]);
				const isHit = !!segMatch[2];
				chainSegs.push({ from: currentFrom, to, isHit });
				currentFrom = to;
			}

			for (let c = 0; c < count; c++) {
				for (const seg of chainSegs) {
					rawParts.push({ from: seg.from, to: seg.to, isHit: seg.isHit, count: 1 });
				}
			}
		}
	}

	const diceVals =
		dice.die1 === dice.die2
			? [dice.die1, dice.die1, dice.die1, dice.die1]
			: [dice.die1, dice.die2];

	let expansions: CheckerMove[][] = [[]];

	for (const raw of rawParts) {
		for (let i = 0; i < raw.count; i++) {
			const isHit = raw.isHit && i === 0;
			const distance = raw.to === OFF ? raw.from : raw.from - raw.to;
			const alternatives = expandCombinedMove(raw.from, raw.to, distance, isHit, diceVals);

			const newExpansions: CheckerMove[][] = [];
			for (const existing of expansions) {
				for (const alt of alternatives) {
					newExpansions.push([...existing, ...alt]);
				}
			}
			expansions = newExpansions;
		}
	}

	return expansions.map((cms) => ({ checkerMoves: cms }));
}

/**
 * Expand a combined gnubg move into individual die steps.
 * Returns multiple alternatives when there are different valid orderings.
 */
function expandCombinedMove(
	from: number,
	to: number,
	distance: number,
	isHit: boolean,
	diceValues: number[]
): CheckerMove[][] {
	if (diceValues.includes(distance)) {
		return [[{ from, to, isHit }]];
	}
	if (to === OFF && diceValues.some((d) => d >= from)) {
		return [[{ from, to: OFF, isHit }]];
	}

	const alternatives: CheckerMove[][] = [];

	if (diceValues.length >= 2 && diceValues[0] !== diceValues[1]) {
		const d1 = diceValues[0];
		const d2 = diceValues[1];

		if (to === OFF) {
			const mid1 = from - d1;
			if (mid1 >= 1) {
				alternatives.push([
					{ from, to: mid1, isHit: false },
					{ from: mid1, to: OFF, isHit }
				]);
			}
			const mid2 = from - d2;
			if (mid2 >= 1 && mid2 !== mid1) {
				alternatives.push([
					{ from, to: mid2, isHit: false },
					{ from: mid2, to: OFF, isHit }
				]);
			}
		} else if (d1 + d2 === distance) {
			const mid1 = from - d1;
			if (mid1 > 0 && mid1 <= 24) {
				alternatives.push([
					{ from, to: mid1, isHit: false },
					{ from: mid1, to, isHit }
				]);
			}
			const mid2 = from - d2;
			if (mid2 > 0 && mid2 <= 24 && mid2 !== mid1) {
				alternatives.push([
					{ from, to: mid2, isHit: false },
					{ from: mid2, to, isHit }
				]);
			}
		}
	}

	if (diceValues.length >= 2 && diceValues[0] === diceValues[1]) {
		const die = diceValues[0];
		if (to === OFF) {
			const moves: CheckerMove[] = [];
			let pos = from;
			let usedDice = 0;
			while (pos > 0 && usedDice < diceValues.length) {
				const next = pos - die;
				if (next <= 0) {
					moves.push({ from: pos, to: OFF, isHit: isHit && usedDice === 0 });
					usedDice++;
					break;
				}
				moves.push({ from: pos, to: next, isHit: false });
				pos = next;
				usedDice++;
			}
			if (moves.length > 0) {
				alternatives.push(moves);
			}
		} else {
			const steps = Math.round(distance / die);
			if (steps * die === distance && steps <= diceValues.length) {
				const moves: CheckerMove[] = [];
				let pos = from;
				for (let i = 0; i < steps; i++) {
					const next = pos - die;
					moves.push({
						from: pos,
						to: next,
						isHit: isHit && i === steps - 1
					});
					pos = next;
				}
				alternatives.push(moves);
			}
		}
	}

	if (alternatives.length === 0) {
		alternatives.push([{ from, to, isHit }]);
	}

	return alternatives;
}

/**
 * Resolve which move alternative matches a legal move.
 */
export function resolveAlternative(alternatives: Move[], legalMoves: Move[]): Move | null {
	const legalKeys = new Set(
		legalMoves.map((m) =>
			m.checkerMoves
				.map((cm) => `${cm.from}-${cm.to}`)
				.sort()
				.join(',')
		)
	);

	for (const alt of alternatives) {
		const key = alt.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		if (legalKeys.has(key)) {
			return alt;
		}
	}
	return null;
}

function boardKey(board: BoardState): string {
	return `${board.points.join(',')}|${board.playerBar}|${board.opponentBar}|${board.playerBorneOff}|${board.opponentBorneOff}`;
}

/**
 * Find a matching candidate move from analysis candidates.
 */
export function findMatchingCandidate(
	candidates: CandidateMoveAnalysis[],
	move: Move,
	board?: BoardState
): CandidateMoveAnalysis | undefined {
	const moveKey = move.checkerMoves
		.map((cm) => `${cm.from}-${cm.to}`)
		.sort()
		.join(',');

	const exact = candidates.find((c) => {
		const key = c.move.checkerMoves
			.map((cm) => `${cm.from}-${cm.to}`)
			.sort()
			.join(',');
		return key === moveKey;
	});
	if (exact) return exact;

	if (board) {
		const playedBoard = boardKey(applyMove(board, move));
		return candidates.find((c) => {
			if (c.move.checkerMoves.length === 0) return false;
			try {
				return boardKey(applyMove(board, c.move)) === playedBoard;
			} catch {
				return false;
			}
		});
	}

	return undefined;
}

/**
 * Parse gnubg `eval` output to extract equity.
 */
export function parseEvalOutput(output: string): number {
	const eqMatch = output.match(/[Ee]q\.?:?\s*([+-]?\d+\.\d+)/);
	if (eqMatch) {
		return parseFloat(eqMatch[1]);
	}

	const probRegex =
		/(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;
	const probMatch = output.match(probRegex);
	if (probMatch) {
		const w = parseFloat(probMatch[1]);
		const g = parseFloat(probMatch[2]);
		const bg = parseFloat(probMatch[3]);
		const l = parseFloat(probMatch[4]);
		const lg = parseFloat(probMatch[5]);
		const lbg = parseFloat(probMatch[6]);
		return w + g + bg - l - lg - lbg;
	}

	throw new Error(`Could not parse gnubg eval output: ${output.slice(0, 200)}`);
}

/**
 * Create an empty candidate (for forced pass positions).
 */
export function createEmptyCandidate(): CandidateMoveAnalysis {
	return {
		move: { checkerMoves: [] },
		equity: 0,
		winProb: 0.5,
		gammonProb: 0,
		bgProb: 0,
		loseProb: 0.5,
		loseGammonProb: 0,
		loseBgProb: 0
	};
}
