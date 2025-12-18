const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Parse RFC 822/2822 date string to Unix timestamp
 * Handles various date formats commonly found in RSS feeds
 * @param {string} dateStr - Date string from RSS feed
 * @returns {number|null} Unix timestamp or null if parsing fails
 */
function parseRssDate(dateStr) {
	if (!dateStr) return null;

	try {
		// JavaScript's Date.parse can handle RFC 2822 dates
		const timestamp = Date.parse(dateStr);
		if (!isNaN(timestamp)) {
			return Math.floor(timestamp / 1000);
		}
	} catch (e) {
		// Fall through to return null
	}

	return null;
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
			auto_download INTEGER DEFAULT 0,
			auto_download_limit INTEGER DEFAULT 5,
			createdAt INTEGER DEFAULT (strftime('%s', 'now'))
		);

		-- Playlists table
		CREATE TABLE IF NOT EXISTS playlists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			type TEXT DEFAULT 'user',
			subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
			file_path TEXT,
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

		-- Episodes table (synced from RSS feeds)
		CREATE TABLE IF NOT EXISTS episodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			subscription_id INTEGER NOT NULL,
			guid TEXT NOT NULL,
			title TEXT,
			description TEXT,
			pub_date TEXT,
			pub_date_unix INTEGER,
			duration TEXT,
			audio_url TEXT NOT NULL,
			audio_type TEXT DEFAULT 'audio/mpeg',
			audio_length INTEGER,
			image_url TEXT,
			file_path TEXT,
			file_size INTEGER,
			downloaded_at INTEGER,
			playback_position INTEGER DEFAULT 0,
			playback_completed INTEGER DEFAULT 0,
			last_played_at INTEGER,
			created_at INTEGER DEFAULT (strftime('%s', 'now')),
			FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
			UNIQUE(subscription_id, guid)
		);

		-- Download queue table
		CREATE TABLE IF NOT EXISTS download_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			episode_id INTEGER NOT NULL,
			status TEXT DEFAULT 'pending',
			progress INTEGER DEFAULT 0,
			error_message TEXT,
			retry_count INTEGER DEFAULT 0,
			priority INTEGER DEFAULT 0,
			created_at INTEGER DEFAULT (strftime('%s', 'now')),
			started_at INTEGER,
			completed_at INTEGER,
			FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
		);

		-- Create indexes for better query performance
		CREATE INDEX IF NOT EXISTS idx_subscriptions_feedUrl ON subscriptions(feedUrl);
		CREATE INDEX IF NOT EXISTS idx_playlist_episodes_playlist_id ON playlist_episodes(playlist_id);
		CREATE INDEX IF NOT EXISTS idx_playlists_type ON playlists(type);
		CREATE INDEX IF NOT EXISTS idx_playlists_subscription_id ON playlists(subscription_id);
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_mac ON bluetooth_devices(mac_address);
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_last_seen ON bluetooth_devices(last_seen);
		CREATE INDEX IF NOT EXISTS idx_episodes_subscription_id ON episodes(subscription_id);
		CREATE INDEX IF NOT EXISTS idx_episodes_guid ON episodes(guid);
		CREATE INDEX IF NOT EXISTS idx_episodes_downloaded_at ON episodes(downloaded_at);
		CREATE INDEX IF NOT EXISTS idx_episodes_pub_date_unix ON episodes(pub_date_unix);
		CREATE INDEX IF NOT EXISTS idx_episodes_last_played_at ON episodes(last_played_at);
		CREATE INDEX IF NOT EXISTS idx_download_queue_status ON download_queue(status);
		CREATE INDEX IF NOT EXISTS idx_download_queue_episode_id ON download_queue(episode_id);
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
	getHealth,
	parseRssDate
};