/**
 * Application-wide constants
 */

module.exports = {
	// Server configuration
	PORT: process.env.PORT || 80,

	// Bluetooth configuration
	DEVICE_OFFLINE_THRESHOLD: 30000, // 30 seconds - how long before a device is considered offline
	BLUETOOTH_COMMAND_TIMEOUT: 5000, // Default timeout for bluetooth commands
	BLUETOOTH_PAIR_TIMEOUT: 10000, // Timeout for pairing operations
	BLUETOOTH_SCAN_TIMEOUT: 2000, // Timeout for scan on/off commands

	// Command queue configuration
	COMMAND_QUEUE_DELAY: 100 // Delay between processing queued commands
};
