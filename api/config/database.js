const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Create database tables if they don't exist
 * @param {Database} database - The database instance
 */
function createTables(database) {
	database.exec(`
		-- Podcast subscriptions table
		CREATE TABLE IF NOT EXISTS subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			feed_url TEXT NOT NULL UNIQUE,
			title TEXT,
			description TEXT,
			image_url TEXT,
			last_fetched INTEGER,
			created_at INTEGER DEFAULT (strftime('%s', 'now'))
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
		CREATE INDEX IF NOT EXISTS idx_subscriptions_feed_url ON subscriptions(feed_url);
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
