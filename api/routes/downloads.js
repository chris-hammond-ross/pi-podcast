const express = require('express');
const router = express.Router();
const downloadQueueService = require('../services/downloadQueueService');
const episodeService = require('../services/episodeService');
const downloadProcessor = require('../services/downloadProcessor');
const subscriptionService = require('../services/subscriptionService');

/**
 * GET /api/downloads/status
 * Get processor and queue status
 */
router.get('/status', (req, res) => {
	try {
		const status = downloadProcessor.getStatus();
		res.json({
			success: true,
			...status
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/start
 * Start the download processor
 */
router.post('/start', async (req, res) => {
	try {
		await downloadProcessor.start();
		res.json({
			success: true,
			message: 'Download processor started'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/stop
 * Stop the download processor
 */
router.post('/stop', async (req, res) => {
	try {
		await downloadProcessor.stop();
		res.json({
			success: true,
			message: 'Download processor stopped'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/pause
 * Pause the download processor
 */
router.post('/pause', (req, res) => {
	try {
		downloadProcessor.pause();
		res.json({
			success: true,
			message: 'Download processor paused'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/resume
 * Resume the download processor
 */
router.post('/resume', (req, res) => {
	try {
		downloadProcessor.resume();
		res.json({
			success: true,
			message: 'Download processor resumed'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/cancel-current
 * Cancel the currently downloading item
 */
router.post('/cancel-current', (req, res) => {
	try {
		downloadProcessor.cancelCurrent();
		res.json({
			success: true,
			message: 'Current download cancelled'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/downloads/queue
 * Get current queue status
 */
router.get('/queue', (req, res) => {
	try {
		const status = downloadQueueService.getQueueStatus();
		res.json({
			success: true,
			...status
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/downloads/queue/items
 * Get queue items with optional status filter
 */
router.get('/queue/items', (req, res) => {
	try {
		const { status, limit } = req.query;
		const items = downloadQueueService.getQueueItems(
			status || null,
			limit ? parseInt(limit) : 100
		);
		res.json({
			success: true,
			items,
			count: items.length
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/queue
 * Add episode(s) to download queue
 * Body: { episodeId: number } or { episodeIds: number[] }
 */
router.post('/queue', (req, res) => {
	try {
		const { episodeId, episodeIds, priority = 0 } = req.body;

		if (episodeIds && Array.isArray(episodeIds)) {
			const result = downloadQueueService.addBatchToQueue(episodeIds, priority);
			return res.json({
				success: true,
				...result
			});
		}

		if (episodeId) {
			const item = downloadQueueService.addToQueue(episodeId, priority);
			return res.json({
				success: true,
				item
			});
		}

		res.status(400).json({
			success: false,
			error: 'episodeId or episodeIds required'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/queue/subscription/:subscriptionId
 * Queue all episodes for a subscription
 */
router.post('/queue/subscription/:subscriptionId', (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const { downloadedOnly = false, priority = 0 } = req.body;

		const episodes = episodeService.getEpisodesBySubscription(
			parseInt(subscriptionId),
			{ notDownloadedOnly: !downloadedOnly }
		);

		if (episodes.length === 0) {
			return res.json({
				success: true,
				added: 0,
				skipped: 0,
				total: 0,
				message: 'No episodes to queue'
			});
		}

		const episodeIds = episodes.map(e => e.id);
		const result = downloadQueueService.addBatchToQueue(episodeIds, priority);

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
 * POST /api/downloads/sync/subscription/:subscriptionId
 * Sync episodes from feed and queue any not downloaded
 */
router.post('/sync/subscription/:subscriptionId', async (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const { priority = 0 } = req.body;

		// First sync episodes from feed
		const syncResult = await episodeService.syncEpisodesFromFeed(parseInt(subscriptionId));

		// Then queue any not downloaded
		const episodes = episodeService.getNotDownloaded(parseInt(subscriptionId));
		
		let queueResult = { added: 0, skipped: 0, total: 0 };
		if (episodes.length > 0) {
			const episodeIds = episodes.map(e => e.id);
			queueResult = downloadQueueService.addBatchToQueue(episodeIds, priority);
		}

		res.json({
			success: true,
			sync: syncResult,
			queue: queueResult
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/sync-auto
 * Sync and queue episodes for all subscriptions with auto-download enabled
 * This endpoint is designed to be called by a cron job
 */
router.post('/sync-auto', async (req, res) => {
	try {
		const subscriptions = subscriptionService.getAutoDownloadSubscriptions();
		
		if (subscriptions.length === 0) {
			return res.json({
				success: true,
				message: 'No subscriptions with auto-download enabled',
				results: []
			});
		}

		const results = [];
		
		for (const subscription of subscriptions) {
			try {
				// Sync episodes from feed
				const syncResult = await episodeService.syncEpisodesFromFeed(subscription.id);
				
				// Get episodes not downloaded, limited by auto_download_limit
				const episodes = episodeService.getEpisodesBySubscription(subscription.id, {
					notDownloadedOnly: true,
					limit: subscription.auto_download_limit || 5,
					orderBy: 'pub_date',
					order: 'DESC'
				});
				
				let queueResult = { added: 0, skipped: 0, total: 0 };
				if (episodes.length > 0) {
					const episodeIds = episodes.map(e => e.id);
					queueResult = downloadQueueService.addBatchToQueue(episodeIds);
				}
				
				results.push({
					subscriptionId: subscription.id,
					subscriptionName: subscription.name,
					sync: syncResult,
					queue: queueResult
				});
			} catch (err) {
				results.push({
					subscriptionId: subscription.id,
					subscriptionName: subscription.name,
					error: err.message
				});
			}
		}

		const totalQueued = results.reduce((sum, r) => sum + (r.queue?.added || 0), 0);
		
		console.log(`[auto-download] Processed ${subscriptions.length} subscriptions, queued ${totalQueued} episodes`);

		res.json({
			success: true,
			message: `Processed ${subscriptions.length} subscriptions, queued ${totalQueued} episodes`,
			results
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * DELETE /api/downloads/queue/:queueId
 * Remove item from queue
 */
router.delete('/queue/:queueId', (req, res) => {
	try {
		const { queueId } = req.params;
		const success = downloadQueueService.removeFromQueue(parseInt(queueId));

		if (!success) {
			return res.status(404).json({
				success: false,
				error: 'Queue item not found'
			});
		}

		res.json({ success: true });
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/queue/clear
 * Clear completed/failed/cancelled items from queue
 */
router.post('/queue/clear', (req, res) => {
	try {
		const cleared = downloadQueueService.clearFinished();
		res.json({
			success: true,
			cleared
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/queue/cancel-all
 * Cancel all pending downloads
 */
router.post('/queue/cancel-all', (req, res) => {
	try {
		const cancelled = downloadQueueService.cancelAllPending();
		res.json({
			success: true,
			cancelled
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/downloads/queue/:queueId/retry
 * Retry a failed download
 */
router.post('/queue/:queueId/retry', (req, res) => {
	try {
		const { queueId } = req.params;
		const item = downloadQueueService.getQueueItem(parseInt(queueId));

		if (!item) {
			return res.status(404).json({
				success: false,
				error: 'Queue item not found'
			});
		}

		if (item.status !== 'failed' && item.status !== 'cancelled') {
			return res.status(400).json({
				success: false,
				error: 'Can only retry failed or cancelled items'
			});
		}

		downloadQueueService.resetToPending(parseInt(queueId));

		res.json({
			success: true,
			message: 'Item queued for retry'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

module.exports = router;
