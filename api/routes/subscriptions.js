const express = require('express');
const router = express.Router();
const subscriptionService = require('../services/subscriptionService');
const playlistService = require('../services/playlistService');

/**
 * GET /api/subscriptions
 * Get all subscriptions
 */
router.get('/', (req, res) => {
	try {
		const subscriptions = subscriptionService.getAllSubscriptions();
		res.json({
			success: true,
			subscriptions
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/subscriptions/check
 * Check if a podcast is subscribed by feed URL
 * Query params: feedUrl (required)
 */
router.get('/check', (req, res) => {
	try {
		const { feedUrl } = req.query;

		if (!feedUrl) {
			return res.status(400).json({
				success: false,
				error: 'Feed URL is required'
			});
		}

		const isSubscribed = subscriptionService.isSubscribed(feedUrl);
		res.json({
			success: true,
			isSubscribed
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/subscriptions/feed
 * Fetch RSS feed data
 * Query params: feedUrl (required)
 */
router.get('/feed', async (req, res) => {
	try {
		const { feedUrl } = req.query;

		if (!feedUrl) {
			return res.status(400).json({
				success: false,
				error: 'Feed URL is required'
			});
		}

		const feedData = await subscriptionService.fetchFeed(feedUrl);
		res.json({
			success: true,
			feed: feedData
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/subscriptions
 * Subscribe to a podcast
 * Body: Podcast object with feedUrl, name, and optional fields:
 *   artist, description, artworkUrl, artworkUrl100, artworkUrl600,
 *   genres, primaryGenre, trackCount, releaseDate, country
 */
router.post('/', (req, res) => {
	try {
		const { 
			feedUrl, 
			name,
			artist,
			description, 
			artworkUrl,
			artworkUrl100,
			artworkUrl600,
			genres,
			primaryGenre,
			trackCount,
			releaseDate,
			country
		} = req.body;

		if (!feedUrl || !name) {
			return res.status(400).json({
				success: false,
				error: 'Feed URL and name are required'
			});
		}

		const subscription = subscriptionService.subscribe({
			feedUrl,
			name,
			artist,
			description,
			artworkUrl,
			artworkUrl100,
			artworkUrl600,
			genres,
			primaryGenre,
			trackCount,
			releaseDate,
			country
		});

		// Create auto playlist for this subscription
		try {
			playlistService.onSubscriptionCreated(subscription.id);
		} catch (playlistErr) {
			console.error(`[subscription] Failed to create auto playlist: ${playlistErr.message}`);
		}

		res.status(201).json({
			success: true,
			subscription
		});
	} catch (err) {
		// Handle duplicate subscription
		if (err.message === 'Already subscribed to this podcast') {
			return res.status(409).json({
				success: false,
				error: err.message
			});
		}

		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * DELETE /api/subscriptions
 * Unsubscribe from a podcast
 * Query params: feedUrl (required)
 */
router.delete('/', (req, res) => {
	try {
		const { feedUrl } = req.query;

		if (!feedUrl) {
			return res.status(400).json({
				success: false,
				error: 'Feed URL is required'
			});
		}

		// Get subscription ID before deleting (for playlist cleanup)
		const subscription = subscriptionService.getSubscriptionByFeedUrl(feedUrl);
		const subscriptionId = subscription?.id;

		const success = subscriptionService.unsubscribe(feedUrl);

		if (!success) {
			return res.status(404).json({
				success: false,
				error: 'Subscription not found'
			});
		}

		// Delete auto playlist for this subscription
		if (subscriptionId) {
			try {
				playlistService.onSubscriptionDeleted(subscriptionId);
			} catch (playlistErr) {
				console.error(`[subscription] Failed to delete auto playlist: ${playlistErr.message}`);
			}
		}

		res.json({
			success: true,
			message: 'Unsubscribed successfully'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/subscriptions/:id
 * Get a subscription by ID
 */
router.get('/:id', (req, res) => {
	try {
		const { id } = req.params;
		const subscription = subscriptionService.getSubscriptionById(parseInt(id));

		if (!subscription) {
			return res.status(404).json({
				success: false,
				error: 'Subscription not found'
			});
		}

		res.json({
			success: true,
			subscription
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * PATCH /api/subscriptions/:id/auto-download
 * Update auto-download settings for a subscription
 * Body: { auto_download: 0|1, auto_download_limit?: number }
 */
router.patch('/:id/auto-download', (req, res) => {
	try {
		const { id } = req.params;
		const { auto_download, auto_download_limit } = req.body;

		if (auto_download === undefined) {
			return res.status(400).json({
				success: false,
				error: 'auto_download is required'
			});
		}

		const subscription = subscriptionService.updateAutoDownload(
			parseInt(id),
			!!auto_download,
			auto_download_limit
		);

		if (!subscription) {
			return res.status(404).json({
				success: false,
				error: 'Subscription not found'
			});
		}

		res.json({
			success: true,
			subscription
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

module.exports = router;
