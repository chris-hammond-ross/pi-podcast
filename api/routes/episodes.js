const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const episodeService = require('../services/episodeService');
const playlistService = require('../services/playlistService');
const { DOWNLOAD_DIR } = require('../config/constants');

/**
 * GET /api/episodes/downloaded/mock
 * Generate mock downloaded episodes for testing pagination
 * Query params:
 *   - totalEpisodes: Total number of mock episodes to simulate (default: 2000)
 *   - limit: Number of episodes per page
 *   - offset: Starting offset
 *   - delay: Artificial delay in ms to simulate network latency (default: 0)
 *   - filter: Filter keyword to search in title/description
 *   - subscriptionId: Filter by subscription ID
 */
router.get('/downloaded/mock', async (req, res) => {
	try {
		const totalEpisodes = parseInt(req.query.totalEpisodes) || 2000;
		const limit = parseInt(req.query.limit) || 100;
		const offset = parseInt(req.query.offset) || 0;
		const delay = parseInt(req.query.delay) || 0;
		const filter = req.query.filter || null;
		const subscriptionId = req.query.subscriptionId ? parseInt(req.query.subscriptionId) : null;

		// Add artificial delay if specified
		if (delay > 0) {
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		// Generate mock episodes for the requested page
		const allEpisodes = [];
		
		const podcastNames = [
			'The Daily Tech Show',
			'History Uncovered',
			'Science Weekly',
			'Comedy Hour',
			'True Crime Stories',
			'Business Insights',
			'Health & Wellness',
			'Sports Talk Radio'
		];

		// Generate all episodes first (for filtering)
		for (let i = 0; i < totalEpisodes; i++) {
			// Create a date going backwards from today (newer episodes have lower indices)
			const pubDate = new Date();
			pubDate.setDate(pubDate.getDate() - i);
			
			const podcastIndex = i % podcastNames.length;
			const episodeNumber = totalEpisodes - i;

			allEpisodes.push({
				id: 10000 + i, // Use high IDs to avoid conflicts with real data
				subscription_id: podcastIndex + 1,
				guid: `mock-episode-${i}`,
				title: `Episode ${episodeNumber}: Mock Episode Title That Could Be Quite Long`,
				description: `This is a mock episode description for testing purposes. Episode ${episodeNumber} of the series.`,
				pub_date: pubDate.toISOString(),
				pub_date_unix: Math.floor(pubDate.getTime() / 1000),
				duration: String(Math.floor(Math.random() * 3600) + 600), // 10-70 minutes
				audio_url: `https://example.com/mock-episode-${i}.mp3`,
				audio_type: 'audio/mpeg',
				audio_length: Math.floor(Math.random() * 50000000) + 10000000,
				image_url: null,
				file_path: `/mock/path/episode-${i}.mp3`,
				file_size: Math.floor(Math.random() * 50000000) + 10000000,
				downloaded_at: Math.floor(Date.now() / 1000) - (i * 3600),
				created_at: Math.floor(pubDate.getTime() / 1000),
				playback_position: 0,
				playback_completed: 0,
				last_played_at: null,
				subscription_name: podcastNames[podcastIndex],
				subscription_artwork: null
			});
		}

		// Apply subscription filter if provided
		let filteredEpisodes = allEpisodes;
		if (subscriptionId) {
			filteredEpisodes = filteredEpisodes.filter(ep => ep.subscription_id === subscriptionId);
		}

		// Apply text filter if provided
		if (filter && filter.trim()) {
			const searchTerm = filter.trim().toLowerCase();
			filteredEpisodes = filteredEpisodes.filter(ep => 
				ep.title.toLowerCase().includes(searchTerm) || 
				ep.description.toLowerCase().includes(searchTerm)
			);
		}

		// Apply pagination to filtered results
		const total = filteredEpisodes.length;
		const episodes = filteredEpisodes.slice(offset, offset + limit);

		console.log(`[episodes] Mock endpoint: returning ${episodes.length} episodes (offset: ${offset}, total: ${total}, filter: ${filter || 'none'}, subscriptionId: ${subscriptionId || 'none'})`);

		res.json({
			success: true,
			episodes,
			count: episodes.length,
			total
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/episodes/downloaded
 * Get all downloaded episodes across all subscriptions
 * Query params:
 *   - limit: Max episodes to return
 *   - offset: Offset for pagination
 *   - orderBy: Column to order by (default: pub_date)
 *   - order: ASC or DESC (default: DESC)
 *   - filter: Filter keyword to search in title/description
 *   - subscriptionId: Filter by subscription ID
 */
router.get('/downloaded', (req, res) => {
	try {
		const { limit, offset, orderBy, order, filter, subscriptionId } = req.query;

		const options = {};
		if (limit) options.limit = parseInt(limit);
		if (offset) options.offset = parseInt(offset);
		if (orderBy) options.orderBy = orderBy;
		if (order) options.order = order;
		if (filter) options.filter = filter;
		if (subscriptionId) options.subscriptionId = parseInt(subscriptionId);

		const episodes = episodeService.getAllDownloadedEpisodes(options);
		const total = episodeService.getTotalDownloadedCount(options);

		res.json({
			success: true,
			episodes,
			count: episodes.length,
			total
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
