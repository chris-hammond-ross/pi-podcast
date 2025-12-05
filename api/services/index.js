/**
 * Services Index
 * Factory module that exports the appropriate service implementations
 * based on environment configuration.
 */

const NO_BLUETOOTH = process.env.NO_BLUETOOTH === 'true';
const NO_MPV = process.env.NO_MPV === 'true' || process.platform === 'win32';

// Export the appropriate Bluetooth service based on environment
let bluetoothService;

if (NO_BLUETOOTH) {
	console.log('[services] Running without Bluetooth - using mock service');
	bluetoothService = require('./bluetoothServiceMock');
} else {
	bluetoothService = require('./bluetoothService');
}

// Export the appropriate Media Player service based on environment
let mediaPlayerService;

if (NO_MPV) {
	console.log('[services] Running without MPV - using mock media player service');
	mediaPlayerService = require('./mediaPlayerServiceMock');
} else {
	mediaPlayerService = require('./mediaPlayerService');
}

const podcastService = require('./podcastService');
const subscriptionService = require('./subscriptionService');
const episodeService = require('./episodeService');
const downloadQueueService = require('./downloadQueueService');
const downloadProcessor = require('./downloadProcessor');
const playlistService = require('./playlistService');

module.exports = {
	bluetoothService,
	mediaPlayerService,
	podcastService,
	subscriptionService,
	episodeService,
	downloadQueueService,
	downloadProcessor,
	playlistService
};
