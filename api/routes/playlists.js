const express = require('express');
const router = express.Router();
const playlistService = require('../services/playlistService');

/**
 * GET /api/playlists
 * Get all playlists (both auto and user)
 * Query params: type ('auto', 'user', or omit for all)
 */
router.get('/', (req, res) => {
	try {
		const { type } = req.query;

		let playlists;
		if (type === 'auto') {
			playlists = playlistService.getAllAutoPlaylists();
		} else if (type === 'user') {
			playlists = playlistService.getAllUserPlaylists();
		} else {
			// Return both
			const autoPlaylists = playlistService.getAllAutoPlaylists();
			const userPlaylists = playlistService.getAllUserPlaylists();
			playlists = { auto: autoPlaylists, user: userPlaylists };
		}

		res.json({
			success: true,
			playlists
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/playlists/auto
 * Get all auto-generated playlists
 */
router.get('/auto', (req, res) => {
	try {
		const playlists = playlistService.getAllAutoPlaylists();
		res.json({
			success: true,
			playlists
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/playlists/auto/subscription/:subscriptionId
 * Get auto playlist for a specific subscription
 */
router.get('/auto/subscription/:subscriptionId', (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const playlist = playlistService.getAutoPlaylistBySubscription(parseInt(subscriptionId));

		if (!playlist) {
			return res.status(404).json({
				success: false,
				error: 'Auto playlist not found for this subscription'
			});
		}

		res.json({
			success: true,
			playlist
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/playlists/auto/subscription/:subscriptionId/regenerate
 * Manually regenerate auto playlist for a subscription
 */
router.post('/auto/subscription/:subscriptionId/regenerate', (req, res) => {
	try {
		const { subscriptionId } = req.params;
		const result = playlistService.regenerateAutoPlaylist(parseInt(subscriptionId));

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
 * GET /api/playlists/user
 * Get all user-created playlists
 */
router.get('/user', (req, res) => {
	try {
		const playlists = playlistService.getAllUserPlaylists();
		res.json({
			success: true,
			playlists
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * POST /api/playlists/user
 * Create a new user playlist
 * Body: { name: string, description?: string }
 */
router.post('/user', (req, res) => {
	try {
		const { name, description } = req.body;

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return res.status(400).json({
				success: false,
				error: 'Playlist name is required'
			});
		}

		const playlist = playlistService.createUserPlaylist(name.trim(), description);

		res.status(201).json({
			success: true,
			playlist
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/playlists/:id
 * Get a playlist by ID
 */
router.get('/:id', (req, res) => {
	try {
		const { id } = req.params;
		const playlist = playlistService.getPlaylistById(parseInt(id));

		if (!playlist) {
			return res.status(404).json({
				success: false,
				error: 'Playlist not found'
			});
		}

		res.json({
			success: true,
			playlist
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * PATCH /api/playlists/:id
 * Update a user playlist
 * Body: { name?: string, description?: string }
 */
router.patch('/:id', (req, res) => {
	try {
		const { id } = req.params;
		const { name, description } = req.body;

		const playlist = playlistService.updateUserPlaylist(parseInt(id), { name, description });

		res.json({
			success: true,
			playlist
		});
	} catch (err) {
		if (err.message === 'User playlist not found') {
			return res.status(404).json({
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
 * DELETE /api/playlists/:id
 * Delete a user playlist
 */
router.delete('/:id', (req, res) => {
	try {
		const { id } = req.params;
		const success = playlistService.deleteUserPlaylist(parseInt(id));

		if (!success) {
			return res.status(404).json({
				success: false,
				error: 'User playlist not found'
			});
		}

		res.json({
			success: true,
			message: 'Playlist deleted successfully'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

/**
 * GET /api/playlists/:id/episodes
 * Get episodes in a user playlist
 */
router.get('/:id/episodes', (req, res) => {
	try {
		const { id } = req.params;
		const playlist = playlistService.getPlaylistById(parseInt(id));

		if (!playlist) {
			return res.status(404).json({
				success: false,
				error: 'Playlist not found'
			});
		}

		if (playlist.type !== 'user') {
			return res.status(400).json({
				success: false,
				error: 'Use /api/episodes/subscription/:id for auto playlist episodes'
			});
		}

		const episodes = playlistService.getUserPlaylistEpisodes(parseInt(id));

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
 * PUT /api/playlists/:id/episodes
 * Update all episodes in a user playlist (reorder and/or remove)
 * Body: { episodeIds: number[] }
 */
router.put('/:id/episodes', (req, res) => {
	try {
		const { id } = req.params;
		const { episodeIds } = req.body;

		if (!Array.isArray(episodeIds)) {
			return res.status(400).json({
				success: false,
				error: 'episodeIds must be an array'
			});
		}

		const result = playlistService.updateUserPlaylistEpisodes(parseInt(id), episodeIds);

		res.json({
			success: true,
			...result
		});
	} catch (err) {
		if (err.message === 'User playlist not found') {
			return res.status(404).json({
				success: false,
				error: err.message
			});
		}
		if (err.message.includes('not found') || err.message.includes('must be downloaded')) {
			return res.status(400).json({
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
 * POST /api/playlists/:id/episodes
 * Add an episode to a user playlist
 * Body: { episodeId: number }
 */
router.post('/:id/episodes', (req, res) => {
	try {
		const { id } = req.params;
		const { episodeId } = req.body;

		if (!episodeId) {
			return res.status(400).json({
				success: false,
				error: 'episodeId is required'
			});
		}

		const result = playlistService.addEpisodeToUserPlaylist(parseInt(id), parseInt(episodeId));

		res.status(201).json({
			success: true,
			...result
		});
	} catch (err) {
		if (err.message === 'User playlist not found' || err.message === 'Episode not found') {
			return res.status(404).json({
				success: false,
				error: err.message
			});
		}
		if (err.message === 'Episode already in playlist' || err.message === 'Episode must be downloaded to add to playlist') {
			return res.status(400).json({
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
 * DELETE /api/playlists/:id/episodes/:episodeId
 * Remove an episode from a user playlist
 */
router.delete('/:id/episodes/:episodeId', (req, res) => {
	try {
		const { id, episodeId } = req.params;
		const success = playlistService.removeEpisodeFromUserPlaylist(parseInt(id), parseInt(episodeId));

		if (!success) {
			return res.status(404).json({
				success: false,
				error: 'Episode not found in playlist'
			});
		}

		res.json({
			success: true,
			message: 'Episode removed from playlist'
		});
	} catch (err) {
		res.status(500).json({
			success: false,
			error: err.message
		});
	}
});

module.exports = router;
