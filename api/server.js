const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'podcast.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better performance

console.log('[database] Connected to SQLite database at', dbPath);

// Prepared statements for Bluetooth devices
const getDeviceByMac = db.prepare('SELECT * FROM bluetooth_devices WHERE mac_address = ?');
const insertDevice = db.prepare(`
	INSERT INTO bluetooth_devices (mac_address, name, rssi, last_seen)
	VALUES (?, ?, ?, strftime('%s', 'now'))
`);
const updateDevice = db.prepare(`
	UPDATE bluetooth_devices
	SET name = ?, rssi = ?, last_seen = strftime('%s', 'now')
	WHERE mac_address = ?
`);
const updateDevicePaired = db.prepare(`
	UPDATE bluetooth_devices
	SET paired = ?, last_seen = strftime('%s', 'now')
	WHERE mac_address = ?
`);
const updateDeviceTrusted = db.prepare(`
	UPDATE bluetooth_devices
	SET trusted = ?, last_seen = strftime('%s', 'now')
	WHERE mac_address = ?
`);

let bluetoothctl = null;
let isConnected = false;
let currentDevices = []; // Array of { mac, name, rssi, is_connected }
let outputBuffer = '';
let clientSocket = null;
let connectedDeviceMac = null; // Track which device is currently connected
let isScanning = false; // Track scanning state
let bluetoothPowered = true; // Track Bluetooth power state

// Helper function to broadcast WebSocket messages to all connected clients
function broadcastMessage(message) {
	wss.clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(message));
		}
	});
}

// Helper function to send message to a specific client
function sendToClient(ws, message) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	}
}

// Auto-stop scanning when a device connects
async function autoStopScanOnConnect() {
	if (isScanning && connectedDeviceMac) {
		console.log('[scan] Auto-stopping scan due to successful connection');
		try {
			await sendCommand('scan off');
			isScanning = false;
			broadcastMessage({
				type: 'scan-stopped'
			});
		} catch (err) {
			console.error('[scan] Failed to auto-stop scan:', err.message);
		}
	}
}

// Initialize bluetoothctl process
function initializeBluetoothctl() {
	if (bluetoothctl) {
		bluetoothctl.kill();
	}

	bluetoothctl = spawn('bluetoothctl', { stdio: ['pipe', 'pipe', 'pipe'] });

	bluetoothctl.stdout.on('data', (data) => {
		const output = data.toString();
		outputBuffer += output;

		// Debug: log raw output (trim to avoid newline spam)
		const trimmedOutput = output.trim();
		if (trimmedOutput && !trimmedOutput.match(/^\[bluetooth\]#?$/)) {
			console.log('[bluetoothctl]', trimmedOutput.substring(0, 200));
		}

		// Broadcast raw output to all connected clients
		broadcastMessage({
			type: 'output',
			data: output
		});

		// Parse device discoveries and state changes in real-time
		parseDeviceOutput(output);
		parseConnectionChanges(output);
	});

	bluetoothctl.stderr.on('data', (data) => {
		console.error('[bluetoothctl ERR]', data.toString());
	});

	bluetoothctl.on('close', (code) => {
		console.log('[bluetoothctl] Process exited with code', code);
		isConnected = false;
		broadcastMessage({
			type: 'system-status',
			bluetooth_connected: false,
			bluetooth_powered: bluetoothPowered,
			devices_count: currentDevices.length,
			connected_device: null,
			is_scanning: false
		});
	});

	isConnected = true;
	console.log('[server] bluetoothctl initialized');

	// Notify all clients that bluetooth is ready
	broadcastMessage({
		type: 'system-status',
		bluetooth_connected: true,
		bluetooth_powered: bluetoothPowered,
		devices_count: currentDevices.length,
		connected_device: connectedDeviceMac ? currentDevices.find(d => d.mac === connectedDeviceMac) : null,
		is_scanning: isScanning
	});
}

// Parse connection state changes from bluetoothctl output
function parseConnectionChanges(output) {
	// Remove ANSI codes
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[0;9[0-9]m/g, '').replace(/\[0m/g, '');

	// Match connection status changes
	// Examples:
	// [CHG] Device XX:XX:XX:XX:XX:XX Connected: yes
	// [CHG] Device XX:XX:XX:XX:XX:XX Connected: no

	// Pattern 1: [CHG] Device MAC Connected: yes/no
	const chgMatches = cleanOutput.match(/\[CHG\]\s+Device\s+([0-9A-Fa-f:]{17})\s+Connected:\s+(yes|no)/gm);
	if (chgMatches) {
		chgMatches.forEach((line) => {
			const match = line.match(/\[CHG\]\s+Device\s+([0-9A-Fa-f:]{17})\s+Connected:\s+(yes|no)/);
			if (match) {
				const mac = match[1];
				const isNowConnected = match[2] === 'yes';

				console.log(`[connection] Device ${mac} connection changed: ${isNowConnected ? 'connected' : 'disconnected'}`);

				// Find or create device in current session
				let device = currentDevices.find(d => d.mac === mac);

				if (!device) {
					// Device not in current session - check database
					const dbDevice = getDeviceByMac.get(mac);
					if (dbDevice) {
						console.log('[connection] Loading device from database:', mac, dbDevice.name);
						device = {
							mac,
							name: dbDevice.name,
							rssi: dbDevice.rssi || -70,
							is_connected: false
						};
						currentDevices.push(device);

						// Notify clients of the device
						broadcastMessage({
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
					connectedDeviceMac = mac;
					broadcastMessage({
						type: 'device-connected',
						device: device
					});
					// Auto-stop scanning when device connects
					autoStopScanOnConnect();
				} else {
					if (connectedDeviceMac === mac) {
						connectedDeviceMac = null;
					}
					broadcastMessage({
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
		// Mark any pending connection as failed
		if (connectedDeviceMac) {
			const device = currentDevices.find(d => d.mac === connectedDeviceMac);
			if (device) {
				device.is_connected = false;
				broadcastMessage({
					type: 'device-disconnected',
					device: device
				});
			}
			connectedDeviceMac = null;
		}
	}
}

// Parse device output from bluetoothctl
function parseDeviceOutput(output) {
	// Remove ANSI codes
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[0;9[0-9]m/g, '').replace(/\[0m/g, '');

	// Match device lines: [NEW] Device XX:XX:XX:XX:XX:XX DeviceName
	// or: Device XX:XX:XX:XX:XX:XX DeviceName
	// But NOT lines that are about connection status changes
	const deviceMatches = cleanOutput.match(/(?:^|\n)(?:\[NEW\]\s+)?Device\s+([0-9A-Fa-f:]{17})\s+([^\n]+)/gm);

	if (deviceMatches) {
		deviceMatches.forEach((line) => {
			// Skip lines that are connection status updates
			if (/Connected:\s+(yes|no)/i.test(line)) {
				return;
			}

			// Skip lines that are property changes (RSSI, TxPower, etc.)
			if (/\[CHG\]/i.test(line)) {
				return;
			}

			const match = line.match(/(?:\[NEW\]\s+)?Device\s+([0-9A-Fa-f:]{17})\s+(.+?)$/);
			if (match) {
				const mac = match[1];
				let name = match[2].trim();

				// Check if device exists in database
				const dbDevice = getDeviceByMac.get(mac);

				if (dbDevice) {
					// Device exists in database - use stored name and skip filtering
					console.log('[devices] Found known device from database:', mac, dbDevice.name);

					// Parse RSSI if present in the current output
					let rssi = -70; // Default
					const rssiMatch = name.match(/RSSI:\s*0x([0-9a-fA-F]+)\s*\((-?\d+)\)/);
					if (rssiMatch) {
						rssi = parseInt(rssiMatch[2], 10);
					}

					// Update device in database with new RSSI and last_seen
					updateDevice.run(dbDevice.name, rssi, mac);

					// Check if device already exists in current session
					const existing = currentDevices.find((d) => d.mac === mac);
					if (!existing) {
						const knownDevice = {
							mac,
							name: dbDevice.name,
							rssi,
							is_connected: false
						};
						currentDevices.push(knownDevice);

						// Notify all clients of device
						broadcastMessage({
							type: 'device-found',
							device: knownDevice
						});
					} else {
						// Update RSSI if device already in current session
						existing.rssi = rssi;
					}

					return; // Skip filtering logic
				}

				// Device not in database - proceed with filtering

				// Skip empty names
				if (!name || name.length === 0) {
					return;
				}

				// Skip devices with RSSI: prefix (raw addresses)
				if (/^RSSI:/i.test(name)) {
					console.log('[devices] Skipping device with RSSI prefix:', mac, name);
					return;
				}

				// Skip BLE-only devices (various patterns)
				if (name.startsWith('LE_') || /\bLE\b/i.test(name) || /\bBLE\b/i.test(name)) {
					console.log('[devices] Skipping BLE device:', mac, name);
					return;
				}

				// Skip BLE beacons and mesh devices
				if (/\bBeacon\b/i.test(name) || /\bMesh\b/i.test(name)) {
					console.log('[devices] Skipping BLE beacon/mesh device:', mac, name);
					return;
				}

				// Skip known LE-only device types (fitness trackers, smart home, etc.)
				const knownLEPatterns = [
					/^Mi\s?(Band|Scale|Fit)/i,  // Xiaomi fitness devices
					/^Fitbit/i,                  // Fitbit trackers
					/^Tile\b/i,                  // Tile trackers
					/^AirTag/i,                  // Apple AirTags
					/^Galaxy\s?Fit/i,            // Samsung fitness bands
					/^Amazfit/i,                 // Amazfit watches
					/^WHOOP/i,                   // Whoop fitness bands
					/^Oura/i,                    // Oura rings
				];

				if (knownLEPatterns.some(pattern => pattern.test(name))) {
					console.log('[devices] Skipping known LE-only device:', mac, name);
					return;
				}

				// Skip devices where the name is just the MAC address
				// Examples: "C0-28-8D-02-4B-77", "C0:28:8D:02:4B:77", "C0_28_8D_02_4B_77"
				if (/^[0-9A-Fa-f]{2}[-:_]([0-9A-Fa-f]{2}[-:_]){4}[0-9A-Fa-f]{2}$/.test(name)) {
					console.log('[devices] Skipping device with MAC address as name:', mac, name);
					return;
				}

				// Skip devices with ManufacturerData/TxPower patterns as names
				if (/^ManufacturerData\.(Key|Value):/i.test(name)) {
					console.log('[devices] Skipping device with ManufacturerData as name:', mac, name);
					return;
				}

				if (/^TxPower:/i.test(name)) {
					console.log('[devices] Skipping device with TxPower as name:', mac, name);
					return;
				}

				// Device passed all filters - add to database and current devices
				const rssi = -70; // Default RSSI value (will be updated if available)

				try {
					insertDevice.run(mac, name, rssi);
					console.log('[database] Added new device:', mac, name);
				} catch (err) {
					if (!err.message.includes('UNIQUE constraint failed')) {
						console.error('[database] Error inserting device:', err.message);
					}
				}

				// Check if device already exists in current session
				const existing = currentDevices.find((d) => d.mac === mac);
				if (!existing) {
					const newDevice = {
						mac,
						name,
						rssi,
						is_connected: false
					};
					currentDevices.push(newDevice);
					console.log('[devices] Found:', mac, name);

					// Notify all clients of new device
					broadcastMessage({
						type: 'device-found',
						device: newDevice
					});
				}
			}
		});
	}
}

// Parse RSSI from device info output
function parseRSSIFromInfo(output) {
	const rssiMatch = output.match(/RSSI:\s*(-?\d+)/);
	return rssiMatch ? parseInt(rssiMatch[1], 10) : -70;
}

// Command queue for serializing bluetoothctl commands
const commandQueue = [];
let isProcessingCommand = false;

// Queue a command to be executed (ensures commands don't overlap)
function queueCommand(command, timeout = 5000) {
	return new Promise((resolve, reject) => {
		commandQueue.push({ command, timeout, resolve, reject });
		processCommandQueue();
	});
}

// Process the command queue sequentially
async function processCommandQueue() {
	if (isProcessingCommand || commandQueue.length === 0) return;

	isProcessingCommand = true;
	const { command, timeout, resolve, reject } = commandQueue.shift();

	try {
		const result = await executeCommand(command, timeout);
		resolve(result);
	} catch (err) {
		reject(err);
	} finally {
		isProcessingCommand = false;
		// Process next command after a small delay
		setTimeout(() => processCommandQueue(), 100);
	}
}

// Execute a single command to bluetoothctl with proper completion detection
function executeCommand(command, timeout = 5000) {
	return new Promise((resolve, reject) => {
		if (!isConnected || !bluetoothctl) {
			reject(new Error('bluetoothctl not connected'));
			return;
		}

		console.log('[command]', command);
		outputBuffer = '';

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

		const isComplete = () => {
			// Check for explicit completion patterns
			if (completionPatterns.some(pattern => pattern.test(outputBuffer))) {
				return true;
			}

			// For scan/power commands, just wait for the prompt to appear after the command
			// These are "fire and forget" commands
			if ((isScanCommand || isPowerCommand) && outputBuffer.includes('[bluetooth]#')) {
				return true;
			}

			return false;
		};

		// Poll for completion
		checkInterval = setInterval(() => {
			if (isComplete()) {
				// Give a tiny bit more time for any trailing output
				setTimeout(() => doResolve(outputBuffer), 50);
			}
		}, 50);

		// Timeout fallback - shorter for scan commands
		const effectiveTimeout = (isScanCommand || isPowerCommand) ? 2000 : timeout;
		timeoutId = setTimeout(() => {
			console.log('[command] Timeout reached, returning buffer:', outputBuffer.substring(0, 200));
			doResolve(outputBuffer);
		}, effectiveTimeout);

		try {
			bluetoothctl.stdin.write(command + '\n');
		} catch (err) {
			cleanup();
			reject(err);
		}
	});
}

// Send command to bluetoothctl (now uses queue)
function sendCommand(command, timeout = 5000) {
	return queueCommand(command, timeout);
}

// API Endpoints

app.post('/api/init', (req, res) => {
	try {
		if (!isConnected) {
			initializeBluetoothctl();
		}
		res.json({ success: true, message: 'Bluetooth initialized' });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/power', async (req, res) => {
	try {
		const { state } = req.body;
		const command = `power ${state ? 'on' : 'off'}`;
		const output = await sendCommand(command);

		bluetoothPowered = state;

		// If turning off, stop scanning and clear connections
		if (!state) {
			isScanning = false;
			connectedDeviceMac = null;
			currentDevices = currentDevices.map(d => ({ ...d, is_connected: false }));

			broadcastMessage({
				type: 'bluetooth-power-changed',
				powered: false,
				is_scanning: false
			});
		} else {
			broadcastMessage({
				type: 'bluetooth-power-changed',
				powered: true,
				is_scanning: isScanning
			});
		}

		res.json({ success: true, command, output, powered: bluetoothPowered });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/scan', async (req, res) => {
	try {
		const { state } = req.body;

		if (state === true) {
			// Don't clear devices - keep them and add new ones
			console.log('[scan] Starting scan (keeping existing devices)');
			isScanning = true;

			// Notify clients that scan is starting
			broadcastMessage({
				type: 'scan-started'
			});
		} else {
			console.log('[scan] Stopping scan');
			isScanning = false;

			// Notify clients that scan is stopping
			broadcastMessage({
				type: 'scan-stopped'
			});
		}

		const command = `scan ${state ? 'bredr' : 'off'}`;
		const output = await sendCommand(command);
		res.json({ success: true, command, output, is_scanning: isScanning });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.get('/api/devices', (req, res) => {
	res.json({
		success: true,
		devices: currentDevices,
		device_count: currentDevices.length
	});
});

app.post('/api/pair', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`pair ${mac}`);

		// Update paired status in database
		try {
			updateDevicePaired.run(1, mac);
			console.log('[database] Updated paired status for:', mac);
		} catch (err) {
			console.error('[database] Error updating paired status:', err.message);
		}

		res.json({ success: true, command: `pair ${mac}`, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/trust', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`trust ${mac}`);

		// Update trusted status in database
		try {
			updateDeviceTrusted.run(1, mac);
			console.log('[database] Updated trusted status for:', mac);
		} catch (err) {
			console.error('[database] Error updating trusted status:', err.message);
		}

		res.json({ success: true, command: `trust ${mac}`, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/connect', async (req, res) => {
	try {
		const { mac, fullSequence = true } = req.body;
		if (!mac) throw new Error('MAC address required');

		const results = {
			pair: null,
			trust: null,
			connect: null
		};

		if (fullSequence) {
			// Full connection sequence: pair -> trust -> connect
			console.log('[connect] Starting full connection sequence for:', mac);

			// Step 1: Pair (with longer timeout as pairing can take a while)
			try {
				results.pair = await sendCommand(`pair ${mac}`, 10000);
				console.log('[connect] Pair result:', results.pair.substring(0, 100));

				// Update paired status in database
				try {
					updateDevicePaired.run(1, mac);
				} catch (dbErr) {
					console.error('[database] Error updating paired status:', dbErr.message);
				}
			} catch (pairErr) {
				console.log('[connect] Pair failed (may already be paired):', pairErr.message);
			}

			// Small delay between commands
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 2: Trust
			try {
				results.trust = await sendCommand(`trust ${mac}`, 5000);
				console.log('[connect] Trust result:', results.trust.substring(0, 100));

				// Update trusted status in database
				try {
					updateDeviceTrusted.run(1, mac);
				} catch (dbErr) {
					console.error('[database] Error updating trusted status:', dbErr.message);
				}
			} catch (trustErr) {
				console.log('[connect] Trust failed:', trustErr.message);
			}

			// Small delay between commands
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Step 3: Connect (always executed)
		results.connect = await sendCommand(`connect ${mac}`, 10000);
		console.log('[connect] Connect result:', results.connect.substring(0, 100));

		// Don't immediately set is_connected here - wait for [CHG] confirmation
		// The parseConnectionChanges function will handle the actual state update

		res.json({
			success: true,
			command: `connect ${mac}`,
			output: results.connect,
			sequence: fullSequence ? results : undefined
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/disconnect', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`disconnect ${mac}`);

		// Don't immediately set is_connected here - wait for [CHG] confirmation
		// The parseConnectionChanges function will handle the actual state update

		res.json({ success: true, command: `disconnect ${mac}`, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/remove', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`remove ${mac}`);
		currentDevices = currentDevices.filter((d) => d.mac !== mac);
		if (mac === connectedDeviceMac) {
			connectedDeviceMac = null;
		}

		// Broadcast device removal to all clients
		broadcastMessage({
			type: 'device-removed',
			mac: mac
		});

		res.json({ success: true, command: `remove ${mac}`, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/info', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`info ${mac}`);

		// Try to parse RSSI from the info output
		const rssi = parseRSSIFromInfo(output);
		const device = currentDevices.find(d => d.mac === mac);
		if (device) {
			device.rssi = rssi;
		}

		res.json({
			success: true,
			command: `info ${mac}`,
			output,
			device: device || { mac, name: 'Unknown', rssi, is_connected: false }
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/command', async (req, res) => {
	try {
		const { command } = req.body;
		if (!command) throw new Error('Command required');

		const output = await sendCommand(command);
		res.json({ success: true, command, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({
		success: true,
		status: 'ok',
		bluetooth_connected: isConnected,
		bluetooth_powered: bluetoothPowered,
		devices_count: currentDevices.length,
		is_scanning: isScanning
	});
});

// Status endpoint to get current connection state
app.get('/api/status', (req, res) => {
	const connectedDevice = connectedDeviceMac
		? currentDevices.find(d => d.mac === connectedDeviceMac)
		: null;

	res.json({
		success: true,
		is_connected: connectedDeviceMac !== null,
		is_scanning: isScanning,
		bluetooth_powered: bluetoothPowered,
		device: connectedDevice || null
	});
});

// Catch-all route for React Router (SPA support)
// This must come after all API routes
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket for real-time updates
wss.on('connection', (ws) => {
	console.log('[websocket] Client connected');

	// Send initial system status to the new client
	sendToClient(ws, {
		type: 'system-status',
		bluetooth_connected: isConnected,
		bluetooth_powered: bluetoothPowered,
		devices_count: currentDevices.length,
		connected_device: connectedDeviceMac ? currentDevices.find(d => d.mac === connectedDeviceMac) : null,
		is_scanning: isScanning
	});

	// Send current devices list to the new client
	if (currentDevices.length > 0) {
		sendToClient(ws, {
			type: 'devices-list',
			devices: currentDevices
		});
	}

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);
			console.log('[websocket] Received:', data);

			// Handle client messages (ping/pong, subscriptions, etc.)
			if (data.type === 'ping') {
				sendToClient(ws, { type: 'pong' });
			}
		} catch (err) {
			console.error('[websocket] Parse error:', err.message);
		}
	});

	ws.on('close', () => {
		console.log('[websocket] Client disconnected');
	});

	ws.on('error', (err) => {
		console.error('[websocket] Error:', err.message);
	});
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`[server] Listening on http://localhost:${PORT}`);
	console.log('[server] Starting Bluetooth initialization...');
	initializeBluetoothctl();
});

// Cleanup on exit
process.on('SIGINT', () => {
	console.log('[server] Shutting down...');
	if (bluetoothctl) {
		bluetoothctl.kill();
	}
	db.close();
	console.log('[database] Database connection closed');
	server.close(() => {
		process.exit(0);
	});
});