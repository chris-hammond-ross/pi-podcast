/**
 * Services Index
 * Factory module that exports the appropriate service implementations
 * based on environment configuration.
 */

const NO_BLUETOOTH = process.env.NO_BLUETOOTH === 'true';

// Export the appropriate Bluetooth service based on environment
let bluetoothService;

if (NO_BLUETOOTH) {
	console.log('[services] Running without Bluetooth - using mock service');
	bluetoothService = require('./bluetoothServiceMock');
} else {
	bluetoothService = require('./bluetoothService');
}

module.exports = {
	bluetoothService
};
