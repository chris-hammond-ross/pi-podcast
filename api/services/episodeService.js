const { getDatabase, parseRssDate } = require('../config/database');
const subscriptionService = require('./subscriptionService');

/**
 * Episode Service
 * Handles syncing episodes from RSS feeds and episode CRUD operations
 */
class EpisodeService {
	/**
	 * Get all episodes for a subscription
	 * @param {number} subscriptionId - The subscription ID
	 * @param {Object} options - Query options
	 * @param {boolean} options.downloadedOnly - Only return downloaded episodes
	 * @param {boolean} options.notDownloadedOnly - Only return episodes not downloaded
	 * @param {number} options.limit - Max episodes to return
	 * @param {number} options.offset - Offset for pagination
	 * @param {string} options.orderBy - Column to order by (default: pub_date)
	 * @param {string} options.order - ASC or DESC (default: DESC)
	 * @returns {Array} List of episodes
	 */
	getEpisodesBySubscription(subscriptionId, options = {}) {
		const db = getDatabase();
		const {
			downloadedOnly = false,
			notDownloadedOnly = false,
			limit = null,
			offset = 0,
			orderBy = 'pub_date',
			order = 'DESC'
		} = options;

		// Map pub_date to pub_date_unix for proper sorting
		const columnMap = {
			'pub_date': 'pub_date_unix'
		};

		// Validate orderBy to prevent SQL injection
		const allowedColumns = ['pub_date', 'pub_date_unix', 'title', 'created_at', 'downloaded_at', 'last_played_at'];
		let safeOrderBy = allowedColumns.includes(orderBy) ? orderBy : 'pub_date_unix';
		
		// Use pub_date_unix when pub_date is requested for proper sorting
		if (safeOrderBy === 'pub_date') {
			safeOrderBy = 'pub_date_unix';
		}
		
		const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

		let sql = 'SELECT * FROM episodes WHERE subscription_id = ?';
		const params = [subscriptionId];

		if (downloadedOnly) {
			sql += ' AND downloaded_at IS NOT NULL';
		} else if (notDownloadedOnly) {
			sql += ' AND downloaded_at IS NULL';
		}

		sql += ` ORDER BY ${safeOrderBy} ${safeOrder}`;

		if (limit) {
			sql += ' LIMIT ? OFFSET ?';
			params.push(limit, offset);
		}

		const stmt = db.prepare(sql);
		return stmt.all(...params);
	}

	/**
	 * Get episode by ID
	 * @param {number} id - Episode ID
	 * @returns {Object|null} Episode or null
	 */
	getEpisodeById(id) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM episodes WHERE id = ?');
		return stmt.get(id) || null;
	}

	/**
	 * Get episode by GUID within a subscription
	 * @param {number} subscriptionId - Subscription ID
	 * @param {string} guid - Episode GUID
	 * @returns {Object|null} Episode or null
	 */
	getEpisodeByGuid(subscriptionId, guid) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM episodes WHERE subscription_id = ? AND guid = ?');
		return stmt.get(subscriptionId, guid) || null;
	}

	/**
	 * Get episode counts for a subscription
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {Object} Counts object with total, downloaded, notDownloaded
	 */
	getEpisodeCounts(subscriptionId) {
		const db = getDatabase();
		
		const total = db.prepare(
			'SELECT COUNT(*) as count FROM episodes WHERE subscription_id = ?'
		).get(subscriptionId).count;

		const downloaded = db.prepare(
			'SELECT COUNT(*) as count FROM episodes WHERE subscription_id = ? AND downloaded_at IS NOT NULL'
		).get(subscriptionId).count;

		return {
			total,
			downloaded,
			notDownloaded: total - downloaded
		};
	}

	/**
	 * Get total count of all downloaded episodes across all subscriptions
	 * @returns {number} Total count of downloaded episodes
	 */
	getTotalDownloadedCount() {
		const db = getDatabase();
		const result = db.prepare(
			'SELECT COUNT(*) as count FROM episodes WHERE downloaded_at IS NOT NULL'
		).get();
		return result.count;
	}

	/**
	 * Get all downloaded episodes across all subscriptions
	 * @param {Object} options - Query options
	 * @param {number} options.limit - Max episodes to return
	 * @param {number} options.offset - Offset for pagination
	 * @param {string} options.orderBy - Column to order by (default: pub_date)
	 * @param {string} options.order - ASC or DESC (default: DESC)
	 * @returns {Array} List of downloaded episodes with subscription info
	 */
	getAllDownloadedEpisodes(options = {}) {
		const db = getDatabase();
		const {
			limit = null,
			offset = 0,
			orderBy = 'pub_date',
			order = 'DESC'
		} = options;

		// Validate orderBy to prevent SQL injection
		const allowedColumns = ['pub_date', 'pub_date_unix', 'title', 'created_at', 'downloaded_at', 'last_played_at'];
		let safeOrderBy = allowedColumns.includes(orderBy) ? orderBy : 'pub_date_unix';
		
		// Use pub_date_unix when pub_date is requested for proper sorting
		if (safeOrderBy === 'pub_date') {
			safeOrderBy = 'pub_date_unix';
		}
		
		const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

		let sql = `
			SELECT e.*, s.name as subscription_name, s.artworkUrl100 as subscription_artwork
			FROM episodes e
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE e.downloaded_at IS NOT NULL
			ORDER BY e.${safeOrderBy} ${safeOrder}
		`;
		const params = [];

		if (limit) {
			sql += ' LIMIT ? OFFSET ?';
			params.push(limit, offset);
		}

		const stmt = db.prepare(sql);
		return params.length > 0 ? stmt.all(...params) : stmt.all();
	}

	/**
	 * Sync episodes from RSS feed into database
	 * @param {number} subscriptionId - The subscription ID
	 * @returns {Promise<Object>} Sync result with counts
	 */
	async syncEpisodesFromFeed(subscriptionId) {
		const db = getDatabase();
		
		// Get subscription
		const subscription = subscriptionService.getSubscriptionById(subscriptionId);
		if (!subscription) {
			throw new Error('Subscription not found');
		}

		// Fetch feed
		const feedData = await subscriptionService.fetchFeed(subscription.feedUrl);
		
		const now = Math.floor(Date.now() / 1000);
		let added = 0;
		let updated = 0;
		let skipped = 0;

		const insertStmt = db.prepare(`
			INSERT INTO episodes (
				subscription_id, guid, title, description, pub_date, pub_date_unix,
				duration, audio_url, audio_type, audio_length, image_url, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const updateStmt = db.prepare(`
			UPDATE episodes SET
				title = ?, description = ?, pub_date = ?, pub_date_unix = ?,
				audio_url = ?, audio_type = ?, audio_length = ?, image_url = ?
			WHERE subscription_id = ? AND guid = ? AND downloaded_at IS NULL
		`);

		// Process each episode from feed
		for (const episode of feedData.episodes) {
			if (!episode.audioUrl) {
				skipped++;
				continue;
			}

			// Parse pub_date to Unix timestamp for reliable sorting
			const pubDateUnix = parseRssDate(episode.pubDate);

			const existing = this.getEpisodeByGuid(subscriptionId, episode.guid);

			if (existing) {
				// Update existing episode (but preserve download info and duration if downloaded)
				// Only update duration if the episode hasn't been downloaded yet
				updateStmt.run(
					episode.title,
					episode.description,
					episode.pubDate,
					pubDateUnix,
					episode.audioUrl,
					episode.audioType,
					episode.audioLength ? parseInt(episode.audioLength) : null,
					episode.image,
					subscriptionId,
					episode.guid
				);
				updated++;
			} else {
				// Insert new episode
				insertStmt.run(
					subscriptionId,
					episode.guid,
					episode.title,
					episode.description,
					episode.pubDate,
					pubDateUnix,
					episode.duration,
					episode.audioUrl,
					episode.audioType,
					episode.audioLength ? parseInt(episode.audioLength) : null,
					episode.image,
					now
				);
				added++;
			}
		}

		// Update subscription lastFetched
		db.prepare('UPDATE subscriptions SET lastFetched = ? WHERE id = ?')
			.run(now, subscriptionId);

		console.log(`[episode] Synced ${subscription.name}: ${added} added, ${updated} updated, ${skipped} skipped`);

		return {
			subscriptionId,
			subscriptionName: subscription.name,
			added,
			updated,
			skipped,
			total: feedData.episodes.length
		};
	}

	/**
	 * Mark episode as downloaded
	 * @param {number} episodeId - Episode ID
	 * @param {string} filePath - Path to downloaded file
	 * @param {number} fileSize - Size of file in bytes
	 * @param {string|null} duration - Duration in seconds (as string) extracted from the file, or null to keep existing
	 */
	markAsDownloaded(episodeId, filePath, fileSize, duration = null) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		
		if (duration !== null) {
			// Update with new duration from the actual file
			db.prepare(`
				UPDATE episodes SET file_path = ?, file_size = ?, downloaded_at = ?, duration = ?
				WHERE id = ?
			`).run(filePath, fileSize, now, duration, episodeId);
			
			console.log(`[episode] Marked episode ${episodeId} as downloaded (duration: ${duration}s)`);
		} else {
			// Keep existing duration
			db.prepare(`
				UPDATE episodes SET file_path = ?, file_size = ?, downloaded_at = ?
				WHERE id = ?
			`).run(filePath, fileSize, now, episodeId);

			console.log(`[episode] Marked episode ${episodeId} as downloaded`);
		}
	}

	/**
	 * Clear download info for an episode
	 * @param {number} episodeId - Episode ID
	 */
	clearDownload(episodeId) {
		const db = getDatabase();
		
		db.prepare(`
			UPDATE episodes SET file_path = NULL, file_size = NULL, downloaded_at = NULL
			WHERE id = ?
		`).run(episodeId);

		console.log(`[episode] Cleared download info for episode ${episodeId}`);
	}

	/**
	 * Get all episodes not yet downloaded for a subscription
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {Array} List of episodes
	 */
	getNotDownloaded(subscriptionId) {
		return this.getEpisodesBySubscription(subscriptionId, { notDownloadedOnly: true });
	}

	/**
	 * Delete all episodes for a subscription
	 * @param {number} subscriptionId - Subscription ID
	 * @returns {number} Number of deleted episodes
	 */
	deleteBySubscription(subscriptionId) {
		const db = getDatabase();
		const result = db.prepare('DELETE FROM episodes WHERE subscription_id = ?')
			.run(subscriptionId);
		
		console.log(`[episode] Deleted ${result.changes} episodes for subscription ${subscriptionId}`);
		return result.changes;
	}

	// ===== Playback State Methods =====

	/**
	 * Update playback position for an episode
	 * @param {number} episodeId - Episode ID
	 * @param {number} position - Position in seconds
	 */
	updatePlaybackPosition(episodeId, position) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		
		db.prepare(`
			UPDATE episodes 
			SET playback_position = ?, last_played_at = ?
			WHERE id = ?
		`).run(Math.floor(position), now, episodeId);
	}

	/**
	 * Mark episode as completed
	 * @param {number} episodeId - Episode ID
	 */
	markAsCompleted(episodeId) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		
		db.prepare(`
			UPDATE episodes 
			SET playback_completed = 1, playback_position = 0, last_played_at = ?
			WHERE id = ?
		`).run(now, episodeId);

		console.log(`[episode] Marked episode ${episodeId} as completed`);
	}

	/**
	 * Reset playback state for an episode (mark as unplayed)
	 * @param {number} episodeId - Episode ID
	 */
	resetPlaybackState(episodeId) {
		const db = getDatabase();
		
		db.prepare(`
			UPDATE episodes 
			SET playback_position = 0, playback_completed = 0, last_played_at = NULL
			WHERE id = ?
		`).run(episodeId);

		console.log(`[episode] Reset playback state for episode ${episodeId}`);
	}

	/**
	 * Get playback state for an episode
	 * @param {number} episodeId - Episode ID
	 * @returns {Object|null} Playback state or null
	 */
	getPlaybackState(episodeId) {
		const db = getDatabase();
		const stmt = db.prepare(`
			SELECT playback_position, playback_completed, last_played_at 
			FROM episodes WHERE id = ?
		`);
		return stmt.get(episodeId) || null;
	}

	/**
	 * Get recently played episodes across all subscriptions
	 * @param {number} limit - Max episodes to return (default 10)
	 * @returns {Array} List of recently played episodes with subscription info
	 */
	getRecentlyPlayed(limit = 10) {
		const db = getDatabase();
		const stmt = db.prepare(`
			SELECT e.*, s.name as subscription_name, s.artworkUrl100 as subscription_artwork
			FROM episodes e
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE e.last_played_at IS NOT NULL
			ORDER BY e.last_played_at DESC
			LIMIT ?
		`);
		return stmt.all(limit);
	}

	/**
	 * Get in-progress episodes (started but not completed)
	 * @param {number} limit - Max episodes to return (default 10)
	 * @returns {Array} List of in-progress episodes with subscription info
	 */
	getInProgress(limit = 10) {
		const db = getDatabase();
		const stmt = db.prepare(`
			SELECT e.*, s.name as subscription_name, s.artworkUrl100 as subscription_artwork
			FROM episodes e
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE e.playback_position > 0 
			  AND e.playback_completed = 0
			  AND e.downloaded_at IS NOT NULL
			ORDER BY e.last_played_at DESC
			LIMIT ?
		`);
		return stmt.all(limit);
	}
}

// Create singleton instance
const episodeService = new EpisodeService();

module.exports = episodeService;
