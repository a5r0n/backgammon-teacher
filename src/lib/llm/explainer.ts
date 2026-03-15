/**
 * LLM explanation layer.
 * Abstract provider interface — Anthropic, OpenAI, Workers AI, or mock.
 * All providers receive env via constructor (no module-level $env imports).
 */

import {
	buildSystemPrompt,
	buildExplanationPrompt,
	type ExplanationRequest,
	type ExplanationResult
} from './prompt.js';

/**
 * Abstract LLM provider interface.
 */
export interface LLMProvider {
	name: string;
	generateExplanation(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Anthropic Claude provider — routes through AI Gateway when configured.
 */
class AnthropicProvider implements LLMProvider {
	name = 'anthropic';
	constructor(private env: App.Platform['env']) {}

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_NAME, LLM_API_KEY } = this.env;
		if (!LLM_API_KEY) throw new Error('LLM_API_KEY not set');

		const baseUrl =
			AI_GATEWAY_ACCOUNT_ID && AI_GATEWAY_NAME
				? `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_NAME}/anthropic`
				: 'https://api.anthropic.com';

		const response = await fetch(`${baseUrl}/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': LLM_API_KEY,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-6',
				max_tokens: 1024,
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }]
			})
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
		}

		const data: any = await response.json();
		return data.content[0].text;
	}
}

/**
 * OpenAI provider — routes through AI Gateway when configured.
 */
class OpenAIProvider implements LLMProvider {
	name = 'openai';
	constructor(private env: App.Platform['env']) {}

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_NAME, LLM_API_KEY } = this.env;
		if (!LLM_API_KEY) throw new Error('LLM_API_KEY not set');

		const baseUrl =
			AI_GATEWAY_ACCOUNT_ID && AI_GATEWAY_NAME
				? `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_NAME}/openai`
				: 'https://api.openai.com';

		const response = await fetch(`${baseUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${LLM_API_KEY}`
			},
			body: JSON.stringify({
				model: 'gpt-4o',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 1024,
				response_format: { type: 'json_object' }
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
		}

		const data: any = await response.json();
		return data.choices[0].message.content;
	}
}

/**
 * Cloudflare Workers AI provider.
 */
class WorkersAIProvider implements LLMProvider {
	name = 'workers-ai';
	constructor(private ai: Ai) {}

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const result: any = await this.ai.run('@cf/meta/llama-3.1-70b-instruct' as any, {
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			]
		});
		return result.response;
	}
}

/**
 * Mock provider for testing / development without API keys.
 */
class MockProvider implements LLMProvider {
	name = 'mock';

	async generateExplanation(_systemPrompt: string, _userPrompt: string): Promise<string> {
		return JSON.stringify({
			summary: 'This move leaves a blot in a dangerous position.',
			reasons: [
				'The played move leaves an exposed checker that can be hit.',
				'The best move builds the home board instead.'
			],
			coach_tip: 'When in doubt, prioritize safety and building your prime.',
			confidence: 'medium'
		});
	}
}

/**
 * Get the configured LLM provider.
 */
export function getLLMProvider(env: App.Platform['env']): LLMProvider {
	const providerName = env.LLM_PROVIDER || 'mock';
	switch (providerName) {
		case 'anthropic':
			return new AnthropicProvider(env);
		case 'openai':
			return new OpenAIProvider(env);
		case 'workers-ai':
			return new WorkersAIProvider(env.AI);
		default:
			return new MockProvider();
	}
}

/**
 * Generate an explanation for a blunder.
 */
export async function explainBlunder(
	request: ExplanationRequest,
	env: App.Platform['env']
): Promise<ExplanationResult> {
	const provider = getLLMProvider(env);
	const systemPrompt = buildSystemPrompt();
	const userPrompt = buildExplanationPrompt(request);

	const raw = await provider.generateExplanation(systemPrompt, userPrompt);

	try {
		// Extract JSON from response (handle markdown code blocks)
		const jsonStr = raw
			.replace(/```json\n?/g, '')
			.replace(/```\n?/g, '')
			.trim();
		const parsed = JSON.parse(jsonStr);
		return {
			summary: parsed.summary || 'Analysis unavailable',
			simple: {
				race: parsed.simple?.race || '',
				board: parsed.simple?.board || '',
				threat: parsed.simple?.threat || ''
			},
			reasons: parsed.reasons || [],
			coachTip: parsed.coach_tip || '',
			confidence: parsed.confidence || 'low'
		};
	} catch {
		return {
			summary: raw.slice(0, 200),
			simple: { race: '', board: '', threat: '' },
			reasons: [],
			coachTip: '',
			confidence: 'low'
		};
	}
}
