const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../config/database');
const { PLAYLIST_DIR } = require('../config/constants');

/**
 * Playlist Service
 * Handles playlist CRUD operations and M3U file generation
 * 
 * Playlist types:
 * - 'auto': Auto-generated playlists linked to subscriptions, updated when episodes are downloaded/deleted
 * - 'user': User-created playlists with manually added episodes
 */
class PlaylistService {
	constructor() {
		this._ensurePlaylistDirs();
	}

	/**
	 * Ensure playlist directories exist
	 */
	_ensurePlaylistDirs() {
		const autoDir = path.join(PLAYLIST_DIR, 'auto');
		const userDir = path.join(PLAYLIST_DIR, 'user');

		if (!fs.existsSync(autoDir)) {
			fs.mkdirSync(autoDir, { recursive: true });
			console.log(`[playlist] Created auto playlist directory: ${autoDir}`);
		}

		if (!fs.existsSync(userDir)) {
			fs.mkdirSync(userDir, { recursive: true });
			console.log(`[playlist] Created user playlist directory: ${userDir}`);
		}
	}

	/**
	 * Get M3U file path for a playlist
	 * @param {string} type - Playlist type ('auto' or 'user')
	 * @param {number} id - Playlist ID or subscription ID for auto playlists
	 * @returns {string} Full path to M3U file
	 */
	_getM3uPath(type, id) {
		return path.join(PLAYLIST_DIR, type, `${id}.m3u`);
	}

	/**
	 * Generate M3U content from episodes
	 * @param {string} playlistName - Name of the playlist
	 * @param {Array} episodes - Array of episode objects with file_path, title, duration
	 * @returns {string} M3U file content
	 */
	_generateM3uContent(playlistName, episodes) {
		let content = '#EXTM3U\n';
		content += `#PLAYLIST:${playlistName}\n`;

		for (const episode of episodes) {
			if (!episode.file_path) continue;

			// Parse duration to seconds (could be "HH:MM:SS" or "MM:SS" or just seconds)
			let durationSecs = -1;
			if (episode.duration) {
				const parts = episode.duration.split(':').map(Number);
				if (parts.length === 3) {
					durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
				} else if (parts.length === 2) {
					durationSecs = parts[0] * 60 + parts[1];
				} else if (parts.length === 1 && !isNaN(parts[0])) {
					durationSecs = parts[0];
				}
			}

			content += `#EXTINF:${durationSecs},${episode.title || 'Unknown'}\n`;
			content += `${episode.file_path}\n`;
		}

		return content;
	}

	/**
	 * Write M3U file to disk
	 * @param {string} filePath - Path to write the file
	 * @param {string} content - M3U content
	 */
	_writeM3uFile(filePath, content) {
		try {
			fs.writeFileSync(filePath, content, 'utf8');
			console.log(`[playlist] Wrote M3U file: ${filePath}`);
		} catch (err) {
			console.error(`[playlist] Failed to write M3U file: ${err.message}`);
			throw err;
		}
	}

	/**
	 * Delete M3U file from disk
	 * @param {string} filePath - Path to delete
	 */
	_deleteM3uFile(filePath) {
		try {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
				console.log(`[playlist] Deleted M3U file: ${filePath}`);
			}
		} catch (err) {
			console.error(`[playlist] Failed to delete M3U file: ${err.message}`);
		}
	}

	// ===== Auto Playlist Methods =====

	/**
	 * Get or create auto playlist for a subscription
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {Object} Playlist record
	 */
	getOrCreateAutoPlaylist(subscriptionId) {
		const db = getDatabase();

		// Check if auto playlist exists
		let playlist = db.prepare(
			"SELECT * FROM playlists WHERE type = 'auto' AND subscription_id = ?"
		).get(subscriptionId);

		if (playlist) {
			return playlist;
		}

		// Get subscription name for playlist name
		const subscription = db.prepare(
			'SELECT name FROM subscriptions WHERE id = ?'
		).get(subscriptionId);

		if (!subscription) {
			throw new Error('Subscription not found');
		}

		const now = Math.floor(Date.now() / 1000);
		const filePath = this._getM3uPath('auto', subscriptionId);

		// Create new auto playlist
		const result = db.prepare(`
			INSERT INTO playlists (name, description, type, subscription_id, file_path, created_at, updated_at)
			VALUES (?, ?, 'auto', ?, ?, ?, ?)
		`).run(
			subscription.name,
			`Auto-generated playlist for ${subscription.name}`,
			subscriptionId,
			filePath,
			now,
			now
		);

		console.log(`[playlist] Created auto playlist for subscription ${subscriptionId}`);

		return {
			id: result.lastInsertRowid,
			name: subscription.name,
			description: `Auto-generated playlist for ${subscription.name}`,
			type: 'auto',
			subscription_id: subscriptionId,
			file_path: filePath,
			created_at: now,
			updated_at: now
		};
	}

	/**
	 * Get auto playlist by subscription ID
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {Object|null} Playlist or null
	 */
	getAutoPlaylistBySubscription(subscriptionId) {
		const db = getDatabase();
		return db.prepare(
			"SELECT * FROM playlists WHERE type = 'auto' AND subscription_id = ?"
		).get(subscriptionId) || null;
	}

	/**
	 * Regenerate M3U file for an auto playlist
	 * Gets all downloaded episodes for the subscription, sorted by pub_date DESC
	 * @param {number} subscriptionId - Subscription ID
	 */
	regenerateAutoPlaylist(subscriptionId) {
		const db = getDatabase();

		// Ensure playlist exists
		const playlist = this.getOrCreateAutoPlaylist(subscriptionId);

		// Get all downloaded episodes for this subscription, sorted by pub_date DESC (newest first)
		const episodes = db.prepare(`
			SELECT e.*, s.name as subscription_name
			FROM episodes e
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE e.subscription_id = ?
			  AND e.downloaded_at IS NOT NULL
			  AND e.file_path IS NOT NULL
			ORDER BY e.pub_date DESC
		`).all(subscriptionId);

		// Generate and write M3U
		const content = this._generateM3uContent(playlist.name, episodes);
		this._writeM3uFile(playlist.file_path, content);

		// Update playlist updated_at
		const now = Math.floor(Date.now() / 1000);
		db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlist.id);

		console.log(`[playlist] Regenerated auto playlist for subscription ${subscriptionId} with ${episodes.length} episodes`);

		return {
			playlist,
			episodeCount: episodes.length
		};
	}

	/**
	 * Delete auto playlist for a subscription
	 * Called when a subscription is deleted
	 * @param {number} subscriptionId - Subscription ID
	 */
	deleteAutoPlaylist(subscriptionId) {
		const db = getDatabase();

		const playlist = this.getAutoPlaylistBySubscription(subscriptionId);
		if (!playlist) return;

		// Delete M3U file
		if (playlist.file_path) {
			this._deleteM3uFile(playlist.file_path);
		}

		// Delete from database (cascade will handle playlist_episodes)
		db.prepare("DELETE FROM playlists WHERE type = 'auto' AND subscription_id = ?")
			.run(subscriptionId);

		console.log(`[playlist] Deleted auto playlist for subscription ${subscriptionId}`);
	}

	/**
	 * Get all auto playlists with subscription info
	 * @returns {Array} List of auto playlists with subscription details
	 */
	getAllAutoPlaylists() {
		const db = getDatabase();

		const playlists = db.prepare(`
			SELECT p.*, s.name as subscription_name, s.artworkUrl100 as subscription_artwork,
			       (SELECT COUNT(*) FROM episodes e 
			        WHERE e.subscription_id = p.subscription_id 
			          AND e.downloaded_at IS NOT NULL) as episode_count
			FROM playlists p
			JOIN subscriptions s ON p.subscription_id = s.id
			WHERE p.type = 'auto'
			ORDER BY p.name ASC
		`).all();

		return playlists;
	}

	// ===== User Playlist Methods =====

	/**
	 * Create a user playlist
	 * @param {string} name - Playlist name
	 * @param {string} [description] - Optional description
	 * @returns {Object} Created playlist
	 */
	createUserPlaylist(name, description = null) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);

		const result = db.prepare(`
			INSERT INTO playlists (name, description, type, created_at, updated_at)
			VALUES (?, ?, 'user', ?, ?)
		`).run(name, description, now, now);

		const playlistId = result.lastInsertRowid;
		const filePath = this._getM3uPath('user', playlistId);

		// Update with file path
		db.prepare('UPDATE playlists SET file_path = ? WHERE id = ?').run(filePath, playlistId);

		// Create empty M3U file
		this._writeM3uFile(filePath, `#EXTM3U\n#PLAYLIST:${name}\n`);

		console.log(`[playlist] Created user playlist: ${name}`);

		return {
			id: playlistId,
			name,
			description,
			type: 'user',
			subscription_id: null,
			file_path: filePath,
			created_at: now,
			updated_at: now
		};
	}

	/**
	 * Get a playlist by ID
	 * @param {number} id - Playlist ID
	 * @returns {Object|null} Playlist or null
	 */
	getPlaylistById(id) {
		const db = getDatabase();
		return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) || null;
	}

	/**
	 * Get all user playlists
	 * @returns {Array} List of user playlists
	 */
	getAllUserPlaylists() {
		const db = getDatabase();

		const playlists = db.prepare(`
			SELECT p.*,
			       (SELECT COUNT(*) FROM playlist_episodes pe WHERE pe.playlist_id = p.id) as episode_count
			FROM playlists p
			WHERE p.type = 'user'
			ORDER BY p.name ASC
		`).all();

		return playlists;
	}

	/**
	 * Update a user playlist
	 * @param {number} id - Playlist ID
	 * @param {Object} updates - Fields to update
	 * @param {string} [updates.name] - New name
	 * @param {string} [updates.description] - New description
	 * @returns {Object} Updated playlist
	 */
	updateUserPlaylist(id, updates) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);

		const playlist = this.getPlaylistById(id);
		if (!playlist || playlist.type !== 'user') {
			throw new Error('User playlist not found');
		}

		const fields = [];
		const values = [];

		if (updates.name !== undefined) {
			fields.push('name = ?');
			values.push(updates.name);
		}

		if (updates.description !== undefined) {
			fields.push('description = ?');
			values.push(updates.description);
		}

		if (fields.length === 0) {
			return playlist;
		}

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);

		db.prepare(`UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`).run(...values);

		// Regenerate M3U with new name if changed
		if (updates.name) {
			this._regenerateUserPlaylistM3u(id);
		}

		return this.getPlaylistById(id);
	}

	/**
	 * Delete a user playlist
	 * @param {number} id - Playlist ID
	 * @returns {boolean} True if deleted
	 */
	deleteUserPlaylist(id) {
		const db = getDatabase();

		const playlist = this.getPlaylistById(id);
		if (!playlist || playlist.type !== 'user') {
			return false;
		}

		// Delete M3U file
		if (playlist.file_path) {
			this._deleteM3uFile(playlist.file_path);
		}

		// Delete from database
		const result = db.prepare('DELETE FROM playlists WHERE id = ? AND type = ?')
			.run(id, 'user');

		console.log(`[playlist] Deleted user playlist: ${playlist.name}`);

		return result.changes > 0;
	}

	/**
	 * Add episode to user playlist
	 * @param {number} playlistId - Playlist ID
	 * @param {number} episodeId - Episode ID
	 * @returns {Object} Added playlist episode record
	 */
	addEpisodeToUserPlaylist(playlistId, episodeId) {
		const db = getDatabase();

		const playlist = this.getPlaylistById(playlistId);
		if (!playlist || playlist.type !== 'user') {
			throw new Error('User playlist not found');
		}

		// Get episode info
		const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId);
		if (!episode) {
			throw new Error('Episode not found');
		}

		if (!episode.downloaded_at || !episode.file_path) {
			throw new Error('Episode must be downloaded to add to playlist');
		}

		// Get max position
		const maxPos = db.prepare(
			'SELECT MAX(position) as max FROM playlist_episodes WHERE playlist_id = ?'
		).get(playlistId);
		const position = (maxPos?.max ?? -1) + 1;

		const now = Math.floor(Date.now() / 1000);

		try {
			db.prepare(`
				INSERT INTO playlist_episodes (playlist_id, episode_url, episode_title, position, added_at)
				VALUES (?, ?, ?, ?, ?)
			`).run(playlistId, episode.audio_url, episode.title, position, now);
		} catch (err) {
			if (err.message.includes('UNIQUE constraint failed')) {
				throw new Error('Episode already in playlist');
			}
			throw err;
		}

		// Update playlist updated_at
		db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);

		// Regenerate M3U
		this._regenerateUserPlaylistM3u(playlistId);

		console.log(`[playlist] Added episode ${episodeId} to playlist ${playlistId}`);

		return { playlistId, episodeId, position };
	}

	/**
	 * Remove episode from user playlist
	 * @param {number} playlistId - Playlist ID
	 * @param {number} episodeId - Episode ID (or use episodeUrl)
	 * @returns {boolean} True if removed
	 */
	removeEpisodeFromUserPlaylist(playlistId, episodeId) {
		const db = getDatabase();

		const playlist = this.getPlaylistById(playlistId);
		if (!playlist || playlist.type !== 'user') {
			return false;
		}

		// Get episode URL
		const episode = db.prepare('SELECT audio_url FROM episodes WHERE id = ?').get(episodeId);
		if (!episode) {
			return false;
		}

		const result = db.prepare(
			'DELETE FROM playlist_episodes WHERE playlist_id = ? AND episode_url = ?'
		).run(playlistId, episode.audio_url);

		if (result.changes > 0) {
			// Update playlist updated_at
			const now = Math.floor(Date.now() / 1000);
			db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);

			// Regenerate M3U
			this._regenerateUserPlaylistM3u(playlistId);

			console.log(`[playlist] Removed episode ${episodeId} from playlist ${playlistId}`);
		}

		return result.changes > 0;
	}

	/**
	 * Get episodes in a user playlist
	 * @param {number} playlistId - Playlist ID
	 * @returns {Array} List of episodes with playlist info
	 */
	getUserPlaylistEpisodes(playlistId) {
		const db = getDatabase();

		return db.prepare(`
			SELECT e.*, pe.position, pe.added_at as playlist_added_at,
			       s.name as subscription_name, s.artworkUrl100 as subscription_artwork
			FROM playlist_episodes pe
			JOIN episodes e ON pe.episode_url = e.audio_url
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE pe.playlist_id = ?
			ORDER BY pe.position ASC
		`).all(playlistId);
	}

	/**
	 * Regenerate M3U file for a user playlist
	 * @param {number} playlistId - Playlist ID
	 */
	_regenerateUserPlaylistM3u(playlistId) {
		const playlist = this.getPlaylistById(playlistId);
		if (!playlist) return;

		const episodes = this.getUserPlaylistEpisodes(playlistId);
		const content = this._generateM3uContent(playlist.name, episodes);
		this._writeM3uFile(playlist.file_path, content);
	}

	// ===== Event Handlers =====

	/**
	 * Handle episode downloaded event
	 * Regenerates the auto playlist for the subscription
	 * @param {number} episodeId - Episode ID
	 * @param {number} subscriptionId - Subscription ID
	 */
	onEpisodeDownloaded(episodeId, subscriptionId) {
		try {
			this.regenerateAutoPlaylist(subscriptionId);
		} catch (err) {
			console.error(`[playlist] Failed to update auto playlist on download: ${err.message}`);
		}
	}

	/**
	 * Handle episode deleted event
	 * Regenerates the auto playlist for the subscription
	 * @param {number} episodeId - Episode ID
	 * @param {number} subscriptionId - Subscription ID
	 */
	onEpisodeDeleted(episodeId, subscriptionId) {
		try {
			this.regenerateAutoPlaylist(subscriptionId);
		} catch (err) {
			console.error(`[playlist] Failed to update auto playlist on delete: ${err.message}`);
		}
	}

	/**
	 * Handle subscription deleted event
	 * Deletes the auto playlist
	 * @param {number} subscriptionId - Subscription ID
	 */
	onSubscriptionDeleted(subscriptionId) {
		try {
			this.deleteAutoPlaylist(subscriptionId);
		} catch (err) {
			console.error(`[playlist] Failed to delete auto playlist: ${err.message}`);
		}
	}

	/**
	 * Handle subscription created event
	 * Creates the auto playlist (empty initially)
	 * @param {number} subscriptionId - Subscription ID
	 */
	onSubscriptionCreated(subscriptionId) {
		try {
			this.getOrCreateAutoPlaylist(subscriptionId);
			// Write empty M3U file
			const playlist = this.getAutoPlaylistBySubscription(subscriptionId);
			if (playlist) {
				this._writeM3uFile(playlist.file_path, `#EXTM3U\n#PLAYLIST:${playlist.name}\n`);
			}
		} catch (err) {
			console.error(`[playlist] Failed to create auto playlist: ${err.message}`);
		}
	}
}

// Create singleton instance
const playlistService = new PlaylistService();

module.exports = playlistService;
