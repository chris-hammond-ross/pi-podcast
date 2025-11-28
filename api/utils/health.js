const { getHealth: getDatabaseHealth } = require('../config/database');
const { bluetoothService } = require('../services');
const podcastService = require('../services/podcastService');

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Get aggregated health status of all services
 * @param {Object} options - Options for health check
 * @param {boolean} options.deep - Whether to perform deep health checks (e.g., API calls)
 * @returns {Promise<Object>} Aggregated health status
 */
async function getHealth(options = {}) {
	const { deep = false } = options;

	const health = {
		status: 'ok',
		uptime: Math.floor((Date.now() - startTime) / 1000),
		timestamp: new Date().toISOString(),
		services: {}
	};

	// Database health (always checked - it's fast)
	health.services.database = getDatabaseHealth();

	// Bluetooth health
	const bluetoothHealth = bluetoothService.getHealth();
	health.services.bluetooth = {
		status: bluetoothHealth.status || 'ok',
		connected: bluetoothHealth.bluetooth_connected,
		powered: bluetoothHealth.bluetooth_powered,
		devicesCount: bluetoothHealth.devices_count,
		isScanning: bluetoothHealth.is_scanning
	};

	// Add mock_mode flag if present
	if (bluetoothHealth.mock_mode) {
		health.services.bluetooth.mockMode = true;
	}

	// Podcast service health
	if (deep) {
		// Deep check - actually ping the iTunes API
		health.services.podcast = await podcastService.getHealth();
	} else {
		// Shallow check - just report that the service is available
		health.services.podcast = {
			status: 'ok',
			api: 'itunes'
		};
	}

	// Determine overall status
	const statuses = Object.values(health.services).map(s => s.status);
	
	if (statuses.every(s => s === 'ok')) {
		health.status = 'ok';
	} else if (statuses.some(s => s === 'ok')) {
		health.status = 'degraded';
	} else {
		health.status = 'error';
	}

	return health;
}

module.exports = {
	getHealth
};
