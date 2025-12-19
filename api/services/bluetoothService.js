const { spawn } = require('child_process');
const Device = require('../models/Device');
const CommandQueue = require('../utils/commandQueue');
const {
	BLUETOOTH_COMMAND_TIMEOUT,
	BLUETOOTH_PAIR_TIMEOUT,
	BLUETOOTH_SCAN_TIMEOUT
} = require('../config/constants');

/**
 * Bluetooth Service
 * Manages all Bluetooth operations including bluetoothctl process,
 * device scanning, pairing, connection, and state management
 */
class BluetoothService {
	constructor() {
		this.bluetoothctl = null;
		this.isConnected = false;
		this.currentDevices = []; // Array of { mac, name, rssi, is_connected, paired, trusted, is_online, battery }
		this.outputBuffer = '';
		this.connectedDeviceMac = null;
		this.isScanning = false;
		this.bluetoothPowered = true;
		this.lastSeenTimestamps = new Map();

		this.deviceModel = new Device();
		this.commandQueue = new CommandQueue();

		// Callback for broadcasting messages (will be set by websocket)
		this.broadcastCallback = null;

		// Battery polling interval (null when not polling)
		this.batteryPollInterval = null;
		this.BATTERY_POLL_INTERVAL_MS = 60000; // Poll every 60 seconds
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
	 * Initialize the bluetoothctl process
	 */
	initialize() {
		if (this.bluetoothctl) {
			this.bluetoothctl.kill();
		}

		this.bluetoothctl = spawn('bluetoothctl', { stdio: ['pipe', 'pipe', 'pipe'] });

		this.bluetoothctl.stdout.on('data', (data) => {
			const output = data.toString();
			this.outputBuffer += output;

			// Debug: log raw output (trim to avoid newline spam)
			const trimmedOutput = output.trim();
			if (trimmedOutput && !trimmedOutput.match(/^\[bluetooth\]#?$/)) {
				console.log('[bluetoothctl]', trimmedOutput.substring(0, 200));
			}

			// Broadcast raw output to all connected clients
			this.broadcast({
				type: 'output',
				data: output
			});

			// Parse device discoveries and state changes in real-time
			this.parseDeviceOutput(output);
			this.parseConnectionChanges(output);
		});

		this.bluetoothctl.stderr.on('data', (data) => {
			console.error('[bluetoothctl ERR]', data.toString());
		});

		this.bluetoothctl.on('close', (code) => {
			console.log('[bluetoothctl] Process exited with code', code);
			this.isConnected = false;
			this.stopBatteryPolling();
			this.broadcast({
				type: 'system-status',
				bluetooth_connected: false,
				bluetooth_powered: this.bluetoothPowered,
				devices_count: this.currentDevices.length,
				connected_device: null,
				is_scanning: false
			});
		});

		this.isConnected = true;
		console.log('[bluetooth] bluetoothctl initialized');

		// Load paired devices from database and refresh state after a short delay
		setTimeout(async () => {
			this.loadPairedDevicesFromDatabase();
			await this.refreshBluetoothState();

			// Broadcast initial state
			this.broadcast({
				type: 'system-status',
				bluetooth_connected: true,
				bluetooth_powered: this.bluetoothPowered,
				devices_count: this.currentDevices.length,
				connected_device: this.connectedDeviceMac ? this.currentDevices.find(d => d.mac === this.connectedDeviceMac) : null,
				is_scanning: this.isScanning
			});

			// Send devices list
			if (this.currentDevices.length > 0) {
				this.broadcast({
					type: 'devices-list',
					devices: this.currentDevices
				});
			}

			console.log('[bluetooth] Initial state broadcast complete');

			// Attempt to auto-reconnect to last connected device
			await this.attemptAutoReconnect();
		}, 1000);
	}

	/**
	 * Load paired devices from database into currentDevices
	 */
	loadPairedDevicesFromDatabase() {
		try {
			const pairedDevices = this.deviceModel.getAllPaired();
			console.log(`[database] Loading ${pairedDevices.length} paired devices from database`);

			pairedDevices.forEach(dbDevice => {
				const existing = this.currentDevices.find(d => d.mac === dbDevice.mac_address);
				if (!existing) {
					const device = {
						mac: dbDevice.mac_address,
						name: dbDevice.name,
						rssi: dbDevice.rssi || -70,
						is_connected: false,
						paired: !!dbDevice.paired,
						trusted: !!dbDevice.trusted,
						is_online: false,
						battery: null
					};
					this.currentDevices.push(device);
					console.log('[database] Loaded paired device:', device.mac, device.name);
				}
			});
		} catch (err) {
			console.error('[database] Error loading paired devices:', err.message);
		}
	}

	/**
	 * Attempt to auto-reconnect to the last connected device
	 * Called during service initialization
	 */
	async attemptAutoReconnect() {
		// Don't auto-reconnect if already connected
		if (this.connectedDeviceMac) {
			console.log('[bluetooth] Already connected, skipping auto-reconnect');
			return;
		}

		try {
			const lastConnectedDevice = this.deviceModel.getLastConnected();

			if (!lastConnectedDevice) {
				console.log('[bluetooth] No last connected device found, skipping auto-reconnect');
				return;
			}

			console.log(`[bluetooth] Attempting auto-reconnect to: ${lastConnectedDevice.name} (${lastConnectedDevice.mac_address})`);

			// Broadcast that we're attempting to reconnect
			this.broadcast({
				type: 'auto-reconnect-started',
				device: {
					mac: lastConnectedDevice.mac_address,
					name: lastConnectedDevice.name
				}
			});

			// Give a short delay for Bluetooth subsystem to fully initialize
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Attempt to connect (use simple connect, not full sequence since already paired/trusted)
			const result = await this.connectDevice(lastConnectedDevice.mac_address, false);

			// Check if connection was successful
			const success = /Connection successful/i.test(result.output) ||
				/Already connected/i.test(result.output);

			if (success) {
				console.log(`[bluetooth] Auto-reconnect successful: ${lastConnectedDevice.name}`);
				this.broadcast({
					type: 'auto-reconnect-success',
					device: {
						mac: lastConnectedDevice.mac_address,
						name: lastConnectedDevice.name
					}
				});
			} else {
				console.log(`[bluetooth] Auto-reconnect failed: ${lastConnectedDevice.name}`);
				console.log('[bluetooth] Connect output:', result.output.substring(0, 200));
				this.broadcast({
					type: 'auto-reconnect-failed',
					device: {
						mac: lastConnectedDevice.mac_address,
						name: lastConnectedDevice.name
					},
					error: 'Connection failed'
				});
			}
		} catch (err) {
			console.error('[bluetooth] Auto-reconnect error:', err.message);
			this.broadcast({
				type: 'auto-reconnect-failed',
				error: err.message
			});
		}
	}

	/**
	 * Refresh the Bluetooth state by querying bluetoothctl
	 */
	async refreshBluetoothState() {
		try {
			console.log('[bluetooth] Refreshing Bluetooth state...');

			// Get controller info to check power state
			const showOutput = await this.sendCommand('show', 3000);

			// Parse power state
			if (/Powered:\s*yes/i.test(showOutput)) {
				this.bluetoothPowered = true;
				console.log('[bluetooth] Bluetooth is powered on');
			} else if (/Powered:\s*no/i.test(showOutput)) {
				this.bluetoothPowered = false;
				console.log('[bluetooth] Bluetooth is powered off');
			}

			// Check each paired device's connection status
			for (const device of this.currentDevices) {
				if (device.paired) {
					try {
						const infoOutput = await this.sendCommand(`info ${device.mac}`, 2000);

						// Check if connected
						if (/Connected:\s*yes/i.test(infoOutput)) {
							device.is_connected = true;
							device.is_online = true;
							this.connectedDeviceMac = device.mac;
							console.log('[bluetooth] Device is connected:', device.mac, device.name);

							// Parse battery level for connected device
							const battery = this.parseBatteryFromInfo(infoOutput);
							if (battery !== null) {
								device.battery = battery;
								console.log('[bluetooth] Device battery level:', device.mac, battery + '%');
							}
						} else {
							device.is_connected = false;
							device.battery = null; // Clear battery when not connected
						}

						// Update paired/trusted from info output
						if (/Paired:\s*yes/i.test(infoOutput)) {
							device.paired = true;
						}
						if (/Trusted:\s*yes/i.test(infoOutput)) {
							device.trusted = true;
						}
					} catch (err) {
						console.log('[bluetooth] Could not get info for device:', device.mac, err.message);
					}
				}
			}

			// Start battery polling if we have a connected device
			if (this.connectedDeviceMac) {
				this.startBatteryPolling();
			}

			console.log('[bluetooth] Bluetooth state refresh complete');
		} catch (err) {
			console.error('[bluetooth] Error refreshing Bluetooth state:', err.message);
		}
	}

	/**
	 * Execute a single command to bluetoothctl with proper completion detection
	 * @param {string} command - The command to execute
	 * @param {number} timeout - Command timeout in ms
	 * @returns {Promise<string>} The command output
	 */
	executeCommand(command, timeout = BLUETOOTH_COMMAND_TIMEOUT) {
		return new Promise((resolve, reject) => {
			if (!this.isConnected || !this.bluetoothctl) {
				reject(new Error('bluetoothctl not connected'));
				return;
			}

			console.log('[command]', command);
			this.outputBuffer = '';

			let checkInterval = null;
			let timeoutId = null;
			let resolved = false;

			const cleanup = () => {
				if (checkInterval) clearInterval(checkInterval);
				if (timeoutId) clearTimeout(timeoutId);
			};

			const doResolve = (buffer) => {
				if (resolved) return;
				resolved = true;
				cleanup();
				resolve(buffer);
			};

			// Check for command completion indicators
			const completionPatterns = [
				/Successful/i,
				/Failed/i,
				/not available/i,
				/Connection successful/i,
				/Failed to connect/i,
				/Pairing successful/i,
				/Failed to pair/i,
				/trust succeeded/i,
				/Changing .* succeeded/i,
				/Device .* not available/i,
				/No default controller available/i,
				/org\.bluez\.Error/i,
				/Already connected/i,
				/not connected/i,
				/Discovery started/i,
				/Discovery stopped/i,
				/SetDiscoveryFilter success/i,
			];

			// For scan commands, also look for the prompt appearing after command echo
			const isScanCommand = /^scan\s+(on|off|bredr|le)$/i.test(command);
			const isPowerCommand = /^power\s+(on|off)$/i.test(command);
			const isInfoCommand = /^info\s+/i.test(command);

			const isComplete = () => {
				// Check for explicit completion patterns
				if (completionPatterns.some(pattern => pattern.test(this.outputBuffer))) {
					return true;
				}

				// For scan/power commands, just wait for the prompt to appear after the command
				if ((isScanCommand || isPowerCommand) && this.outputBuffer.includes('[bluetooth]#')) {
					return true;
				}

				// For info commands, look for the device info block completion
				if (isInfoCommand && this.outputBuffer.includes('[bluetooth]#')) {
					return true;
				}

				return false;
			};

			// Poll for completion
			checkInterval = setInterval(() => {
				if (isComplete()) {
					// Give a tiny bit more time for any trailing output
					setTimeout(() => doResolve(this.outputBuffer), 50);
				}
			}, 50);

			// Timeout fallback - shorter for scan commands
			const effectiveTimeout = (isScanCommand || isPowerCommand) ? BLUETOOTH_SCAN_TIMEOUT : timeout;
			timeoutId = setTimeout(() => {
				console.log('[command] Timeout reached, returning buffer:', this.outputBuffer.substring(0, 200));
				doResolve(this.outputBuffer);
			}, effectiveTimeout);

			try {
				this.bluetoothctl.stdin.write(command + '\n');
			} catch (err) {
				cleanup();
				reject(err);
			}
		});
	}

	/**
	 * Send a command to bluetoothctl (uses command queue)
	 * @param {string} command - The command to send
	 * @param {number} timeout - Command timeout in ms
	 * @returns {Promise<string>} The command output
	 */
	sendCommand(command, timeout = BLUETOOTH_COMMAND_TIMEOUT) {
		return this.commandQueue.queueCommand(
			this.executeCommand.bind(this),
			command,
			timeout
		);
	}

	/**
	 * Parse device output from bluetoothctl
	 * @param {string} output - The output from bluetoothctl
	 */
	parseDeviceOutput(output) {
		// Remove ANSI codes
		const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[0;9[0-9]m/g, '').replace(/\[0m/g, '');

		// Check for device removal: [DEL] Device XX:XX:XX:XX:XX:XX DeviceName
		const delMatches = cleanOutput.match(/\[DEL\]\s+Device\s+([0-9A-Fa-f:]{17})/g);
		if (delMatches) {
			delMatches.forEach((line) => {
				const match = line.match(/\[DEL\]\s+Device\s+([0-9A-Fa-f:]{17})/);
				if (match) {
					const mac = match[1];
					console.log('[devices] Device removed/went offline:', mac);

					const device = this.currentDevices.find(d => d.mac === mac);
					if (device) {
						device.is_online = false;
						device.is_connected = false;
						device.battery = null;
						this.lastSeenTimestamps.delete(mac);

						if (this.connectedDeviceMac === mac) {
							this.connectedDeviceMac = null;
							this.stopBatteryPolling();
						}

						this.broadcast({
							type: 'device-updated',
							device: device
						});
					}
				}
			});
		}

		// Match device lines: [NEW] Device XX:XX:XX:XX:XX:XX DeviceName
		const deviceMatches = cleanOutput.match(/(?:^|\n)(?:\[NEW\]\s+)?Device\s+([0-9A-Fa-f:]{17})\s+([^\n]+)/gm);

		if (deviceMatches) {
			deviceMatches.forEach((line) => {
				// Skip lines that are connection status updates
				if (/Connected:\s+(yes|no)/i.test(line)) return;
				if (/\[CHG\]/i.test(line)) return;
				if (/\[DEL\]/i.test(line)) return;

				const match = line.match(/(?:\[NEW\]\s+)?Device\s+([0-9A-Fa-f:]{17})\s+(.+?)$/);
				if (match) {
					const mac = match[1];
					let name = match[2].trim();

					// Check if device exists in database
					const dbDevice = this.deviceModel.getByMac(mac);

					if (dbDevice) {
						// Device exists in database - use stored name and skip filtering
						console.log('[devices] Found known device from database:', mac, dbDevice.name);

						// Parse RSSI if present
						let rssi = -70;
						const rssiMatch = name.match(/RSSI:\s*0x([0-9a-fA-F]+)\s*\((-?\d+)\)/);
						if (rssiMatch) {
							rssi = parseInt(rssiMatch[2], 10);
						}

						// Update device in database
						this.deviceModel.update(mac, dbDevice.name, rssi);

						// Check if device already exists in current session
						const existing = this.currentDevices.find((d) => d.mac === mac);
						if (!existing) {
							const knownDevice = {
								mac,
								name: dbDevice.name,
								rssi,
								is_connected: false,
								paired: !!dbDevice.paired,
								trusted: !!dbDevice.trusted,
								is_online: true,
								battery: null
							};
							this.currentDevices.push(knownDevice);
							this.lastSeenTimestamps.set(mac, Date.now());

							this.broadcast({
								type: 'device-found',
								device: knownDevice
							});
						} else {
							existing.rssi = rssi;
							existing.is_online = true;
							this.lastSeenTimestamps.set(mac, Date.now());
						}

						return;
					}

					// Device not in database - proceed with filtering
					if (!name || name.length === 0) return;
					if (/^RSSI:/i.test(name)) {
						console.log('[devices] Skipping device with RSSI prefix:', mac, name);
						return;
					}
					if (name.startsWith('LE_') || /\bLE\b/i.test(name) || /\bBLE\b/i.test(name)) {
						console.log('[devices] Skipping BLE device:', mac, name);
						return;
					}
					if (/\bBeacon\b/i.test(name) || /\bMesh\b/i.test(name)) {
						console.log('[devices] Skipping BLE beacon/mesh device:', mac, name);
						return;
					}

					const knownLEPatterns = [
						/^Mi\s?(Band|Scale|Fit)/i,
						/^Fitbit/i,
						/^Tile\b/i,
						/^AirTag/i,
						/^Galaxy\s?Fit/i,
						/^Amazfit/i,
						/^WHOOP/i,
						/^Oura/i,
					];

					if (knownLEPatterns.some(pattern => pattern.test(name))) {
						console.log('[devices] Skipping known LE-only device:', mac, name);
						return;
					}

					if (/^[0-9A-Fa-f]{2}[-:_]([0-9A-Fa-f]{2}[-:_]){4}[0-9A-Fa-f]{2}$/.test(name)) {
						console.log('[devices] Skipping device with MAC address as name:', mac, name);
						return;
					}

					if (/^ManufacturerData\.(Key|Value):/i.test(name)) {
						console.log('[devices] Skipping device with ManufacturerData as name:', mac, name);
						return;
					}

					if (/^TxPower:/i.test(name)) {
						console.log('[devices] Skipping device with TxPower as name:', mac, name);
						return;
					}

					// Device passed all filters - add to database
					const rssi = -70;

					this.deviceModel.insert(mac, name, rssi);
					console.log('[database] Added new device:', mac, name);

					const existing = this.currentDevices.find((d) => d.mac === mac);
					if (!existing) {
						const newDevice = {
							mac,
							name,
							rssi,
							is_connected: false,
							paired: false,
							trusted: false,
							is_online: true,
							battery: null
						};
						this.currentDevices.push(newDevice);
						this.lastSeenTimestamps.set(mac, Date.now());
						console.log('[devices] Found:', mac, name);

						this.broadcast({
							type: 'device-found',
							device: newDevice
						});
					} else {
						existing.is_online = true;
						this.lastSeenTimestamps.set(mac, Date.now());
					}
				}
			});
		}
	}

	/**
	 * Parse connection state changes from bluetoothctl output
	 * @param {string} output - The output from bluetoothctl
	 */
	parseConnectionChanges(output) {
		// Remove ANSI codes
		const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[0;9[0-9]m/g, '').replace(/\[0m/g, '');

		// Match connection status changes
		const chgMatches = cleanOutput.match(/\[CHG\]\s+Device\s+([0-9A-Fa-f:]{17})\s+Connected:\s+(yes|no)/gm);
		if (chgMatches) {
			chgMatches.forEach((line) => {
				const match = line.match(/\[CHG\]\s+Device\s+([0-9A-Fa-f:]{17})\s+Connected:\s+(yes|no)/);
				if (match) {
					const mac = match[1];
					const isNowConnected = match[2] === 'yes';

					console.log(`[connection] Device ${mac} connection changed: ${isNowConnected ? 'connected' : 'disconnected'}`);

					let device = this.currentDevices.find(d => d.mac === mac);

					if (!device) {
						// Device not in current session - check database
						const dbDevice = this.deviceModel.getByMac(mac);
						if (dbDevice) {
							console.log('[connection] Loading device from database:', mac, dbDevice.name);
							device = {
								mac,
								name: dbDevice.name,
								rssi: dbDevice.rssi || -70,
								is_connected: false,
								paired: !!dbDevice.paired,
								trusted: !!dbDevice.trusted,
								is_online: true,
								battery: null
							};
							this.currentDevices.push(device);

							this.broadcast({
								type: 'device-found',
								device: device
							});
						} else {
							console.log('[connection] Device not in database, ignoring connection state change');
							return;
						}
					}

					// Update connection state
					device.is_connected = isNowConnected;

					if (isNowConnected) {
						this.connectedDeviceMac = mac;

						// Track this as the last connected device for auto-reconnect
						try {
							this.deviceModel.setLastConnected(mac);
							console.log('[database] Updated last connected device:', mac);
						} catch (err) {
							console.error('[database] Failed to update last connected device:', err.message);
						}

						// Fetch battery level for newly connected device
						this.fetchAndUpdateBattery(mac);

						// Start battery polling
						this.startBatteryPolling();

						this.broadcast({
							type: 'device-connected',
							device: device
						});
						// Auto-stop scanning when device connects
						this.autoStopScanOnConnect();
					} else {
						if (this.connectedDeviceMac === mac) {
							this.connectedDeviceMac = null;
							this.stopBatteryPolling();
						}
						device.battery = null; // Clear battery when disconnected
						this.broadcast({
							type: 'device-disconnected',
							device: device
						});
					}
				}
			});
		}

		// Pattern 2: Connection successful / Failed to connect messages
		if (/Connection successful/i.test(cleanOutput)) {
			console.log('[connection] Connection successful message detected');
		}
		if (/Failed to connect/i.test(cleanOutput)) {
			console.log('[connection] Failed to connect message detected');
			if (this.connectedDeviceMac) {
				const device = this.currentDevices.find(d => d.mac === this.connectedDeviceMac);
				if (device) {
					device.is_connected = false;
					device.battery = null;
					this.broadcast({
						type: 'device-disconnected',
						device: device
					});
				}
				this.connectedDeviceMac = null;
				this.stopBatteryPolling();
			}
		}
	}

	/**
	 * Auto-stop scanning when a device connects
	 */
	async autoStopScanOnConnect() {
		if (this.isScanning && this.connectedDeviceMac) {
			console.log('[scan] Auto-stopping scan due to successful connection');
			try {
				await this.sendCommand('scan off');
				this.isScanning = false;
				this.broadcast({
					type: 'scan-stopped'
				});
			} catch (err) {
				console.error('[scan] Failed to auto-stop scan:', err.message);
			}
		}
	}

	/**
	 * Parse RSSI from device info output
	 * @param {string} output - The info command output
	 * @returns {number} The RSSI value
	 */
	parseRSSIFromInfo(output) {
		const rssiMatch = output.match(/RSSI:\s*(-?\d+)/);
		return rssiMatch ? parseInt(rssiMatch[1], 10) : -70;
	}

	/**
	 * Parse battery percentage from device info output
	 * Battery is reported as: "Battery Percentage: 0x5a (90)"
	 * @param {string} output - The info command output
	 * @returns {number|null} The battery percentage (0-100) or null if not available
	 */
	parseBatteryFromInfo(output) {
		// Pattern: "Battery Percentage: 0xNN (decimal)"
		const batteryMatch = output.match(/Battery Percentage:\s*0x[0-9a-fA-F]+\s*\((\d+)\)/i);
		if (batteryMatch) {
			const battery = parseInt(batteryMatch[1], 10);
			// Validate it's a reasonable percentage
			if (battery >= 0 && battery <= 100) {
				return battery;
			}
		}
		return null;
	}

	/**
	 * Fetch battery level for a device and update its state
	 * @param {string} mac - The MAC address
	 */
	async fetchAndUpdateBattery(mac) {
		try {
			const infoOutput = await this.sendCommand(`info ${mac}`, 2000);
			const battery = this.parseBatteryFromInfo(infoOutput);

			const device = this.currentDevices.find(d => d.mac === mac);
			if (device) {
				const previousBattery = device.battery;
				device.battery = battery;

				// Only broadcast if battery changed
				if (previousBattery !== battery) {
					console.log(`[battery] Device ${mac} battery: ${battery !== null ? battery + '%' : 'not available'}`);
					this.broadcast({
						type: 'device-battery-updated',
						device: {
							mac: device.mac,
							name: device.name,
							battery: device.battery
						}
					});
				}
			}
		} catch (err) {
			console.error(`[battery] Failed to fetch battery for ${mac}:`, err.message);
		}
	}

	/**
	 * Start polling for battery level of connected device
	 */
	startBatteryPolling() {
		// Don't start if already polling
		if (this.batteryPollInterval) {
			return;
		}

		// Don't start if no device connected
		if (!this.connectedDeviceMac) {
			return;
		}

		console.log('[battery] Starting battery polling');
		this.batteryPollInterval = setInterval(() => {
			if (this.connectedDeviceMac) {
				this.fetchAndUpdateBattery(this.connectedDeviceMac);
			} else {
				this.stopBatteryPolling();
			}
		}, this.BATTERY_POLL_INTERVAL_MS);
	}

	/**
	 * Stop polling for battery level
	 */
	stopBatteryPolling() {
		if (this.batteryPollInterval) {
			console.log('[battery] Stopping battery polling');
			clearInterval(this.batteryPollInterval);
			this.batteryPollInterval = null;
		}
	}

	// Public API methods

	/**
	 * Set Bluetooth power state
	 * @param {boolean} state - true for on, false for off
	 * @returns {Promise<Object>} Result object
	 */
	async setPower(state) {
		const command = `power ${state ? 'on' : 'off'}`;
		const output = await this.sendCommand(command);

		this.bluetoothPowered = state;

		if (!state) {
			this.isScanning = false;
			this.connectedDeviceMac = null;
			this.stopBatteryPolling();
			this.currentDevices = this.currentDevices.map(d => ({ ...d, is_connected: false, battery: null }));

			this.broadcast({
				type: 'bluetooth-power-changed',
				powered: false,
				is_scanning: false
			});
		} else {
			this.broadcast({
				type: 'bluetooth-power-changed',
				powered: true,
				is_scanning: this.isScanning
			});
		}

		return { command, output, powered: this.bluetoothPowered };
	}

	/**
	 * Start or stop scanning for devices
	 * @param {boolean} state - true to start, false to stop
	 * @returns {Promise<Object>} Result object
	 */
	async setScan(state) {
		if (state === true) {
			console.log('[scan] Starting scan (keeping existing devices)');
			this.isScanning = true;

			this.broadcast({
				type: 'scan-started'
			});
		} else {
			console.log('[scan] Stopping scan');
			this.isScanning = false;

			this.broadcast({
				type: 'scan-stopped'
			});
		}

		const command = `scan ${state ? 'bredr' : 'off'}`;
		const output = await this.sendCommand(command);
		return { command, output, is_scanning: this.isScanning };
	}

	/**
	 * Get all current devices
	 * @returns {Array} Array of devices
	 */
	getDevices() {
		return this.currentDevices;
	}

	/**
	 * Pair with a device
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async pairDevice(mac) {
		const output = await this.sendCommand(`pair ${mac}`);

		this.deviceModel.updatePaired(mac, true);
		console.log('[database] Updated paired status for:', mac);

		return { command: `pair ${mac}`, output };
	}

	/**
	 * Trust a device
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async trustDevice(mac) {
		const output = await this.sendCommand(`trust ${mac}`);

		this.deviceModel.updateTrusted(mac, true);
		console.log('[database] Updated trusted status for:', mac);

		return { command: `trust ${mac}`, output };
	}

	/**
	 * Connect to a device
	 * @param {string} mac - The MAC address
	 * @param {boolean} fullSequence - Whether to do full pair->trust->connect sequence
	 * @returns {Promise<Object>} Result object
	 */
	async connectDevice(mac, fullSequence = true) {
		const results = {
			pair: null,
			trust: null,
			connect: null
		};

		if (fullSequence) {
			console.log('[connect] Starting full connection sequence for:', mac);

			// Step 1: Pair
			try {
				results.pair = await this.sendCommand(`pair ${mac}`, BLUETOOTH_PAIR_TIMEOUT);
				console.log('[connect] Pair result:', results.pair.substring(0, 100));

				this.deviceModel.updatePaired(mac, true);
				const device = this.currentDevices.find(d => d.mac === mac);
				if (device) device.paired = true;
			} catch (pairErr) {
				console.log('[connect] Pair failed (may already be paired):', pairErr.message);
			}

			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 2: Trust
			try {
				results.trust = await this.sendCommand(`trust ${mac}`, 5000);
				console.log('[connect] Trust result:', results.trust.substring(0, 100));

				this.deviceModel.updateTrusted(mac, true);
				const device = this.currentDevices.find(d => d.mac === mac);
				if (device) device.trusted = true;
			} catch (trustErr) {
				console.log('[connect] Trust failed:', trustErr.message);
			}

			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Step 3: Connect
		results.connect = await this.sendCommand(`connect ${mac}`, BLUETOOTH_PAIR_TIMEOUT);
		console.log('[connect] Connect result:', results.connect.substring(0, 100));

		return {
			command: `connect ${mac}`,
			output: results.connect,
			sequence: fullSequence ? results : undefined
		};
	}

	/**
	 * Disconnect from a device
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async disconnectDevice(mac) {
		const output = await this.sendCommand(`disconnect ${mac}`);
		return { command: `disconnect ${mac}`, output };
	}

	/**
	 * Remove a device
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async removeDevice(mac) {
		const output = await this.sendCommand(`remove ${mac}`);
		this.currentDevices = this.currentDevices.filter((d) => d.mac !== mac);
		if (mac === this.connectedDeviceMac) {
			this.connectedDeviceMac = null;
			this.stopBatteryPolling();
		}

		this.broadcast({
			type: 'device-removed',
			mac: mac
		});

		return { command: `remove ${mac}`, output };
	}

	/**
	 * Get device info
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object
	 */
	async getDeviceInfo(mac) {
		const output = await this.sendCommand(`info ${mac}`);
		const rssi = this.parseRSSIFromInfo(output);
		const battery = this.parseBatteryFromInfo(output);

		const device = this.currentDevices.find(d => d.mac === mac);
		if (device) {
			device.rssi = rssi;
			if (device.is_connected) {
				device.battery = battery;
			}
		}

		return {
			command: `info ${mac}`,
			output,
			device: device || { mac, name: 'Unknown', rssi, is_connected: false, battery }
		};
	}

	/**
	 * Get battery level for a device
	 * @param {string} mac - The MAC address
	 * @returns {Promise<Object>} Result object with battery level
	 */
	async getBatteryLevel(mac) {
		const output = await this.sendCommand(`info ${mac}`);
		const battery = this.parseBatteryFromInfo(output);

		const device = this.currentDevices.find(d => d.mac === mac);
		if (device && device.is_connected) {
			device.battery = battery;
		}

		return {
			mac,
			battery,
			supported: battery !== null
		};
	}

	/**
	 * Send a raw command to bluetoothctl
	 * @param {string} command - The command to send
	 * @returns {Promise<Object>} Result object
	 */
	async sendRawCommand(command) {
		const output = await this.sendCommand(command);
		return { command, output };
	}

	/**
	 * Get current status
	 * @returns {Object} Status object
	 */
	getStatus() {
		const connectedDevice = this.connectedDeviceMac
			? this.currentDevices.find(d => d.mac === this.connectedDeviceMac)
			: null;

		return {
			is_connected: this.connectedDeviceMac !== null,
			is_scanning: this.isScanning,
			bluetooth_powered: this.bluetoothPowered,
			device: connectedDevice || null
		};
	}

	/**
	 * Get health status
	 * @returns {Object} Health status object
	 */
	getHealth() {
		return {
			status: 'ok',
			bluetooth_connected: this.isConnected,
			bluetooth_powered: this.bluetoothPowered,
			devices_count: this.currentDevices.length,
			is_scanning: this.isScanning
		};
	}

	/**
	 * Cleanup on shutdown
	 */
	cleanup() {
		this.stopBatteryPolling();
		if (this.bluetoothctl) {
			this.bluetoothctl.kill();
		}
	}
}

// Create singleton instance
const bluetoothService = new BluetoothService();

module.exports = bluetoothService;
