import { test, expect, type Page } from '@playwright/test';

// Block external scripts (Google Analytics, GSI) that prevent page load in sandboxed environments
test.beforeEach(async ({ page }) => {
	await page.route(/google|gstatic/, (route) => route.abort());
});

/** Navigate and wait for Svelte hydration */
async function gotoAndHydrate(page: Page, url: string) {
	await page.goto(url);
	// Wait for Vite HMR to connect + Svelte hydration to complete
	await page.waitForTimeout(2000);
}

test.describe('Home page', () => {
	test('loads and shows title', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		await expect(page.locator('h1')).toHaveText('Backgammon Teacher');
	});

	test('shows navigation links', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		await expect(page.locator('nav a', { hasText: 'Play' })).toBeVisible();
		await expect(page.locator('nav a', { hasText: 'Review' })).toBeVisible();
		await expect(page.locator('nav a', { hasText: 'My Games' })).toBeVisible();
		await expect(page.locator('nav a', { hasText: 'Settings' })).toBeVisible();
	});

	test('shows mode cards with links', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		const playCard = page.locator('a.mode-card', { hasText: 'Play vs Computer' });
		await expect(playCard).toBeVisible();
		await expect(playCard).toHaveAttribute('href', '/play');

		const reviewCard = page.locator('a.mode-card', { hasText: 'Review Positions' });
		await expect(reviewCard).toBeVisible();
		await expect(reviewCard).toHaveAttribute('href', '/review');
	});

	test('renders board preview on home page', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		await expect(page.locator('.board-preview')).toBeVisible();
	});
});

test.describe('Navigation', () => {
	test('navigates to Play page via nav', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		await page.click('nav a:has-text("Play")');
		await expect(page).toHaveURL(/\/play/);
		await expect(page.locator('h2')).toHaveText('Play vs Computer');
	});

	test('navigates to Review page via nav', async ({ page }) => {
		await gotoAndHydrate(page, '/');
		await page.click('nav a:has-text("Review")');
		await expect(page).toHaveURL(/\/review/);
	});

	test('logo links back to home', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await page.click('a.logo');
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe('Play page', () => {
	test('shows game controls', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await expect(page.locator('select')).toBeVisible();
		await expect(page.locator('.start-btn')).toBeVisible();
		await expect(page.locator('.start-btn')).toHaveText('Start Game');
	});

	test('difficulty selector has three options', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		const options = page.locator('select option');
		await expect(options).toHaveCount(3);
		await expect(options.nth(0)).toHaveText('Beginner');
		await expect(options.nth(1)).toHaveText('Intermediate');
		await expect(options.nth(2)).toHaveText('Strong');
	});

	test('pause on blunders checkbox defaults to checked', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		const checkbox = page.locator('input[type="checkbox"]');
		await expect(checkbox).toBeChecked();
	});

	test('starts a new game and shows board', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await page.click('.start-btn');

		// Wait for game to initialize (includes potential computer turn)
		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 10000 });
		await expect(page.locator('.status-bar')).toBeVisible();
		await expect(page.locator('.board-area')).toBeVisible();
		await expect(page.locator('.status-bar')).toContainText('Pips:');
	});

	test('can start a game with beginner difficulty', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await page.selectOption('select', 'beginner');
		await page.click('.start-btn');

		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 10000 });
		await expect(page.locator('.board-area')).toBeVisible();
	});

	test('can start a new game while one is in progress', async ({ page }) => {
		await gotoAndHydrate(page, '/play');
		await page.click('.start-btn');
		await expect(page.locator('.start-btn')).toHaveText('New Game', { timeout: 10000 });

		// Start another game
		await page.click('.start-btn');
		await expect(page.locator('.board-area')).toBeVisible({ timeout: 10000 });
	});
});

test.describe('Review page', () => {
	test('loads review page with heading', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		const heading = page.locator('h2');
		await expect(heading).toBeVisible();
	});

	test('shows sample position buttons', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		const sampleBtns = page.locator('.sample-btn');
		await expect(sampleBtns.first()).toBeVisible();
	});

	test('shows dice selectors', async ({ page }) => {
		await gotoAndHydrate(page, '/review');
		const selects = page.locator('select');
		await expect(selects.first()).toBeVisible();
		const count = await selects.count();
		expect(count).toBeGreaterThanOrEqual(2);
	});
});
