const express = require('express');
const router = express.Router();

// Import route modules
const bluetoothRoutes = require('./bluetooth');
const podcastRoutes = require('./podcasts');
const subscriptionRoutes = require('./subscriptions');

// Mount routes
router.use('/bluetooth', bluetoothRoutes);
router.use('/podcasts', podcastRoutes);
router.use('/subscriptions', subscriptionRoutes);

// Future routes will be added here:
// router.use('/media', mediaRoutes);
// router.use('/playlists', playlistRoutes);

module.exports = router;
