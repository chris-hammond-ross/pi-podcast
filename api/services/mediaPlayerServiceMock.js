const { EventEmitter } = require('events');
const {
	MPV_POSITION_SAVE_INTERVAL,
	MPV_COMPLETION_THRESHOLD
} = require('../config/constants');
const episodeService = require('./episodeService');

/**
 * Mock Media Player Service
 * Simulates MPV playback for development on non-Pi machines
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
	 * Play an episode by ID (simulated)
	 * @param {number} episodeId - Episode ID to play
	 * @returns {Promise<Object>} Playback result
	 */
	async playEpisode(episodeId) {
		const episode = episodeService.getEpisodeById(episodeId);

		if (!episode) {
			throw new Error('Episode not found');
		}

		if (!episode.file_path || !episode.downloaded_at) {
			throw new Error('Episode not downloaded');
		}

		console.log(`[media-mock] Simulating playback: ${episode.title}`);

		// Stop current playback if any
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
			this.stopPlaybackTimer();
		}

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

		// Broadcast status
		this.broadcastStatus();
		this.broadcast({
			type: 'media:track-changed',
			episode: {
				id: episode.id,
				title: episode.title,
				subscription_id: episode.subscription_id,
				duration: this.duration
			}
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
	handlePlaybackComplete() {
		console.log('[media-mock] Playback complete');

		if (this.currentEpisode) {
			episodeService.markAsCompleted(this.currentEpisode.id);

			this.broadcast({
				type: 'media:completed',
				episodeId: this.currentEpisode.id
			});

			this.emit('playback-complete', { episodeId: this.currentEpisode.id });
		}

		this.stopPlaybackTimer();
		this.stopPositionSaveTimer();
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;

		this.broadcastStatus();
	}

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
	 * Stop playback completely
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
