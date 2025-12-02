const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Create database tables if they don't exist
 * @param {Database} database - The database instance
 */
function createTables(database) {
	// Run migrations for existing tables
	runMigrations(database);

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

		-- Episodes table (synced from RSS feeds)
		CREATE TABLE IF NOT EXISTS episodes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			subscription_id INTEGER NOT NULL,
			guid TEXT NOT NULL,
			title TEXT,
			description TEXT,
			pub_date TEXT,
			duration TEXT,
			audio_url TEXT NOT NULL,
			audio_type TEXT DEFAULT 'audio/mpeg',
			audio_length INTEGER,
			image_url TEXT,
			file_path TEXT,
			file_size INTEGER,
			downloaded_at INTEGER,
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
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_mac ON bluetooth_devices(mac_address);
		CREATE INDEX IF NOT EXISTS idx_bluetooth_devices_last_seen ON bluetooth_devices(last_seen);
		CREATE INDEX IF NOT EXISTS idx_episodes_subscription_id ON episodes(subscription_id);
		CREATE INDEX IF NOT EXISTS idx_episodes_guid ON episodes(guid);
		CREATE INDEX IF NOT EXISTS idx_episodes_downloaded_at ON episodes(downloaded_at);
		CREATE INDEX IF NOT EXISTS idx_episodes_last_played_at ON episodes(last_played_at);
		CREATE INDEX IF NOT EXISTS idx_download_queue_status ON download_queue(status);
		CREATE INDEX IF NOT EXISTS idx_download_queue_episode_id ON download_queue(episode_id);
	`);

	console.log('[database] Tables verified/created');
}

/**
 * Run migrations to add columns to existing tables
 * @param {Database} database - The database instance
 */
function runMigrations(database) {
	// Helper to check if column exists
	const columnExists = (table, column) => {
		const result = database.prepare(`PRAGMA table_info(${table})`).all();
		return result.some(col => col.name === column);
	};

	// === Subscription migrations ===

	// Add auto_download columns to subscriptions if they don't exist
	if (!columnExists('subscriptions', 'auto_download')) {
		database.exec('ALTER TABLE subscriptions ADD COLUMN auto_download INTEGER DEFAULT 0');
		console.log('[database] Added auto_download column to subscriptions');
	}

	if (!columnExists('subscriptions', 'auto_download_limit')) {
		database.exec('ALTER TABLE subscriptions ADD COLUMN auto_download_limit INTEGER DEFAULT 5');
		console.log('[database] Added auto_download_limit column to subscriptions');
	}

	// === Episode playback migrations ===

	// Add playback_position column for resume functionality
	if (!columnExists('episodes', 'playback_position')) {
		database.exec('ALTER TABLE episodes ADD COLUMN playback_position INTEGER DEFAULT 0');
		console.log('[database] Added playback_position column to episodes');
	}

	// Add playback_completed flag to track finished episodes
	if (!columnExists('episodes', 'playback_completed')) {
		database.exec('ALTER TABLE episodes ADD COLUMN playback_completed INTEGER DEFAULT 0');
		console.log('[database] Added playback_completed column to episodes');
	}

	// Add last_played_at timestamp
	if (!columnExists('episodes', 'last_played_at')) {
		database.exec('ALTER TABLE episodes ADD COLUMN last_played_at INTEGER');
		console.log('[database] Added last_played_at column to episodes');
	}
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
