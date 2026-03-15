/**
 * Server hooks — global error logging for API requests.
 */

import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	console.error(
		`[${status}] ${event.request.method} ${event.url.pathname}${event.url.search}: ${message}`,
		error
	);
	return { message };
};
