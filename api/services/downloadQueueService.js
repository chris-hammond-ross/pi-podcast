const { getDatabase } = require('../config/database');

/**
 * Download Queue Service
 * Manages the download queue - adding, removing, updating status, querying
 */
class DownloadQueueService {
	/**
	 * Add an episode to the download queue
	 * @param {number} episodeId - Episode ID
	 * @param {number} priority - Priority (higher = download first)
	 * @returns {Object} Queue item
	 */
	addToQueue(episodeId, priority = 0) {
		const db = getDatabase();
		
		// Check if already in queue
		const existing = db.prepare(
			'SELECT * FROM download_queue WHERE episode_id = ? AND status IN (?, ?)'
		).get(episodeId, 'pending', 'downloading');
		
		if (existing) {
			return existing;
		}

		const now = Math.floor(Date.now() / 1000);
		const result = db.prepare(`
			INSERT INTO download_queue (episode_id, status, priority, created_at)
			VALUES (?, 'pending', ?, ?)
		`).run(episodeId, priority, now);

		console.log(`[queue] Added episode ${episodeId} to queue`);

		return {
			id: result.lastInsertRowid,
			episode_id: episodeId,
			status: 'pending',
			progress: 0,
			priority,
			created_at: now
		};
	}

	/**
	 * Add multiple episodes to the queue
	 * @param {number[]} episodeIds - Array of episode IDs
	 * @param {number} priority - Priority for all items
	 * @returns {Object} Result with added count
	 */
	addBatchToQueue(episodeIds, priority = 0) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		let added = 0;
		let skipped = 0;

		const checkStmt = db.prepare(
			'SELECT id FROM download_queue WHERE episode_id = ? AND status IN (?, ?)'
		);
		const insertStmt = db.prepare(`
			INSERT INTO download_queue (episode_id, status, priority, created_at)
			VALUES (?, 'pending', ?, ?)
		`);

		const transaction = db.transaction(() => {
			for (const episodeId of episodeIds) {
				const existing = checkStmt.get(episodeId, 'pending', 'downloading');
				if (existing) {
					skipped++;
					continue;
				}
				insertStmt.run(episodeId, priority, now);
				added++;
			}
		});

		transaction();

		console.log(`[queue] Batch added: ${added} added, ${skipped} skipped`);

		return { added, skipped, total: episodeIds.length };
	}

	/**
	 * Remove an item from the queue
	 * @param {number} queueId - Queue item ID
	 * @returns {boolean} Success
	 */
	removeFromQueue(queueId) {
		const db = getDatabase();
		const result = db.prepare('DELETE FROM download_queue WHERE id = ?').run(queueId);
		
		if (result.changes > 0) {
			console.log(`[queue] Removed queue item ${queueId}`);
		}
		
		return result.changes > 0;
	}

	/**
	 * Remove an item from queue by episode ID
	 * @param {number} episodeId - Episode ID
	 * @returns {boolean} Success
	 */
	removeByEpisodeId(episodeId) {
		const db = getDatabase();
		const result = db.prepare('DELETE FROM download_queue WHERE episode_id = ?').run(episodeId);
		return result.changes > 0;
	}

	/**
	 * Get queue item by ID
	 * @param {number} queueId - Queue item ID
	 * @returns {Object|null} Queue item
	 */
	getQueueItem(queueId) {
		const db = getDatabase();
		return db.prepare('SELECT * FROM download_queue WHERE id = ?').get(queueId) || null;
	}

	/**
	 * Get queue item by episode ID
	 * @param {number} episodeId - Episode ID
	 * @returns {Object|null} Queue item
	 */
	getQueueItemByEpisodeId(episodeId) {
		const db = getDatabase();
		return db.prepare(
			'SELECT * FROM download_queue WHERE episode_id = ? ORDER BY created_at DESC LIMIT 1'
		).get(episodeId) || null;
	}

	/**
	 * Get next pending item to download
	 * Downloads in order: highest priority first, then oldest episode (by pub_date) first
	 * @returns {Object|null} Queue item with episode data
	 */
	getNextPending() {
		const db = getDatabase();
		return db.prepare(`
			SELECT dq.*, e.title as episode_title, e.audio_url, e.audio_length,
				   e.subscription_id, e.pub_date, s.name as subscription_name
			FROM download_queue dq
			JOIN episodes e ON dq.episode_id = e.id
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE dq.status = 'pending'
			ORDER BY dq.priority DESC, e.pub_date ASC
			LIMIT 1
		`).get() || null;
	}

	/**
	 * Update queue item status
	 * @param {number} queueId - Queue item ID
	 * @param {string} status - New status
	 * @param {string|null} errorMessage - Error message if failed
	 */
	updateStatus(queueId, status, errorMessage = null) {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);

		let sql = 'UPDATE download_queue SET status = ?';
		const params = [status];

		if (status === 'downloading') {
			sql += ', started_at = ?';
			params.push(now);
		} else if (status === 'completed' || status === 'failed') {
			sql += ', completed_at = ?';
			params.push(now);
		}

		if (errorMessage !== null) {
			sql += ', error_message = ?';
			params.push(errorMessage);
		}

		sql += ' WHERE id = ?';
		params.push(queueId);

		db.prepare(sql).run(...params);
	}

	/**
	 * Update download progress
	 * @param {number} queueId - Queue item ID
	 * @param {number} progress - Bytes downloaded
	 */
	updateProgress(queueId, progress) {
		const db = getDatabase();
		db.prepare('UPDATE download_queue SET progress = ? WHERE id = ?').run(progress, queueId);
	}

	/**
	 * Increment retry count
	 * @param {number} queueId - Queue item ID
	 * @returns {number} New retry count
	 */
	incrementRetry(queueId) {
		const db = getDatabase();
		db.prepare('UPDATE download_queue SET retry_count = retry_count + 1 WHERE id = ?').run(queueId);
		const item = this.getQueueItem(queueId);
		return item ? item.retry_count : 0;
	}

	/**
	 * Reset item to pending (for retry)
	 * @param {number} queueId - Queue item ID
	 */
	resetToPending(queueId) {
		const db = getDatabase();
		db.prepare(`
			UPDATE download_queue 
			SET status = 'pending', progress = 0, error_message = NULL, started_at = NULL
			WHERE id = ?
		`).run(queueId);
	}

	/**
	 * Get current queue status
	 * @returns {Object} Queue status with counts and items
	 */
	getQueueStatus() {
		const db = getDatabase();

		const counts = db.prepare(`
			SELECT 
				COUNT(*) as total,
				SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
				SUM(CASE WHEN status = 'downloading' THEN 1 ELSE 0 END) as downloading,
				SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
				SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
				SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
			FROM download_queue
		`).get();

		const activeItems = db.prepare(`
			SELECT dq.*, e.title as episode_title, e.audio_url, e.audio_length,
				   e.subscription_id, e.pub_date, s.name as subscription_name
			FROM download_queue dq
			JOIN episodes e ON dq.episode_id = e.id
			JOIN subscriptions s ON e.subscription_id = s.id
			WHERE dq.status IN ('pending', 'downloading')
			ORDER BY 
				CASE WHEN dq.status = 'downloading' THEN 0 ELSE 1 END,
				dq.priority DESC, 
				e.pub_date ASC
		`).all();

		return {
			counts,
			activeItems,
			isActive: counts.downloading > 0 || counts.pending > 0
		};
	}

	/**
	 * Get all queue items with optional status filter
	 * Orders by priority (highest first), then by episode pub_date (oldest first)
	 * This matches the actual download processing order
	 * @param {string|null} status - Filter by status
	 * @param {number} limit - Max items
	 * @returns {Array} Queue items
	 */
	getQueueItems(status = null, limit = 100) {
		const db = getDatabase();
		
		let sql = `
			SELECT dq.*, e.title as episode_title, e.audio_url, e.audio_length,
				   e.subscription_id, e.pub_date, s.name as subscription_name
			FROM download_queue dq
			JOIN episodes e ON dq.episode_id = e.id
			JOIN subscriptions s ON e.subscription_id = s.id
		`;
		const params = [];

		if (status) {
			sql += ' WHERE dq.status = ?';
			params.push(status);
		}

		sql += ' ORDER BY dq.priority DESC, e.pub_date ASC LIMIT ?';
		params.push(limit);

		return db.prepare(sql).all(...params);
	}

	/**
	 * Clear completed and failed items from queue
	 * @returns {number} Number of items cleared
	 */
	clearFinished() {
		const db = getDatabase();
		const result = db.prepare(
			"DELETE FROM download_queue WHERE status IN ('completed', 'failed', 'cancelled')"
		).run();
		
		console.log(`[queue] Cleared ${result.changes} finished items`);
		return result.changes;
	}

	/**
	 * Cancel all pending downloads
	 * @returns {number} Number of items cancelled
	 */
	cancelAllPending() {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		const result = db.prepare(`
			UPDATE download_queue 
			SET status = 'cancelled', completed_at = ?
			WHERE status = 'pending'
		`).run(now);
		
		console.log(`[queue] Cancelled ${result.changes} pending items`);
		return result.changes;
	}

	/**
	 * Mark any 'downloading' items as failed (for recovery after crash)
	 * @returns {number} Number of items marked failed
	 */
	recoverInterrupted() {
		const db = getDatabase();
		const now = Math.floor(Date.now() / 1000);
		const result = db.prepare(`
			UPDATE download_queue 
			SET status = 'failed', error_message = 'Interrupted - server restart', completed_at = ?
			WHERE status = 'downloading'
		`).run(now);
		
		if (result.changes > 0) {
			console.log(`[queue] Recovered ${result.changes} interrupted downloads`);
		}
		return result.changes;
	}
}

// Create singleton instance
const downloadQueueService = new DownloadQueueService();

module.exports = downloadQueueService;
