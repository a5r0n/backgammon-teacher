import { test, expect, type Page } from '@playwright/test';

// Block external scripts and LLM explain calls (not needed for gameplay tests)
test.beforeEach(async ({ page }) => {
	await page.route(/google|gstatic/, (route) => route.abort());
	await page.route('**/api/explain', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				explanation: {
					summary: 'Test explanation',
					reasons: [],
					coachTip: '',
					confidence: 'low',
					simple: { race: '', board: '', threat: '' }
				}
			})
		})
	);
});

/** Navigate and wait for Svelte hydration */
async function gotoAndHydrate(page: Page, url: string) {
	await page.goto(url);
	await page.waitForTimeout(2000);
}

/** Start a new game and wait for it to initialize */
async function startGame(page: Page, difficulty: string = 'beginner') {
	await page.selectOption('select', difficulty);
	// Disable pause-on-blunders so moves flow without interruption
	const checkbox = page.locator('input[type="checkbox"]');
	if (await checkbox.isChecked()) {
		await checkbox.uncheck();
	}
	await page.click('.start-btn');
	await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 15000 });
}

/**
 * Wait until it's the player's turn with dice rolled and legal moves available.
 * After the game starts or after a computer turn, the player may need to click "Roll Dice".
 */
async function waitForPlayerTurn(page: Page) {
	// Either we already have a player turn with dice, or we need to roll
	const rollBtn = page.locator('.roll-btn');
	const pointHitarea = page.locator('.point-hitarea').first();

	// Wait for either the roll button or interactive hit areas to appear
	await expect(rollBtn.or(pointHitarea)).toBeVisible({ timeout: 15000 });

	// If roll button is visible, click it
	if (await rollBtn.isVisible()) {
		await rollBtn.click();
		// After rolling, the board becomes interactive with hit areas
		await expect(pointHitarea).toBeVisible({ timeout: 5000 });
	}
}

/**
 * Extract legal move sources from the board by evaluating which point hit areas
 * have glowing/highlighted checkers (valid sources). We use the status bar which
 * shows the dice values to know what dice were rolled.
 */
async function getStatusText(page: Page): Promise<string> {
	return await page.locator('.status-bar').first().innerText();
}

/**
 * Make a move by double-clicking a source point. For opening moves and simple
 * positions, double-click auto-completes if there's only one target.
 * For more complex moves, we click source then target.
 */
async function makeFirstLegalMove(page: Page) {
	// Use page.evaluate to find which points are valid sources by checking
	// the game's legal moves, then click the first available source and target
	await page.evaluate(() => {
		// Find the first valid source by looking for point-hitarea rects
		const hitareas = document.querySelectorAll<SVGRectElement>('.point-hitarea');
		if (hitareas.length > 0) {
			// Double-click the first hitarea that has a valid source
			// The board will auto-complete if there's only one target
			hitareas[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		}
	});
}

/**
 * Play a full player turn by clicking point hit areas.
 * Strategy: try double-clicking valid source points to auto-complete moves.
 * If that doesn't work, click source then target.
 */
async function playPlayerTurn(page: Page) {
	// Wait for game to be interactive
	await expect(page.locator('.point-hitarea').first()).toBeVisible({ timeout: 10000 });

	// Use the aria-label attributes to find and click points.
	// The board shows glowing checkers on valid sources.
	// We'll try double-clicking each point until a move is made.
	const moved = await page.evaluate(async () => {
		// Helper to wait a bit
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

		// Try double-clicking each point hit area (they have aria-label="Point N")
		const hitareas = document.querySelectorAll<SVGRectElement>('.point-hitarea[aria-label]');
		for (const area of hitareas) {
			area.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			await wait(200);

			// Check if hit areas disappeared (move was completed)
			const remaining = document.querySelectorAll('.point-hitarea');
			if (remaining.length === 0) return true;
		}
		return false;
	});

	if (moved) return;

	// Fallback: click source then target using Playwright locators
	// Find all point hit areas and try each pair
	const hitareaCount = await page.locator('.point-hitarea[aria-label]').count();

	for (let i = 0; i < hitareaCount; i++) {
		const source = page.locator('.point-hitarea[aria-label]').nth(i);
		await source.click();
		await page.waitForTimeout(100);

		// After clicking a source, check if target highlights appeared
		// Try clicking other points as targets
		for (let j = 0; j < hitareaCount; j++) {
			if (j === i) continue;
			const target = page.locator('.point-hitarea[aria-label]').nth(j);
			await target.click();
			await page.waitForTimeout(200);

			// Check if the move completed (hit areas should disappear or change)
			const remaining = await page.locator('.point-hitarea').count();
			if (remaining === 0) return;
		}
	}
}

/**
 * Wait for the computer to finish its turn.
 * After the computer moves, the status shows "Computer rolled X-Y: ..."
 * and a "Roll Dice" button appears, or the game ends.
 */
async function waitForComputerTurn(page: Page) {
	// Wait for either "Roll Dice" button (computer done, player's turn next)
	// or game over status
	const rollBtn = page.locator('.roll-btn');
	const gameOverYou = page.locator('.status-bar', { hasText: 'You win!' });
	const gameOverCpu = page.locator('.status-bar', { hasText: 'Computer wins!' });
	const newTurnDice = page.locator('.status-bar', { hasText: 'Your turn. Dice:' });

	await expect(
		rollBtn.or(gameOverYou).or(gameOverCpu).or(newTurnDice)
	).toBeVisible({ timeout: 20000 });
}

function isGameOver(status: string): boolean {
	return status.includes('You win!') || status.includes('Computer wins!');
}

test.describe('Game play - multiple turns', () => {
	test('plays 3 complete turns (player move + computer response)', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await startGame(page, 'beginner');

		let turnsPlayed = 0;

		for (let turn = 0; turn < 3; turn++) {
			const statusBefore = await getStatusText(page);
			if (isGameOver(statusBefore)) break;

			// 1. Wait for player turn (may need to roll dice)
			await waitForPlayerTurn(page);

			const statusAfterRoll = await getStatusText(page);
			if (isGameOver(statusAfterRoll)) break;

			// Verify dice are shown in the status
			expect(statusAfterRoll).toMatch(/Dice: \d-\d/);

			// 2. Make the player's move
			await playPlayerTurn(page);

			// 3. Wait for the computer to respond
			await waitForComputerTurn(page);

			turnsPlayed++;

			const statusAfterCpu = await getStatusText(page);
			if (isGameOver(statusAfterCpu)) break;

			// Verify the computer's move is shown or it's our turn
			expect(statusAfterCpu).toMatch(
				/Computer rolled \d-\d|Your turn|no legal moves/
			);
		}

		expect(turnsPlayed).toBeGreaterThanOrEqual(1);

		// Verify move history has entries
		const historyEntries = page.locator('.history-entry');
		const historyCount = await historyEntries.count();
		expect(historyCount).toBeGreaterThanOrEqual(2); // at least 1 player + 1 cpu move
	});

	test('move history updates correctly each turn', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await startGame(page, 'beginner');

		// Play 2 turns and track history growth
		const historyCounts: number[] = [];

		for (let turn = 0; turn < 2; turn++) {
			const status = await getStatusText(page);
			if (isGameOver(status)) break;

			await waitForPlayerTurn(page);

			const statusCheck = await getStatusText(page);
			if (isGameOver(statusCheck)) break;

			await playPlayerTurn(page);
			await waitForComputerTurn(page);

			const count = await page.locator('.history-entry').count();
			historyCounts.push(count);
		}

		// Each turn should add entries (at least player move, likely CPU too)
		if (historyCounts.length >= 2) {
			expect(historyCounts[1]).toBeGreaterThan(historyCounts[0]);
		}

		// Verify move history displays dice and move notation
		const firstEntry = page.locator('.history-entry').first();
		await expect(firstEntry.locator('.move-dice')).toBeVisible();
		await expect(firstEntry.locator('.move-text')).toBeVisible();
		await expect(firstEntry.locator('.move-player')).toBeVisible();
	});

	test('pip count updates after moves', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await startGame(page, 'beginner');

		// Get initial pip count
		const initialStatus = await getStatusText(page);
		const initialPips = initialStatus.match(/Pips:\s*(\d+)\s*\/\s*(\d+)/);

		// Play one turn
		await waitForPlayerTurn(page);
		const statusCheck = await getStatusText(page);
		if (!isGameOver(statusCheck)) {
			await playPlayerTurn(page);
			await waitForComputerTurn(page);

			// Get updated pip count
			const updatedStatus = await getStatusText(page);
			const updatedPips = updatedStatus.match(/Pips:\s*(\d+)\s*\/\s*(\d+)/);

			// Pips should be present in both
			expect(initialPips).not.toBeNull();
			expect(updatedPips).not.toBeNull();

			if (initialPips && updatedPips) {
				const initialTotal = parseInt(initialPips[1]) + parseInt(initialPips[2]);
				const updatedTotal = parseInt(updatedPips[1]) + parseInt(updatedPips[2]);
				// Total pip count should decrease (both players moved)
				expect(updatedTotal).toBeLessThan(initialTotal);
			}
		}
	});

	test('board state visually changes after a player move', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await startGame(page, 'beginner');

		await waitForPlayerTurn(page);
		const statusCheck = await getStatusText(page);
		if (isGameOver(statusCheck)) return;

		// Capture board SVG content before move
		const boardBefore = await page.locator('.board-svg').innerHTML();

		await playPlayerTurn(page);
		await waitForComputerTurn(page);

		// Capture board SVG content after move
		const boardAfter = await page.locator('.board-svg').innerHTML();

		// Board should look different after moves
		expect(boardAfter).not.toEqual(boardBefore);
	});

	test('can start a new game mid-play and play turns', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await startGame(page, 'beginner');

		// Play one turn
		await waitForPlayerTurn(page);
		const statusCheck = await getStatusText(page);
		if (!isGameOver(statusCheck)) {
			await playPlayerTurn(page);
			await waitForComputerTurn(page);
		}

		// Start a fresh game
		await startGame(page, 'intermediate');

		// Verify the game restarted
		await expect(page.locator('.board-area')).toBeVisible();

		// Move history should be fresh (only from new game's opening)
		const historyCount = await page.locator('.history-entry').count();
		// A fresh game might have 0-1 entries (computer may go first)
		expect(historyCount).toBeLessThanOrEqual(1);

		// Play one turn in the new game
		await waitForPlayerTurn(page);
		const newStatus = await getStatusText(page);
		if (!isGameOver(newStatus)) {
			await playPlayerTurn(page);
			await waitForComputerTurn(page);
		}
	});
});
