const { getDatabase } = require('../config/database');
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

		// Validate orderBy to prevent SQL injection
		const allowedColumns = ['pub_date', 'title', 'created_at', 'downloaded_at'];
		const safeOrderBy = allowedColumns.includes(orderBy) ? orderBy : 'pub_date';
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
				subscription_id, guid, title, description, pub_date,
				duration, audio_url, audio_type, audio_length, image_url, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const updateStmt = db.prepare(`
			UPDATE episodes SET
				title = ?, description = ?, pub_date = ?, duration = ?,
				audio_url = ?, audio_type = ?, audio_length = ?, image_url = ?
			WHERE subscription_id = ? AND guid = ?
		`);

		// Process each episode from feed
		for (const episode of feedData.episodes) {
			if (!episode.audioUrl) {
				skipped++;
				continue;
			}

			const existing = this.getEpisodeByGuid(subscriptionId, episode.guid);

			if (existing) {
				// Update existing episode (but preserve download info)
				updateStmt.run(
					episode.title,
					episode.description,
					episode.pubDate,
					episode.duration,
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
	 */
	markAsDownloaded(episodeId, filePath, fileSize) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		
		db.prepare(`
			UPDATE episodes SET file_path = ?, file_size = ?, downloaded_at = ?
			WHERE id = ?
		`).run(filePath, fileSize, now, episodeId);

		console.log(`[episode] Marked episode ${episodeId} as downloaded`);
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
}

// Create singleton instance
const episodeService = new EpisodeService();

module.exports = episodeService;
