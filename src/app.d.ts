// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				GAME_FILES: R2Bucket;
				AUTH_CACHE: KVNamespace;
				AI: Ai;
				LLM_PROVIDER: string;
				LLM_API_KEY: string;
				PUBLIC_GOOGLE_CLIENT_ID: string;
				AI_GATEWAY_ACCOUNT_ID: string;
				AI_GATEWAY_NAME: string;
			};
		}
	}

	interface Window {
		google?: {
			accounts: {
				id: {
					initialize(config: {
						client_id: string;
						callback: (response: { credential: string }) => void;
						auto_select?: boolean;
					}): void;
					renderButton(
						element: HTMLElement,
						config: {
							type?: string;
							shape?: string;
							theme?: string;
							size?: string;
							text?: string;
						}
					): void;
					prompt(): void;
					revoke(hint: string, callback: () => void): void;
				};
			};
		};
	}
}

export {};
