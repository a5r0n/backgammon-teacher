import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';

export const gameSession = sqliteTable('game_session', {
	id: text('id').primaryKey(),
	createdAt: text('created_at').default("(datetime('now'))"),
	updatedAt: text('updated_at').default("(datetime('now'))"),
	difficulty: text('difficulty').notNull().default('strong'),
	completed: integer('completed', { mode: 'boolean' }).default(false),
	winner: text('winner')
});

export const analyzedMove = sqliteTable(
	'analyzed_move',
	{
		id: text('id').primaryKey(),
		createdAt: text('created_at').default("(datetime('now'))"),
		gameId: text('game_id').references(() => gameSession.id),
		moveNumber: integer('move_number').notNull(),
		boardState: text('board_state', { mode: 'json' }),
		dice: text('dice', { mode: 'json' }),
		playedMove: text('played_move', { mode: 'json' }),
		bestMove: text('best_move', { mode: 'json' }),
		playedEquity: real('played_equity'),
		bestEquity: real('best_equity'),
		equityLoss: real('equity_loss'),
		blunderLevel: text('blunder_level').default('none'),
		features: text('features', { mode: 'json' }),
		explanation: text('explanation', { mode: 'json' }),
		threshold: real('threshold').default(0.08)
	},
	(table) => [index('idx_analyzed_move_game').on(table.gameId, table.moveNumber)]
);

export const userPreferences = sqliteTable('user_preferences', {
	id: text('id').primaryKey().default('default'),
	updatedAt: text('updated_at').default("(datetime('now'))"),
	blunderPreset: text('blunder_preset').default('normal'),
	blunderThreshold: real('blunder_threshold').default(0.08),
	difficulty: text('difficulty').default('strong'),
	llmProvider: text('llm_provider').default('mock'),
	autoAnalyze: integer('auto_analyze', { mode: 'boolean' }).default(true)
});
