const express = require('express');
const router = express.Router();

// Import route modules
const bluetoothRoutes = require('./bluetooth');

// Mount routes
router.use('/bluetooth', bluetoothRoutes);

// Future routes will be added here:
// router.use('/media', mediaRoutes);
// router.use('/podcasts', podcastRoutes);
// router.use('/playlists', playlistRoutes);

module.exports = router;
