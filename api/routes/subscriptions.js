const express = require('express');
const router = express.Router();
const subscriptionService = require('../services/subscriptionService');

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
 * Body: { feedUrl, title, description?, imageUrl? }
 */
router.post('/', (req, res) => {
	try {
		const { feedUrl, title, description, imageUrl } = req.body;

		if (!feedUrl || !title) {
			return res.status(400).json({
				success: false,
				error: 'Feed URL and title are required'
			});
		}

		const subscription = subscriptionService.subscribe({
			feedUrl,
			title,
			description,
			imageUrl
		});

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

		const success = subscriptionService.unsubscribe(feedUrl);

		if (!success) {
			return res.status(404).json({
				success: false,
				error: 'Subscription not found'
			});
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

module.exports = router;
