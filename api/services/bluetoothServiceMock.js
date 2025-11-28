/**
 * Mock Bluetooth Service
 * Provides the same interface as bluetoothService but without actual Bluetooth functionality.
 * Used for development on systems without Bluetooth support (e.g., Windows).
 */
class BluetoothServiceMock {
	constructor() {
		this.isConnected = true;
		this.currentDevices = [];
		this.connectedDeviceMac = null;
		this.isScanning = false;
		this.bluetoothPowered = true;
		this.broadcastCallback = null;

		console.log('[bluetooth-mock] Mock Bluetooth service initialized');
		console.log('[bluetooth-mock] Bluetooth functionality is disabled - running in dev mode');
	}

	/**
	 * Set the broadcast callback for WebSocket messages
	 * @param {Function} callback - Function to broadcast messages to all clients
	 */
	setBroadcastCallback(callback) {
		this.broadcastCallback = callback;
	}

	/**
	 * Broadcast a message to all WebSocket clients
	 * @param {Object} message - The message to broadcast
	 */
	broadcast(message) {
		if (this.broadcastCallback) {
			this.broadcastCallback(message);
		}
	}

	/**
	 * Initialize the mock service (no-op)
	 */
	initialize() {
		console.log('[bluetooth-mock] Initialize called (no-op)');
		
		// Simulate initial state broadcast
		setTimeout(() => {
			this.broadcast({
				type: 'system-status',
				bluetooth_connected: false,
				bluetooth_powered: false,
				devices_count: 0,
				connected_device: null,
				is_scanning: false,
				mock_mode: true
			});
		}, 100);
	}

	/**
	 * Set Bluetooth power state (mock)
	 * @param {boolean} state - true for on, false for off
	 * @returns {Promise<Object>} Result object
	 */
	async setPower(state) {
		console.log('[bluetooth-mock] setPower called:', state);
		this.bluetoothPowered = state;

		this.broadcast({
			type: 'bluetooth-power-changed',
			powered: state,
			is_scanning: this.isScanning,
			mock_mode: true
		});

		return {
			command: `power ${state ? 'on' : 'off'}`,
			output: '[mock] Power command simulated',
			powered: this.bluetoothPowered
		};
	}

	/**
	 * Start or stop scanning for devices (mock)
	 * @param {boolean} state - true to start, false to stop
	 * @returns {Promise<Object>} Result object
	 */
	async setScan(state) {
		console.log('[bluetooth-mock] setScan called:', state);
		this.isScanning = state;

		this.broadcast({
			type: state ? 'scan-started' : 'scan-stopped',
			mock_mode: true
		});

		return {
			command: `scan ${state ? 'bredr' : 'off'}`,
			output: '[mock] Scan command simulated',
			is_scanning: this.isScanning
		};
	}

	/**
	 * Get all current devices
	 * @returns {Array} Array of devices (empty in mock)
	 */
	getDevices() {
		return this.currentDevices;
	}

	/**
	 * Pair with a device (mock)
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async pairDevice(mac) {
		console.log('[bluetooth-mock] pairDevice called:', mac);
		return {
			command: `pair ${mac}`,
			output: '[mock] Pair command simulated'
		};
	}

	/**
	 * Trust a device (mock)
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async trustDevice(mac) {
		console.log('[bluetooth-mock] trustDevice called:', mac);
		return {
			command: `trust ${mac}`,
			output: '[mock] Trust command simulated'
		};
	}

	/**
	 * Connect to a device (mock)
	 * @param {string} mac - The MAC address
	 * @param {boolean} fullSequence - Whether to do full pair->trust->connect sequence
	 * @returns {Promise<Object>} Result object
	 */
	async connectDevice(mac, fullSequence = true) {
		console.log('[bluetooth-mock] connectDevice called:', mac, 'fullSequence:', fullSequence);
		return {
			command: `connect ${mac}`,
			output: '[mock] Connect command simulated',
			sequence: fullSequence ? {
				pair: '[mock] Pair simulated',
				trust: '[mock] Trust simulated',
				connect: '[mock] Connect simulated'
			} : undefined
		};
	}

	/**
	 * Disconnect from a device (mock)
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async disconnectDevice(mac) {
		console.log('[bluetooth-mock] disconnectDevice called:', mac);
		return {
			command: `disconnect ${mac}`,
			output: '[mock] Disconnect command simulated'
		};
	}

	/**
	 * Remove a device (mock)
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async removeDevice(mac) {
		console.log('[bluetooth-mock] removeDevice called:', mac);

		this.broadcast({
			type: 'device-removed',
			mac: mac,
			mock_mode: true
		});

		return {
			command: `remove ${mac}`,
			output: '[mock] Remove command simulated'
		};
	}

	/**
	 * Get device info (mock)
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async getDeviceInfo(mac) {
		console.log('[bluetooth-mock] getDeviceInfo called:', mac);
		return {
			command: `info ${mac}`,
			output: '[mock] Info command simulated',
			device: { mac, name: 'Mock Device', rssi: -70, is_connected: false }
		};
	}

	/**
	 * Send a raw command (mock)
	 * @param {string} command - The command to send
	 * @returns {Promise<Object>} Result object
	 */
	async sendRawCommand(command) {
		console.log('[bluetooth-mock] sendRawCommand called:', command);
		return {
			command,
			output: '[mock] Command simulated'
		};
	}

	/**
	 * Get current status
	 * @returns {Object} Status object
	 */
	getStatus() {
		return {
			is_connected: false,
			is_scanning: this.isScanning,
			bluetooth_powered: false,
			device: null,
			mock_mode: true
		};
	}

	/**
	 * Get health status
	 * @returns {Object} Health status object
	 */
	getHealth() {
		return {
			status: 'ok',
			bluetooth_connected: false,
			bluetooth_powered: false,
			devices_count: 0,
			is_scanning: false,
			mock_mode: true
		};
	}

	/**
	 * Cleanup on shutdown (no-op)
	 */
	cleanup() {
		console.log('[bluetooth-mock] Cleanup called (no-op)');
	}
}

// Create singleton instance
const bluetoothServiceMock = new BluetoothServiceMock();

module.exports = bluetoothServiceMock;
