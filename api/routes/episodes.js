const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const episodeService = require('../services/episodeService');
const playlistService = require('../services/playlistService');
const { DOWNLOAD_DIR } = require('../config/constants');

/**
 * GET /api/episodes/downloaded
 * Get all downloaded episodes across all subscriptions
 */
router.get('/downloaded', (req, res) => {
	try {
		const { limit, offset, orderBy, order } = req.query;

		const options = {};
		if (limit) options.limit = parseInt(limit);
		if (offset) options.offset = parseInt(offset);
		if (orderBy) options.orderBy = orderBy;
		if (order) options.order = order;

		const episodes = episodeService.getAllDownloadedEpisodes(options);

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

		// Store subscription_id before clearing download info
		const subscriptionId = episode.subscription_id;

		// Try to delete the file
		try {
			if (fs.existsSync(episode.file_path)) {
				fs.unlinkSync(episode.file_path);
				console.log(`[episode] Deleted file: ${episode.file_path}`);
			}
		} catch (fileErr) {
			console.error(`[episode] Failed to delete file: ${fileErr.message}`);
			// Continue anyway to clear the database record
		}

		// Clear download info from database
		episodeService.clearDownload(parseInt(id));

		// Update auto playlist for this subscription
		try {
			playlistService.onEpisodeDeleted(parseInt(id), subscriptionId);
		} catch (playlistErr) {
			console.error(`[episode] Failed to update playlist: ${playlistErr.message}`);
		}

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
