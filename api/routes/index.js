const express = require('express');
const router = express.Router();

// Import route modules
const bluetoothRoutes = require('./bluetooth');
const podcastRoutes = require('./podcasts');
const subscriptionRoutes = require('./subscriptions');
const episodeRoutes = require('./episodes');
const downloadRoutes = require('./downloads');
const mediaRoutes = require('./media');

// Mount routes
router.use('/bluetooth', bluetoothRoutes);
router.use('/podcasts', podcastRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/episodes', episodeRoutes);
router.use('/downloads', downloadRoutes);
router.use('/media', mediaRoutes);

// Future routes will be added here:
// router.use('/playlists', playlistRoutes);

module.exports = router;
