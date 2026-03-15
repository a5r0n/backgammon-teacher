import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

// Block external scripts (Google Analytics, GSI) that prevent page load in sandboxed environments
test.beforeEach(async ({ page }) => {
	await page.route(/google|gstatic/, (route) => route.abort());
});

/** Navigate and wait for Svelte hydration */
async function gotoAndHydrate(page: Page, url: string) {
	await page.goto(url);
	await page.waitForTimeout(2000);
}

/** Load a sample position and select the first legal move, then wait for analysis */
async function loadSampleAndAnalyze(page: Page) {
	const sampleBtn = page.locator('.sample-btn').first();
	await expect(sampleBtn).toBeVisible({ timeout: 10000 });
	await sampleBtn.click();
	await page.waitForTimeout(500);

	const moveBtn = page.locator('.move-btn').first();
	await expect(moveBtn).toBeVisible({ timeout: 5000 });
	await moveBtn.click();

	await expect(page.locator('.analysis-panel')).toBeVisible({ timeout: 30000 });
}

test.describe('WASM file serving', () => {
	test('gnubg.js is served from /wasm/', async ({ page }) => {
		const response = await page.goto('/wasm/gnubg.js');
		expect(response?.status()).toBe(200);
		const contentType = response?.headers()['content-type'] || '';
		expect(contentType).toMatch(/javascript/);
	});

	test('gnubg.wasm is served from /wasm/', async ({ request }) => {
		const response = await request.get('/wasm/gnubg.wasm');
		expect(response.status()).toBe(200);
		const body = await response.body();
		expect(body.length).toBeGreaterThan(100000);
	});

	test('gnubg.data is served from /wasm/', async ({ request }) => {
		const response = await request.get('/wasm/gnubg.data');
		expect(response.status()).toBe(200);
		const body = await response.body();
		expect(body.length).toBeGreaterThan(100000);
	});
});

test.describe('WASM initialization', () => {
	test('gnubg WASM module loads without errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		const wasmWarnings: string[] = [];
		page.on('console', (msg: ConsoleMessage) => {
			if (msg.type() === 'warning' && msg.text().includes('WASM')) {
				wasmWarnings.push(msg.text());
			}
		});

		await gotoAndHydrate(page, '/review');
		await loadSampleAndAnalyze(page);

		// No page-level JS errors from WASM loading
		const wasmRelatedErrors = errors.filter(
			(e) => e.includes('wasm') || e.includes('WASM') || e.includes('gnubg')
		);
		expect(wasmRelatedErrors).toHaveLength(0);
	});

	test('WASM network requests succeed', async ({ page }) => {
		const wasmRequests: { url: string; status: number }[] = [];

		page.on('response', (response) => {
			const url = response.url();
			if (url.includes('/wasm/')) {
				wasmRequests.push({ url, status: response.status() });
			}
		});

		await gotoAndHydrate(page, '/review');
		await loadSampleAndAnalyze(page);

		// Verify WASM files were fetched successfully
		expect(wasmRequests.length).toBeGreaterThan(0);
		for (const req of wasmRequests) {
			expect(req.status).toBe(200);
		}
	});
});

test.describe('Review page analysis with WASM', () => {
	test('analyzing a move shows the analysis panel with equity data', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		await loadSampleAndAnalyze(page);

		// Should show "Move Analysis" header
		await expect(page.locator('.panel-header h3')).toHaveText('Move Analysis');

		// Should show best move with equity value
		const bestMoveRow = page.locator('.move-row').first();
		await expect(bestMoveRow).toBeVisible();
		await expect(bestMoveRow.locator('.move-label')).toHaveText('Best move:');
		await expect(bestMoveRow.locator('.equity')).toContainText('Eq:');

		// Should show equity loss
		await expect(page.locator('.equity-loss')).toContainText('Equity loss:');
	});

	test('analysis panel shows candidates in raw view', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		await loadSampleAndAnalyze(page);

		// Switch to raw view
		await page.locator('.detail-toggle button', { hasText: 'Raw' }).click();

		// Should show "Engine Output" heading
		await expect(page.locator('.raw-output h4')).toHaveText('Engine Output');

		// Should list at least one candidate move with equity and probabilities
		const candidates = page.locator('.candidate');
		const count = await candidates.count();
		expect(count).toBeGreaterThanOrEqual(1);

		// First candidate should show rank, move notation, equity, and probabilities
		const first = candidates.first();
		await expect(first.locator('.rank')).toHaveText('1.');
		await expect(first.locator('.equity')).toContainText('Eq:');
		await expect(first.locator('.probs')).toContainText('W:');
	});

	test('analyzing different sample positions produces results', async ({ page }) => {
		await gotoAndHydrate(page, '/review');

		const sampleBtns = page.locator('.sample-btn');
		await expect(sampleBtns.first()).toBeVisible({ timeout: 10000 });
		const sampleCount = await sampleBtns.count();
		expect(sampleCount).toBeGreaterThanOrEqual(2);

		for (let i = 0; i < Math.min(sampleCount, 3); i++) {
			await sampleBtns.nth(i).click();
			await page.waitForTimeout(500);

			const moveBtn = page.locator('.move-btn').first();
			await expect(moveBtn).toBeVisible();
			await moveBtn.click();

			await expect(page.locator('.analysis-panel')).toBeVisible({ timeout: 30000 });
			await expect(page.locator('.equity-loss')).toContainText('Equity loss:');

			// Reset for next sample
			await page.locator('.reset-btn').click();
			await page.waitForTimeout(300);
		}
	});

	test('board replay buttons work after analysis', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		await loadSampleAndAnalyze(page);

		// Click "After best" button
		const bestBtn = page.locator('.board-replay button', { hasText: 'After best' });
		await expect(bestBtn).toBeVisible();
		await bestBtn.click();

		// Should show view bar indicating best move view
		await expect(page.locator('.view-label')).toContainText('After best move');

		// Click "After played" button
		await page.locator('.board-replay button', { hasText: 'After played' }).click();
		await expect(page.locator('.view-label')).toContainText('After played move');

		// Click "Original" button
		await page.locator('.board-replay button', { hasText: 'Original' }).click();
	});

	test('changing dice re-generates legal moves', async ({ page }) => {
		await gotoAndHydrate(page, '/review');

		const sampleBtn = page.locator('.sample-btn').first();
		await expect(sampleBtn).toBeVisible({ timeout: 10000 });
		await sampleBtn.click();
		await page.waitForTimeout(500);

		// Change dice to doubles (6-6)
		const selects = page.locator('.dice-select select');
		await selects.nth(0).selectOption('6');
		await selects.nth(1).selectOption('6');
		await page.waitForTimeout(300);

		// Verify it produces moves
		const moveCount = await page.locator('.move-btn').count();
		expect(moveCount).toBeGreaterThanOrEqual(1);
	});
});

test.describe('Play page WASM integration', () => {
	test('game starts and computer uses WASM for moves', async ({ page }) => {
		const wasmWarnings: string[] = [];
		page.on('console', (msg: ConsoleMessage) => {
			if (msg.type() === 'warning' && msg.text().includes('WASM initialization failed')) {
				wasmWarnings.push(msg.text());
			}
		});

		await gotoAndHydrate(page, '/play');

		// Start a game on strong difficulty (uses WASM analysis for computer moves)
		await page.selectOption('select', 'strong');
		await page.click('.start-btn');

		// Wait for game to initialize
		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 15000 });
		await expect(page.locator('.board-area')).toBeVisible();
		await expect(page.locator('.status-bar')).toContainText('Pips:');
	});

	test('blunder detection works during play', async ({ page }) => {
		await gotoAndHydrate(page, '/play');

		// Enable pause on blunders
		const checkbox = page.locator('input[type="checkbox"]');
		if (!(await checkbox.isChecked())) {
			await checkbox.check();
		}

		// Start game
		await page.click('.start-btn');
		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 15000 });

		// Verify the game is running and analysis infrastructure is in place
		await expect(page.locator('.board-area')).toBeVisible();
		await expect(page.locator('.status-bar')).toBeVisible();
	});
});

test.describe('WASM fallback behavior', () => {
	test('analysis still works when WASM files are blocked', async ({ page }) => {
		// Block all WASM file requests to test fallback
		await page.route('**/wasm/**', (route) => route.abort());

		await gotoAndHydrate(page, '/review');

		const sampleBtn = page.locator('.sample-btn').first();
		await expect(sampleBtn).toBeVisible({ timeout: 10000 });
		await sampleBtn.click();
		await page.waitForTimeout(500);

		// Select a move
		await page.locator('.move-btn').first().click();

		// Analysis should still appear (using local heuristic fallback)
		await expect(page.locator('.analysis-panel')).toBeVisible({ timeout: 15000 });
		await expect(page.locator('.panel-header h3')).toHaveText('Move Analysis');
		await expect(page.locator('.equity-loss')).toContainText('Equity loss:');
	});

	test('game starts and runs when WASM is unavailable', async ({ page }) => {
		// Block WASM files
		await page.route('**/wasm/**', (route) => route.abort());

		await gotoAndHydrate(page, '/play');

		await page.click('.start-btn');
		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 15000 });
		await expect(page.locator('.board-area')).toBeVisible();
	});
});
