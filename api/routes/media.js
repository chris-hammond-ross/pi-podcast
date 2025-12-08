const express = require('express');
const router = express.Router();
const { mediaPlayerService, episodeService } = require('../services');

/**
 * GET /api/media/status
 * Get current playback status
 */
router.get('/status', (req, res) => {
	try {
		const status = mediaPlayerService.getStatus();
		res.json(status);
	} catch (error) {
		console.error('[media-route] Error getting status:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/play/:episodeId
 * Start playing an episode (replaces queue with single episode)
 */
router.post('/play/:episodeId', async (req, res) => {
	try {
		const episodeId = parseInt(req.params.episodeId, 10);

		if (isNaN(episodeId)) {
			return res.status(400).json({ error: 'Invalid episode ID' });
		}

		const result = await mediaPlayerService.playEpisode(episodeId);
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error playing episode:', error);

		if (error.message === 'Episode not found') {
			return res.status(404).json({ error: error.message });
		}

		if (error.message === 'Episode not downloaded') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/pause
 * Toggle pause/resume playback
 */
router.post('/pause', async (req, res) => {
	try {
		const result = await mediaPlayerService.togglePause();
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error toggling pause:', error);

		if (error.message === 'Nothing is playing') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/resume
 * Resume playback
 */
router.post('/resume', async (req, res) => {
	try {
		await mediaPlayerService.resume();
		res.json({ success: true, paused: false });
	} catch (error) {
		console.error('[media-route] Error resuming:', error);

		if (error.message === 'Nothing is playing') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/stop
 * Stop playback (keeps queue intact)
 */
router.post('/stop', async (req, res) => {
	try {
		await mediaPlayerService.stop();
		res.json({ success: true });
	} catch (error) {
		console.error('[media-route] Error stopping:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/seek
 * Seek to a specific position
 * Body: { position: number } (in seconds)
 */
router.post('/seek', async (req, res) => {
	try {
		const { position } = req.body;

		if (typeof position !== 'number' || position < 0) {
			return res.status(400).json({ error: 'Invalid position value' });
		}

		await mediaPlayerService.seek(position);
		res.json({ success: true, position });
	} catch (error) {
		console.error('[media-route] Error seeking:', error);

		if (error.message === 'Nothing is playing') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/seek-relative
 * Seek relative to current position
 * Body: { offset: number } (in seconds, positive or negative)
 */
router.post('/seek-relative', async (req, res) => {
	try {
		const { offset } = req.body;

		if (typeof offset !== 'number') {
			return res.status(400).json({ error: 'Invalid offset value' });
		}

		await mediaPlayerService.seekRelative(offset);
		const status = mediaPlayerService.getStatus();
		res.json({ success: true, position: status.position });
	} catch (error) {
		console.error('[media-route] Error seeking relative:', error);

		if (error.message === 'Nothing is playing') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * PUT /api/media/volume
 * Set volume level
 * Body: { volume: number } (0-100)
 */
router.put('/volume', async (req, res) => {
	try {
		const { volume } = req.body;

		if (typeof volume !== 'number' || volume < 0 || volume > 100) {
			return res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
		}

		await mediaPlayerService.setVolume(volume);
		res.json({ success: true, volume });
	} catch (error) {
		console.error('[media-route] Error setting volume:', error);
		res.status(500).json({ error: error.message });
	}
});

// ===== Queue Management Routes =====

/**
 * GET /api/media/queue
 * Get current queue
 */
router.get('/queue', (req, res) => {
	try {
		const queue = mediaPlayerService.getQueue();
		res.json(queue);
	} catch (error) {
		console.error('[media-route] Error getting queue:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/queue
 * Add episode(s) to queue
 * Body: { episodeId: number } or { episodeIds: number[] }
 */
router.post('/queue', async (req, res) => {
	try {
		const { episodeId, episodeIds } = req.body;

		if (episodeIds && Array.isArray(episodeIds)) {
			// Add multiple episodes
			const result = await mediaPlayerService.addMultipleToQueue(episodeIds);
			res.json(result);
		} else if (typeof episodeId === 'number') {
			// Add single episode
			const result = await mediaPlayerService.addToQueue(episodeId);
			res.json(result);
		} else {
			return res.status(400).json({ error: 'Invalid request. Provide episodeId or episodeIds.' });
		}
	} catch (error) {
		console.error('[media-route] Error adding to queue:', error);

		if (error.message === 'Episode not found') {
			return res.status(404).json({ error: error.message });
		}

		if (error.message === 'Episode not downloaded' || error.message === 'Episode already in queue') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * DELETE /api/media/queue
 * Clear the entire queue
 */
router.delete('/queue', async (req, res) => {
	try {
		const result = await mediaPlayerService.clearQueue();
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error clearing queue:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * DELETE /api/media/queue/:index
 * Remove item from queue by index
 */
router.delete('/queue/:index', async (req, res) => {
	try {
		const index = parseInt(req.params.index, 10);

		if (isNaN(index)) {
			return res.status(400).json({ error: 'Invalid index' });
		}

		const result = await mediaPlayerService.removeFromQueue(index);
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error removing from queue:', error);

		if (error.message === 'Invalid queue index') {
			return res.status(400).json({ error: error.message });
		}

		if (error.message.includes('Cannot remove currently playing')) {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/queue/move
 * Move item in queue
 * Body: { from: number, to: number }
 */
router.post('/queue/move', async (req, res) => {
	try {
		const { from, to } = req.body;

		if (typeof from !== 'number' || typeof to !== 'number') {
			return res.status(400).json({ error: 'Invalid from or to index' });
		}

		const result = await mediaPlayerService.moveInQueue(from, to);
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error moving in queue:', error);

		if (error.message.includes('Invalid')) {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/queue/shuffle
 * Shuffle the queue (keeps currently playing item at position 0)
 */
router.post('/queue/shuffle', async (req, res) => {
	try {
		const result = await mediaPlayerService.shuffleQueue();
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error shuffling queue:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/queue/sort
 * Sort the queue by specified field and order
 * Body: { sortBy: 'pub_date' | 'downloaded_at', order: 'asc' | 'desc' }
 */
router.post('/queue/sort', async (req, res) => {
	try {
		const { sortBy = 'pub_date', order = 'asc' } = req.body;

		const result = await mediaPlayerService.sortQueue(sortBy, order);
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error sorting queue:', error);

		if (error.message.includes('Invalid')) {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/queue/play/:index
 * Jump to specific position in queue
 */
router.post('/queue/play/:index', async (req, res) => {
	try {
		const index = parseInt(req.params.index, 10);

		if (isNaN(index)) {
			return res.status(400).json({ error: 'Invalid index' });
		}

		const result = await mediaPlayerService.playQueueIndex(index);
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error playing queue index:', error);

		if (error.message === 'Invalid queue index') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/next
 * Play next episode in queue
 */
router.post('/next', async (req, res) => {
	try {
		const result = await mediaPlayerService.playNext();
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error playing next:', error);

		if (error.message === 'Queue is empty' || error.message === 'Already at end of queue') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/previous
 * Play previous episode in queue
 */
router.post('/previous', async (req, res) => {
	try {
		const result = await mediaPlayerService.playPrevious();
		res.json(result);
	} catch (error) {
		console.error('[media-route] Error playing previous:', error);

		if (error.message === 'Queue is empty' || error.message === 'Already at start of queue') {
			return res.status(400).json({ error: error.message });
		}

		res.status(500).json({ error: error.message });
	}
});

// ===== Episode Progress Routes =====

/**
 * GET /api/media/recently-played
 * Get recently played episodes
 */
router.get('/recently-played', (req, res) => {
	try {
		const limit = parseInt(req.query.limit, 10) || 10;
		const episodes = episodeService.getRecentlyPlayed(limit);
		res.json(episodes);
	} catch (error) {
		console.error('[media-route] Error getting recently played:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * GET /api/media/in-progress
 * Get episodes that are in progress (started but not completed)
 */
router.get('/in-progress', (req, res) => {
	try {
		const limit = parseInt(req.query.limit, 10) || 10;
		const episodes = episodeService.getInProgress(limit);
		res.json(episodes);
	} catch (error) {
		console.error('[media-route] Error getting in-progress:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/episodes/:episodeId/reset-progress
 * Reset playback progress for an episode
 */
router.post('/episodes/:episodeId/reset-progress', (req, res) => {
	try {
		const episodeId = parseInt(req.params.episodeId, 10);

		if (isNaN(episodeId)) {
			return res.status(400).json({ error: 'Invalid episode ID' });
		}

		const episode = episodeService.getEpisodeById(episodeId);
		if (!episode) {
			return res.status(404).json({ error: 'Episode not found' });
		}

		episodeService.resetPlaybackState(episodeId);
		res.json({ success: true });
	} catch (error) {
		console.error('[media-route] Error resetting progress:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/media/episodes/:episodeId/mark-complete
 * Mark an episode as completed
 */
router.post('/episodes/:episodeId/mark-complete', (req, res) => {
	try {
		const episodeId = parseInt(req.params.episodeId, 10);

		if (isNaN(episodeId)) {
			return res.status(400).json({ error: 'Invalid episode ID' });
		}

		const episode = episodeService.getEpisodeById(episodeId);
		if (!episode) {
			return res.status(404).json({ error: 'Episode not found' });
		}

		episodeService.markAsCompleted(episodeId);
		res.json({ success: true });
	} catch (error) {
		console.error('[media-route] Error marking complete:', error);
		res.status(500).json({ error: error.message });
	}
});

module.exports = router;
