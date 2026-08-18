import type { DatabaseSync } from 'node:sqlite';

export abstract class SQLiteStore {
	constructor(
		protected readonly db: DatabaseSync,
	) {}
}
