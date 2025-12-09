const { EventEmitter } = require('events');
const {
	MPV_POSITION_SAVE_INTERVAL,
	MPV_COMPLETION_THRESHOLD
} = require('../config/constants');
const episodeService = require('./episodeService');

/**
 * Mock Media Player Service
 * Simulates MPV playback for development on non-Pi machines
 * Includes full queue management support
 */
class MediaPlayerServiceMock extends EventEmitter {
	constructor() {
		super();

		// Playback state
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;
		this.volume = 100;

		// Queue state - mirrors real service
		// Each item: { episodeId, episode (full data), filePath }
		this.queue = [];
		this.queuePosition = -1; // Current position in queue (-1 = nothing playing)

		// Simulation timer
		this.playbackTimer = null;
		this.positionSaveTimer = null;

		// Broadcast callback
		this.broadcastCallback = null;
	}

	/**
	 * Set the broadcast callback for WebSocket messages
	 * @param {Function} callback - Function to broadcast messages to all clients
	 */
	setBroadcastCallback(callback) {
		this.broadcastCallback = callback;
	}

	/**
	 * Broadcast a message to all WebSocket clients
	 * @param {Object} message - The message to broadcast
	 */
	broadcast(message) {
		if (this.broadcastCallback) {
			this.broadcastCallback(message);
		}
	}

	/**
	 * Initialize the mock media player service
	 */
	async initialize() {
		console.log('[media-mock] Mock media player service initialized');
		console.log('[media-mock] Running in mock mode - no actual audio playback');
	}

	/**
	 * Validate and get episode for queue operations
	 * @param {number} episodeId - Episode ID
	 * @returns {Object} Episode data with file path validation
	 */
	validateEpisodeForQueue(episodeId) {
		const episode = episodeService.getEpisodeById(episodeId);

		if (!episode) {
			throw new Error('Episode not found');
		}

		if (!episode.file_path || !episode.downloaded_at) {
			throw new Error('Episode not downloaded');
		}

		return episode;
	}

	/**
	 * Play an episode by ID (replaces queue with single episode)
	 * @param {number} episodeId - Episode ID to play
	 * @returns {Promise<Object>} Playback result
	 */
	async playEpisode(episodeId) {
		const episode = this.validateEpisodeForQueue(episodeId);

		console.log(`[media-mock] Simulating playback: ${episode.title}`);

		// Stop current playback if any
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
			this.stopPlaybackTimer();
		}

		// Clear queue and add this episode
		this.queue = [{
			episodeId: episode.id,
			episode: episode,
			filePath: episode.file_path
		}];
		this.queuePosition = 0;

		// Set current episode
		this.currentEpisode = episode;
		this.isPlaying = true;
		this.isPaused = false;

		// Parse duration from episode metadata or use default
		this.duration = this.parseDuration(episode.duration) || 3600; // Default 1 hour

		// Resume from saved position if available
		if (episode.playback_position > 0 && !episode.playback_completed) {
			this.position = episode.playback_position;
			console.log(`[media-mock] Resuming from position: ${this.position}s`);
		} else {
			this.position = 0;
		}

		// Start simulated playback
		this.startPlaybackTimer();
		this.startPositionSaveTimer();

		// Broadcast status and queue update
		this.broadcastStatus();
		this.broadcastQueue();
		this.broadcast({
			type: 'media:track-changed',
			episode: {
				id: episode.id,
				title: episode.title,
				subscription_id: episode.subscription_id,
				duration: this.duration
			},
			queuePosition: 0,
			queueLength: 1
		});

		return {
			success: true,
			episode: {
				id: episode.id,
				title: episode.title,
				duration: this.duration,
				resumedFrom: episode.playback_position > 0 ? episode.playback_position : 0
			}
		};
	}

	/**
	 * Parse duration string to seconds
	 * @param {string} durationStr - Duration string (e.g., "1:23:45" or "45:30")
	 * @returns {number} Duration in seconds
	 */
	parseDuration(durationStr) {
		if (!durationStr) return 0;

		// Handle HH:MM:SS or MM:SS format
		const parts = durationStr.split(':').map(Number);

		if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		} else if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		} else if (parts.length === 1) {
			return parts[0];
		}

		return 0;
	}

	/**
	 * Start the playback simulation timer
	 */
	startPlaybackTimer() {
		this.stopPlaybackTimer();

		// Simulate playback progress every second
		this.playbackTimer = setInterval(() => {
			if (this.isPlaying && !this.isPaused) {
				this.position += 1;

				// Broadcast time update
				this.broadcast({
					type: 'media:time-update',
					position: this.position,
					duration: this.duration,
					episodeId: this.currentEpisode?.id
				});

				// Check for completion
				if (this.position >= this.duration) {
					this.handlePlaybackComplete();
				}
			}
		}, 1000);
	}

	/**
	 * Stop the playback simulation timer
	 */
	stopPlaybackTimer() {
		if (this.playbackTimer) {
			clearInterval(this.playbackTimer);
			this.playbackTimer = null;
		}
	}

	/**
	 * Handle playback completion
	 */
	async handlePlaybackComplete() {
		console.log('[media-mock] Playback complete');

		if (this.currentEpisode) {
			episodeService.markAsCompleted(this.currentEpisode.id);

			this.broadcast({
				type: 'media:episode-completed',
				episodeId: this.currentEpisode.id
			});

			this.emit('playback-complete', { episodeId: this.currentEpisode.id });
		}

		// Check if there's a next item in the queue
		if (this.queuePosition < this.queue.length - 1) {
			// Play next in queue
			console.log('[media-mock] Playing next in queue');
			this.queuePosition++;
			await this.playQueueItem(this.queuePosition);
		} else {
			// Queue finished
			this.stopPlaybackTimer();
			this.stopPositionSaveTimer();
			this.currentEpisode = null;
			this.isPlaying = false;
			this.isPaused = false;
			this.position = 0;
			this.duration = 0;
			this.queuePosition = -1;

			this.broadcastStatus();
			this.broadcast({
				type: 'media:queue-finished'
			});
		}
	}

	/**
	 * Play a specific item in the queue (internal helper)
	 * @param {number} index - Queue index to play
	 */
	async playQueueItem(index) {
		if (index < 0 || index >= this.queue.length) {
			return;
		}

		const queueItem = this.queue[index];
		const episode = queueItem.episode;

		console.log(`[media-mock] Playing queue item ${index}: ${episode.title}`);

		this.currentEpisode = episode;
		this.queuePosition = index;
		this.isPlaying = true;
		this.isPaused = false;

		// Parse duration
		this.duration = this.parseDuration(episode.duration) || 3600;

		// Resume from saved position if available
		if (episode.playback_position > 0 && !episode.playback_completed) {
			this.position = episode.playback_position;
		} else {
			this.position = 0;
		}

		// Start simulated playback
		this.startPlaybackTimer();
		this.startPositionSaveTimer();

		// Broadcast
		this.broadcastStatus();
		this.broadcast({
			type: 'media:track-changed',
			episode: {
				id: episode.id,
				title: episode.title,
				subscription_id: episode.subscription_id,
				duration: this.duration
			},
			queuePosition: this.queuePosition,
			queueLength: this.queue.length
		});
	}

	// ===== Queue Management Methods =====

	/**
	 * Add an episode to the end of the queue
	 * @param {number} episodeId - Episode ID to add
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addToQueue(episodeId) {
		const episode = this.validateEpisodeForQueue(episodeId);

		// Check if already in queue
		if (this.queue.some(item => item.episodeId === episodeId)) {
			throw new Error('Episode already in queue');
		}

		console.log(`[media-mock] Adding to queue: ${episode.title}`);

		// Add to queue
		this.queue.push({
			episodeId: episode.id,
			episode: episode,
			filePath: episode.file_path
		});

		// If nothing is playing, start playback
		const isIdle = this.queue.length === 1 && !this.isPlaying;
		if (isIdle) {
			this.queuePosition = 0;
			await this.playQueueItem(0);
		}

		this.broadcastQueue();

		return {
			success: true,
			queuePosition: this.queue.length - 1,
			queueLength: this.queue.length
		};
	}

	/**
	 * Add multiple episodes to the queue
	 * @param {number[]} episodeIds - Array of episode IDs to add
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addMultipleToQueue(episodeIds) {
		const added = [];
		const errors = [];

		for (const episodeId of episodeIds) {
			try {
				await this.addToQueue(episodeId);
				added.push(episodeId);
			} catch (err) {
				errors.push({ episodeId, error: err.message });
			}
		}

		return {
			success: true,
			added: added.length,
			errors: errors.length > 0 ? errors : undefined,
			queueLength: this.queue.length
		};
	}

	/**
	 * Play next episode in queue
	 * @returns {Promise<Object>} Result
	 */
	async playNext() {
		if (this.queue.length === 0) {
			throw new Error('Queue is empty');
		}

		if (this.queuePosition >= this.queue.length - 1) {
			throw new Error('Already at end of queue');
		}

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		this.stopPlaybackTimer();
		this.queuePosition++;
		await this.playQueueItem(this.queuePosition);

		return { success: true };
	}

	/**
	 * Play previous episode in queue
	 * @returns {Promise<Object>} Result
	 */
	async playPrevious() {
		if (this.queue.length === 0) {
			throw new Error('Queue is empty');
		}

		if (this.queuePosition <= 0) {
			throw new Error('Already at start of queue');
		}

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		this.stopPlaybackTimer();
		this.queuePosition--;
		await this.playQueueItem(this.queuePosition);

		return { success: true };
	}

	/**
	 * Jump to a specific position in the queue
	 * @param {number} index - Queue index to play
	 * @returns {Promise<Object>} Result
	 */
	async playQueueIndex(index) {
		if (index < 0 || index >= this.queue.length) {
			throw new Error('Invalid queue index');
		}

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		this.stopPlaybackTimer();
		await this.playQueueItem(index);

		return { success: true };
	}

	/**
	 * Remove an episode from the queue by index
	 * @param {number} index - Queue index to remove
	 * @returns {Promise<Object>} Result
	 */
	async removeFromQueue(index) {
		if (index < 0 || index >= this.queue.length) {
			throw new Error('Invalid queue index');
		}

		// Don't allow removing currently playing item
		if (index === this.queuePosition) {
			throw new Error('Cannot remove currently playing episode. Use skip or stop instead.');
		}

		const removed = this.queue[index];
		console.log(`[media-mock] Removing from queue: ${removed.episode.title}`);

		// Remove from queue
		this.queue.splice(index, 1);

		// Adjust queue position if needed
		if (index < this.queuePosition) {
			this.queuePosition--;
		}

		this.broadcastQueue();

		return {
			success: true,
			removed: removed.episodeId,
			queueLength: this.queue.length
		};
	}

	/**
	 * Clear the entire queue and stop playback
	 * @returns {Promise<Object>} Result
	 */
	async clearQueue() {
		console.log('[media-mock] Clearing queue');

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		this.stopPlaybackTimer();
		this.stopPositionSaveTimer();

		// Clear queue
		this.queue = [];
		this.queuePosition = -1;
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;

		this.broadcastStatus();
		this.broadcastQueue();

		return { success: true };
	}

	/**
	 * Move an item in the queue
	 * @param {number} fromIndex - Current index
	 * @param {number} toIndex - Target index
	 * @returns {Promise<Object>} Result
	 */
	async moveInQueue(fromIndex, toIndex) {
		if (fromIndex < 0 || fromIndex >= this.queue.length) {
			throw new Error('Invalid from index');
		}
		if (toIndex < 0 || toIndex >= this.queue.length) {
			throw new Error('Invalid to index');
		}
		if (fromIndex === toIndex) {
			return { success: true, queueLength: this.queue.length };
		}

		console.log(`[media-mock] Moving queue item from ${fromIndex} to ${toIndex}`);

		// Move in queue
		const [item] = this.queue.splice(fromIndex, 1);
		this.queue.splice(toIndex, 0, item);

		// Adjust queue position
		if (fromIndex === this.queuePosition) {
			this.queuePosition = toIndex;
		} else if (fromIndex < this.queuePosition && toIndex >= this.queuePosition) {
			this.queuePosition--;
		} else if (fromIndex > this.queuePosition && toIndex <= this.queuePosition) {
			this.queuePosition++;
		}

		this.broadcastQueue();

		return { success: true, queueLength: this.queue.length };
	}

	/**
	 * Shuffle the queue (excluding currently playing item)
	 * @returns {Promise<Object>} Result
	 */
	async shuffleQueue() {
		if (this.queue.length <= 1) {
			return { success: true, queueLength: this.queue.length, message: 'Queue too short to shuffle' };
		}

		console.log('[media-mock] Shuffling queue');

		const currentlyPlayingIndex = this.queuePosition;
		const hasCurrentlyPlaying = currentlyPlayingIndex >= 0 && currentlyPlayingIndex < this.queue.length;

		// Extract the currently playing item if any
		let currentItem = null;
		let itemsToShuffle = [...this.queue];

		if (hasCurrentlyPlaying) {
			currentItem = itemsToShuffle.splice(currentlyPlayingIndex, 1)[0];
		}

		// Fisher-Yates shuffle
		for (let i = itemsToShuffle.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[itemsToShuffle[i], itemsToShuffle[j]] = [itemsToShuffle[j], itemsToShuffle[i]];
		}

		// Rebuild the queue with current item at position 0 (if playing)
		if (hasCurrentlyPlaying && currentItem) {
			this.queue = [currentItem, ...itemsToShuffle];
			this.queuePosition = 0;
		} else {
			this.queue = itemsToShuffle;
		}

		this.broadcastQueue();

		return { success: true, queueLength: this.queue.length };
	}

	/**
	 * Sort the queue by a specified field and order
	 * @param {string} sortBy - Field to sort by: 'pub_date' or 'downloaded_at'
	 * @param {string} order - Sort order: 'asc' or 'desc'
	 * @returns {Promise<Object>} Result
	 */
	async sortQueue(sortBy = 'pub_date', order = 'asc') {
		if (this.queue.length <= 1) {
			return { success: true, queueLength: this.queue.length, message: 'Queue too short to sort' };
		}

		// Validate sortBy
		const validSortFields = ['pub_date', 'downloaded_at'];
		if (!validSortFields.includes(sortBy)) {
			throw new Error(`Invalid sort field. Must be one of: ${validSortFields.join(', ')}`);
		}

		// Validate order
		const validOrders = ['asc', 'desc'];
		if (!validOrders.includes(order.toLowerCase())) {
			throw new Error(`Invalid sort order. Must be one of: ${validOrders.join(', ')}`);
		}

		console.log(`[media-mock] Sorting queue by ${sortBy} ${order}`);

		const isAsc = order.toLowerCase() === 'asc';

		// Sort the queue
		this.queue.sort((a, b) => {
			let valueA, valueB;

			if (sortBy === 'pub_date') {
				valueA = a.episode.pub_date ? new Date(a.episode.pub_date).getTime() : 0;
				valueB = b.episode.pub_date ? new Date(b.episode.pub_date).getTime() : 0;
			} else if (sortBy === 'downloaded_at') {
				valueA = a.episode.downloaded_at || 0;
				valueB = b.episode.downloaded_at || 0;
			}

			if (isAsc) {
				return valueA - valueB;
			} else {
				return valueB - valueA;
			}
		});

		// Find the new position of the currently playing episode
		if (this.currentEpisode) {
			const newPosition = this.queue.findIndex(item => item.episodeId === this.currentEpisode.id);
			if (newPosition !== -1) {
				this.queuePosition = newPosition;
			}
		}

		this.broadcastQueue();

		return { success: true, queueLength: this.queue.length, sortBy, order };
	}

	/**
	 * Get the current queue
	 * @returns {Object} Queue information
	 */
	getQueue() {
		return {
			items: this.queue.map((item, index) => ({
				index,
				episodeId: item.episodeId,
				title: item.episode.title,
				subscription_id: item.episode.subscription_id,
				pub_date: item.episode.pub_date,
				duration: item.episode.duration,
				isPlaying: index === this.queuePosition
			})),
			currentIndex: this.queuePosition,
			length: this.queue.length
		};
	}

	/**
	 * Broadcast current queue to all clients
	 */
	broadcastQueue() {
		this.broadcast({
			type: 'media:queue-update',
			...this.getQueue()
		});
	}

	// ===== Playback Control Methods =====

	/**
	 * Pause or resume playback
	 * @returns {Promise<Object>} Result with new pause state
	 */
	async togglePause() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		this.isPaused = !this.isPaused;
		this.isPlaying = !this.isPaused;

		console.log(`[media-mock] ${this.isPaused ? 'Paused' : 'Resumed'} playback`);
		this.broadcastStatus();

		return { paused: this.isPaused };
	}

	/**
	 * Pause playback
	 */
	async pause() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		this.isPaused = true;
		this.isPlaying = false;
		console.log('[media-mock] Paused');
		this.broadcastStatus();
	}

	/**
	 * Resume playback
	 */
	async resume() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		this.isPaused = false;
		this.isPlaying = true;
		console.log('[media-mock] Resumed');
		this.broadcastStatus();
	}

	/**
	 * Stop playback completely (keeps queue intact)
	 */
	async stop() {
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		this.stopPlaybackTimer();
		this.stopPositionSaveTimer();
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;
		// Note: We keep the queue intact, just stop playback

		console.log('[media-mock] Stopped');
		this.broadcastStatus();
	}

	/**
	 * Seek to a position
	 * @param {number} position - Position in seconds (absolute)
	 */
	async seek(position) {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		this.position = Math.max(0, Math.min(position, this.duration));
		console.log(`[media-mock] Seeked to ${this.position}s`);

		this.broadcast({
			type: 'media:time-update',
			position: this.position,
			duration: this.duration,
			episodeId: this.currentEpisode?.id
		});
	}

	/**
	 * Seek relative to current position
	 * @param {number} offset - Offset in seconds (positive or negative)
	 */
	async seekRelative(offset) {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		this.position = Math.max(0, Math.min(this.position + offset, this.duration));
		console.log(`[media-mock] Seeked relative by ${offset}s to ${this.position}s`);

		this.broadcast({
			type: 'media:time-update',
			position: this.position,
			duration: this.duration,
			episodeId: this.currentEpisode?.id
		});
	}

	/**
	 * Set volume level
	 * @param {number} level - Volume level (0-100)
	 */
	async setVolume(level) {
		this.volume = Math.max(0, Math.min(100, level));
		console.log(`[media-mock] Volume set to ${this.volume}`);

		this.broadcast({
			type: 'media:volume-change',
			volume: this.volume
		});
	}

	/**
	 * Get current playback status
	 * @returns {Object} Status object
	 */
	getStatus() {
		return {
			isPlaying: this.isPlaying,
			isPaused: this.isPaused,
			position: this.position,
			duration: this.duration,
			volume: this.volume,
			currentEpisode: this.currentEpisode ? {
				id: this.currentEpisode.id,
				title: this.currentEpisode.title,
				subscription_id: this.currentEpisode.subscription_id
			} : null,
			queuePosition: this.queuePosition,
			queueLength: this.queue.length,
			mpvConnected: true, // Always "connected" in mock mode
			mockMode: true
		};
	}

	/**
	 * Broadcast current status to all clients
	 */
	broadcastStatus() {
		this.broadcast({
			type: 'media:status',
			...this.getStatus()
		});
	}

	// ===== Position Persistence =====

	/**
	 * Start the position save timer
	 */
	startPositionSaveTimer() {
		this.stopPositionSaveTimer();

		this.positionSaveTimer = setInterval(() => {
			this.saveCurrentPosition();
		}, MPV_POSITION_SAVE_INTERVAL);
	}

	/**
	 * Stop the position save timer
	 */
	stopPositionSaveTimer() {
		if (this.positionSaveTimer) {
			clearInterval(this.positionSaveTimer);
			this.positionSaveTimer = null;
		}
	}

	/**
	 * Save the current playback position to database
	 */
	async saveCurrentPosition() {
		if (!this.currentEpisode || this.position <= 0) {
			return;
		}

		try {
			// Check if we're near the end (mark as complete)
			if (this.duration > 0) {
				const progress = this.position / this.duration;
				if (progress >= MPV_COMPLETION_THRESHOLD) {
					episodeService.markAsCompleted(this.currentEpisode.id);
					console.log(`[media-mock] Episode ${this.currentEpisode.id} marked as complete`);
					return;
				}
			}

			// Save current position
			episodeService.updatePlaybackPosition(this.currentEpisode.id, this.position);
		} catch (err) {
			console.error('[media-mock] Failed to save position:', err.message);
		}
	}

	// ===== Cleanup =====

	/**
	 * Cleanup and shutdown the mock media player service
	 */
	async cleanup() {
		console.log('[media-mock] Cleaning up mock media player service...');

		await this.saveCurrentPosition();
		this.stopPlaybackTimer();
		this.stopPositionSaveTimer();

		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.queue = [];
		this.queuePosition = -1;

		console.log('[media-mock] Mock media player service cleaned up');
	}

	/**
	 * Check if the service is ready for playback
	 * @returns {boolean} True if ready (always true for mock)
	 */
	isReady() {
		return true;
	}

	/**
	 * Get health status
	 * @returns {Object} Health status
	 */
	getHealth() {
		return {
			status: 'ok',
			mpvRunning: true,
			socketConnected: true,
			mockMode: true
		};
	}
}

// Create singleton instance
const mediaPlayerServiceMock = new MediaPlayerServiceMock();

module.exports = mediaPlayerServiceMock;
