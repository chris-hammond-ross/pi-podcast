const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const episodeService = require('../services/episodeService');
const { DOWNLOADS_DIR } = require('../config/constants');

/**
 * GET /api/episodes/subscription/:subscriptionId
 * Get all episodes for a subscription
 */
router.get('/subscription/:subscriptionId', (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const { downloaded, limit, offset, orderBy, order } = req.query;

		const options = {};
		
		if (downloaded === 'true') {
			options.downloadedOnly = true;
		} else if (downloaded === 'false') {
			options.notDownloadedOnly = true;
		}
		
		if (limit) options.limit = parseInt(limit);
		if (offset) options.offset = parseInt(offset);
		if (orderBy) options.orderBy = orderBy;
		if (order) options.order = order;

		const episodes = episodeService.getEpisodesBySubscription(
			parseInt(subscriptionId),
			options
		);

		res.json({
			success: true,
			episodes,
			count: episodes.length
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/episodes/subscription/:subscriptionId/counts
 * Get episode counts for a subscription
 */
router.get('/subscription/:subscriptionId/counts', (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const counts = episodeService.getEpisodeCounts(parseInt(subscriptionId));

		res.json({
			success: true,
			counts
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/episodes/subscription/:subscriptionId/sync
 * Sync episodes from RSS feed
 */
router.post('/subscription/:subscriptionId/sync', async (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const result = await episodeService.syncEpisodesFromFeed(parseInt(subscriptionId));

		res.json({
			success: true,
			...result
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/episodes/:id
 * Get episode by ID
 */
router.get('/:id', (req, res) => {
	try {
		const { id } = req.params;
		const episode = episodeService.getEpisodeById(parseInt(id));

		if (!episode) {
			return res.status(404).json({
				success: false,
				error: 'Episode not found'
			});
		}

		res.json({
			success: true,
			episode
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * DELETE /api/episodes/:id/download
 * Delete the downloaded file for an episode and clear download info
 */
router.delete('/:id/download', (req, res) => {
	try {
		const { id } = req.params;
		const episode = episodeService.getEpisodeById(parseInt(id));

		if (!episode) {
			return res.status(404).json({
				success: false,
				error: 'Episode not found'
			});
		}

		if (!episode.downloaded_at || !episode.file_path) {
			return res.status(400).json({
				success: false,
				error: 'Episode is not downloaded'
			});
		}

		// Try to delete the file
		const filePath = path.join(DOWNLOADS_DIR, episode.file_path);
		try {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
				console.log(`[episode] Deleted file: ${filePath}`);
			}
		} catch (fileErr) {
			console.error(`[episode] Failed to delete file: ${fileErr.message}`);
			// Continue anyway to clear the database record
		}

		// Clear download info from database
		episodeService.clearDownload(parseInt(id));

		res.json({
			success: true,
			message: 'Download deleted successfully'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

module.exports = router;
