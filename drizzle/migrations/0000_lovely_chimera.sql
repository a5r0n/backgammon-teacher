CREATE TABLE `analyzed_move` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))',
	`game_id` text,
	`move_number` integer NOT NULL,
	`board_state` text,
	`dice` text,
	`played_move` text,
	`best_move` text,
	`played_equity` real,
	`best_equity` real,
	`equity_loss` real,
	`blunder_level` text DEFAULT 'none',
	`features` text,
	`explanation` text,
	`threshold` real DEFAULT 0.08,
	FOREIGN KEY (`game_id`) REFERENCES `game_session`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_analyzed_move_game` ON `analyzed_move` (`game_id`,`move_number`);--> statement-breakpoint
CREATE TABLE `game_session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))',
	`updated_at` text DEFAULT '(datetime(''now''))',
	`difficulty` text DEFAULT 'strong' NOT NULL,
	`completed` integer DEFAULT false,
	`winner` text
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))',
	`blunder_preset` text DEFAULT 'normal',
	`blunder_threshold` real DEFAULT 0.08,
	`difficulty` text DEFAULT 'strong',
	`llm_provider` text DEFAULT 'mock',
	`auto_analyze` integer DEFAULT true
);
