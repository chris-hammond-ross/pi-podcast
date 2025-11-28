const express = require('express');
const router = express.Router();
const podcastService = require('../services/podcastService');

/**
 * GET /api/podcasts/search
 * Search for podcasts using iTunes API
 * Query params: term (required), limit (optional, default: 20)
 */
router.get('/search', async (req, res) => {
	try {
		const { term, limit } = req.query;

		if (!term) {
			return res.status(400).json({
				success: false,
				error: 'Search term is required'
			});
		}

		const results = await podcastService.searchPodcasts(term, limit ? parseInt(limit) : 20);

		res.json({
			success: true,
			...results
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/podcasts/:id
 * Get podcast details by iTunes ID
 */
router.get('/:id', async (req, res) => {
	try {
		const { id } = req.params;

		if (!id) {
			return res.status(400).json({
				success: false,
				error: 'Podcast ID is required'
			});
		}

		const podcast = await podcastService.getPodcastById(parseInt(id));

		res.json({
			success: true,
			podcast
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

module.exports = router;
