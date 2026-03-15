import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run dev -- --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 30000
	},
	testDir: 'e2e',
	testMatch: '**/*.test.ts',
	timeout: 30000,
	use: {
		baseURL: 'http://localhost:4173',
		navigationTimeout: 15000,
		trace: 'on-first-retry',
		video: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	retries: process.env.CI ? 2 : 0,
	projects: [
		{
			name: 'chromium',
			use: {
				launchOptions: {
					executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
					args: ['--no-sandbox', '--disable-setuid-sandbox']
				}
			}
		}
	]
});
