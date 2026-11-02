import { error } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/**
 * The AI column mapping (AI-9, D28).
 *
 * Column names and two sample rows would go to the AI service, which
 * answers with a mapping and nothing else. Every row is transformed in
 * Rust afterwards, so the model never sees an amount and cannot move a
 * decimal point.
 *
 * Not wired yet, and deliberately a refusal rather than a stub that
 * invents one. The API-to-AI hop is OWE1 like every other service hop
 * (D22), and the Rust OWE1 client and the Python middleware that carry it
 * arrive with US-026. Until then the wizard's step two stays empty, which
 * is its documented fallback: the user maps by hand and nothing else about
 * the import changes.
 */
export const POST: RequestHandler = async ({ request }) => {
	// Read and discard, so the caller's body is never left unconsumed.
	await request.json().catch(() => null);

	error(503, 'AI_UNAVAILABLE');
};
