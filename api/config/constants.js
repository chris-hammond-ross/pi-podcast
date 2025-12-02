/**
 * Application-wide constants
 */

const path = require('path');

/**
 * Get default download directory based on platform/environment
 * @returns {string} Download directory path
 */
function getDownloadDir() {
	// Check for explicit environment variable first
	if (process.env.DOWNLOAD_DIR) {
		return process.env.DOWNLOAD_DIR;
	}

	// Development mode on Windows - use a local folder
	if (process.env.NODE_ENV === 'development' && process.platform === 'win32') {
		return path.join(__dirname, '..', 'downloads');
	}

	// Production on Linux (Raspberry Pi) - use system location
	if (process.platform === 'linux') {
		return '/var/lib/pi-podcast/episodes';
	}

	// Fallback to local directory
	return path.join(__dirname, '..', 'downloads');
}

/**
 * Get MPV socket path based on platform/environment
 * @returns {string} MPV socket path
 */
function getMpvSocketPath() {
	// Check for explicit environment variable first
	if (process.env.MPV_SOCKET) {
		return process.env.MPV_SOCKET;
	}

	// Production on Linux (Raspberry Pi) - use runtime directory
	if (process.platform === 'linux') {
		return '/run/pi-podcast/mpv.sock';
	}

	// Development/Windows - use temp directory or local
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\pi-podcast-mpv';
	}

	// Fallback for other Unix-like systems
	return '/tmp/pi-podcast-mpv.sock';
}

module.exports = {
	// Server configuration
	PORT: process.env.PORT || 80,

	// Bluetooth configuration
	DEVICE_OFFLINE_THRESHOLD: 30000, // 30 seconds - how long before a device is considered offline
	BLUETOOTH_COMMAND_TIMEOUT: 5000, // Default timeout for bluetooth commands
	BLUETOOTH_PAIR_TIMEOUT: 10000, // Timeout for pairing operations
	BLUETOOTH_SCAN_TIMEOUT: 2000, // Timeout for scan on/off commands

	// Command queue configuration
	COMMAND_QUEUE_DELAY: 100, // Delay between processing queued commands

	// Download configuration
	DOWNLOAD_DIR: getDownloadDir(),
	DOWNLOAD_DELAY_BETWEEN: 2000, // ms between downloads
	DOWNLOAD_MAX_RETRIES: 3,
	DOWNLOAD_RETRY_DELAY: 5000, // ms before retry
	DOWNLOAD_CONNECTION_TIMEOUT: 30000, // 30 seconds
	DOWNLOAD_TIMEOUT: 600000, // 10 minutes
	DOWNLOAD_PROGRESS_INTERVAL: 1000, // ms between progress updates
	DOWNLOAD_MIN_DISK_SPACE: 500 * 1024 * 1024, // 500MB

	// Media player configuration
	MPV_SOCKET_PATH: getMpvSocketPath(),
	MPV_STARTUP_TIMEOUT: 5000, // Timeout waiting for MPV to start
	MPV_COMMAND_TIMEOUT: 3000, // Timeout for MPV commands
	MPV_POSITION_SAVE_INTERVAL: 10000, // Save position every 10 seconds
	MPV_COMPLETION_THRESHOLD: 0.95 // Mark as complete when 95% played
};
