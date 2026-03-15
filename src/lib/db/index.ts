/**
 * Database client — Drizzle ORM over Cloudflare D1.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

export function getDb(d1: D1Database) {
	return drizzle(d1, { schema });
}
