const DEV_TOKEN = 'dev-test-token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const JWKS_CACHE_KEY = 'google-jwks';
const JWKS_CACHE_TTL = 86400; // 24 hours

export interface GoogleUser {
	userId: string; // sub claim
	email: string;
	name: string;
	picture?: string;
}

function base64UrlDecode(str: string): Uint8Array {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlDecodeJson(str: string): any {
	const bytes = base64UrlDecode(str);
	return JSON.parse(new TextDecoder().decode(bytes));
}

export async function verifyGoogleToken(
	idToken: string,
	clientId: string,
	kvCache?: KVNamespace
): Promise<GoogleUser> {
	// Dev mode bypass
	if (idToken === DEV_TOKEN) {
		return {
			userId: 'dev-user-001',
			email: 'dev@backgammon-teacher.local',
			name: 'Developer'
		};
	}

	// 1. Decode JWT header (unverified) to get kid
	const parts = idToken.split('.');
	if (parts.length !== 3) throw new Error('Invalid JWT format');
	const [headerB64, payloadB64, signatureB64] = parts;

	const header = base64UrlDecodeJson(headerB64);
	const kid = header.kid;
	if (!kid) throw new Error('Missing kid in JWT header');

	// 2. Fetch Google JWKS (with KV cache)
	let jwksText: string | null = null;
	if (kvCache) {
		jwksText = await kvCache.get(JWKS_CACHE_KEY);
	}
	if (!jwksText) {
		const resp = await fetch(GOOGLE_JWKS_URL);
		if (!resp.ok) throw new Error(`Failed to fetch JWKS: ${resp.status}`);
		jwksText = await resp.text();
		if (kvCache) {
			await kvCache.put(JWKS_CACHE_KEY, jwksText, { expirationTtl: JWKS_CACHE_TTL });
		}
	}
	const jwks = JSON.parse(jwksText);

	// 3. Find matching key
	const jwk = jwks.keys.find((k: any) => k.kid === kid);
	if (!jwk) throw new Error(`No matching key for kid: ${kid}`);

	// 4. Import public key
	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify']
	);

	// 5. Verify signature
	const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	const signature = base64UrlDecode(signatureB64);
	const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
	if (!valid) throw new Error('Invalid JWT signature');

	// 6. Validate claims
	const payload = base64UrlDecodeJson(payloadB64);
	const now = Math.floor(Date.now() / 1000);

	if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
		throw new Error(`Invalid issuer: ${payload.iss}`);
	}
	if (payload.aud !== clientId) {
		throw new Error(`Invalid audience: ${payload.aud}`);
	}
	if (payload.exp < now) {
		throw new Error('Token expired');
	}

	return {
		userId: payload.sub,
		email: payload.email || '',
		name: payload.name || '',
		picture: payload.picture
	};
}
