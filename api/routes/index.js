const express = require('express');
const router = express.Router();

// Import route modules
const bluetoothRoutes = require('./bluetooth');
const podcastRoutes = require('./podcasts');

// Mount routes
router.use('/bluetooth', bluetoothRoutes);
router.use('/podcasts', podcastRoutes);

// Future routes will be added here:
// router.use('/media', mediaRoutes);
// router.use('/playlists', playlistRoutes);

module.exports = router;
