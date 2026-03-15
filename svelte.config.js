import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			platformProxy: {
				configPath: './wrangler.jsonc',
				persist: { path: '.wrangler/state/v3' },
				remoteBindings: false
			}
		})
	}
};

export default config;
