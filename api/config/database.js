const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Migrate subscriptions table from old schema to new schema
 * @param {Database} database - The database instance
 */
function migrateSubscriptionsTable(database) {
	// Check if we have the old schema (feed_url column exists)
	const tableInfo = database.prepare("PRAGMA table_info(subscriptions)").all();
	const hasOldSchema = tableInfo.some(col => col.name === 'feed_url');
	
	if (!hasOldSchema) {
		return; // Already migrated or fresh install
	}

	console.log('[database] Migrating subscriptions table to new schema...');

	// Create new table with updated schema
	database.exec(`
		-- Create new subscriptions table with aligned schema
		CREATE TABLE IF NOT EXISTS subscriptions_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			feedUrl TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			artist TEXT,
			description TEXT,
			artworkUrl TEXT,
			artworkUrl100 TEXT,
			artworkUrl600 TEXT,
			genres TEXT,
			primaryGenre TEXT,
			trackCount INTEGER,
			releaseDate TEXT,
			country TEXT,
			lastFetched INTEGER,
			createdAt INTEGER DEFAULT (strftime('%s', 'now'))
		);

		-- Migrate data from old table to new table
		INSERT INTO subscriptions_new (id, feedUrl, name, description, artworkUrl600, lastFetched, createdAt)
		SELECT id, feed_url, title, description, image_url, last_fetched, created_at
		FROM subscriptions;

		-- Drop old table
		DROP TABLE subscriptions;

		-- Rename new table
		ALTER TABLE subscriptions_new RENAME TO subscriptions;

		-- Drop old index if exists and create new one
		DROP INDEX IF EXISTS idx_subscriptions_feed_url;
		CREATE INDEX IF NOT EXISTS idx_subscriptions_feedUrl ON subscriptions(feedUrl);
	`);

	console.log('[database] Migration complete');
}

/**
 * Create database tables if they don't exist
 * @param {Database} database - The database instance
 */
function createTables(database) {
	database.exec(`
		-- Podcast subscriptions table (aligned with iTunes Podcast schema)
		CREATE TABLE IF NOT EXISTS subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			feedUrl TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			artist TEXT,
			description TEXT,
			artworkUrl TEXT,
			artworkUrl100 TEXT,
			artworkUrl600 TEXT,
			genres TEXT,
			primaryGenre TEXT,
			trackCount INTEGER,
			releaseDate TEXT,
			country TEXT,
			lastFetched INTEGER,
			createdAt INTEGER DEFAULT (strftime('%s', 'now'))
		);

		-- Playlists table
		CREATE TABLE IF NOT EXISTS playlists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			created_at INTEGER DEFAULT (strftime('%s', 'now')),
			updated_at INTEGER DEFAULT (strftime('%s', 'now'))
		);

		-- Playlist episodes table (many-to-many relationship)
		CREATE TABLE IF NOT EXISTS playlist_episodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			playlist_id INTEGER NOT NULL,
			episode_url TEXT NOT NULL,
			episode_title TEXT,
			position INTEGER DEFAULT 0,
			added_at INTEGER DEFAULT (strftime('%s', 'now')),
			FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
			UNIQUE(playlist_id, episode_url)
		);

		-- Bluetooth devices table
		CREATE TABLE IF NOT EXISTS bluetooth_devices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			mac_address TEXT NOT NULL UNIQUE,
			name TEXT,
			rssi INTEGER,
			last_seen INTEGER DEFAULT (strftime('%s', 'now')),
			paired INTEGER DEFAULT 0,
			trusted INTEGER DEFAULT 0,
			created_at INTEGER DEFAULT (strftime('%s', 'now'))
		);

		-- Create indexes for better query performance
		CREATE INDEX IF NOT EXISTS idx_subscriptions_feedUrl ON subscriptions(feedUrl);
		CREATE INDEX IF NOT EXISTS idx_playlist_episodes_playlist_id ON playlist_episodes(playlist_id);
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_mac ON bluetooth_devices(mac_address);
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_last_seen ON bluetooth_devices(last_seen);
	`);

	console.log('[database] Tables verified/created');
}

/**
 * Initialize the SQLite database connection
 * @returns {Database} The database instance
 */
function initializeDatabase() {
	if (db) {
		return db;
	}

	const dbPath = path.join(__dirname, '..', 'podcast.db');
	db = new Database(dbPath);
	db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better performance

	console.log('[database] Connected to SQLite database at', dbPath);

	// Run migrations for existing databases
	migrateSubscriptionsTable(db);

	// Ensure tables exist
	createTables(db);

	return db;
}

/**
 * Get the database instance
 * @returns {Database} The database instance
 */
function getDatabase() {
	if (!db) {
		throw new Error('Database not initialized. Call initializeDatabase() first.');
	}
	return db;
}

/**
 * Close the database connection
 */
function closeDatabase() {
	if (db) {
		db.close();
		console.log('[database] Database connection closed');
		db = null;
	}
}

/**
 * Get health status of the database
 * @returns {Object} Health status object
 */
function getHealth() {
	try {
		if (!db) {
			return {
				status: 'error',
				error: 'Database not initialized'
			};
		}

		// Run a simple query to verify the connection is working
		db.prepare('SELECT 1').get();

		return {
			status: 'ok'
		};
	} catch (error) {
		return {
			status: 'error',
			error: error.message
		};
	}
}

module.exports = {
	initializeDatabase,
	getDatabase,
	closeDatabase,
	getHealth
};
