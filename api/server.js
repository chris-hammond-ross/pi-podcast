const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let bluetoothctl = null;
let isConnected = false;
let currentDevices = []; // Array of { mac, name, rssi, is_connected }
let outputBuffer = '';
let clientSocket = null;
let connectedDeviceMac = null; // Track which device is currently connected

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

// Initialize bluetoothctl process
function initializeBluetoothctl() {
	if (bluetoothctl) {
		bluetoothctl.kill();
	}

	bluetoothctl = spawn('bluetoothctl', { stdio: ['pipe', 'pipe', 'pipe'] });

	bluetoothctl.stdout.on('data', (data) => {
		const output = data.toString();
		outputBuffer += output;

		// Broadcast raw output to all connected clients
		broadcastMessage({
			type: 'output',
			data: output
		});

		// Parse device discoveries in real-time
		parseDeviceOutput(output);
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
			devices_count: currentDevices.length,
			connected_device: null
		});
	});

	isConnected = true;
	console.log('[server] bluetoothctl initialized');

	// Notify all clients that bluetooth is ready
	broadcastMessage({
		type: 'system-status',
		bluetooth_connected: true,
		devices_count: currentDevices.length,
		connected_device: connectedDeviceMac ? currentDevices.find(d => d.mac === connectedDeviceMac) : null
	});
}

// Parse device output from bluetoothctl
function parseDeviceOutput(output) {
	// Remove ANSI codes
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[0;9[0-9]m/g, '').replace(/\[0m/g, '');

	// Match device lines: Device XX:XX:XX:XX:XX:XX DeviceName
	const deviceMatches = cleanOutput.match(/Device\s+([0-9A-Fa-f:]{17})\s+([^\n]+)/gm);

	if (deviceMatches) {
		deviceMatches.forEach((line) => {
			const match = line.match(/Device\s+([0-9A-Fa-f:]{17})\s+(.+?)$/);
			if (match) {
				const mac = match[1];
				let name = match[2].trim();

				// Skip BLE-only devices (marked with LE_ prefix or containing "LE " pattern)
				if (name.startsWith('LE_') || name.includes('LE ')) {
					console.log('[devices] Skipping BLE device:', mac, name);
					return;
				}

				// Skip devices where the name is just the MAC address (with dashes or colons)
				// Examples: "C0-28-8D-02-4B-77", "C0:28:8D:02:4B:77", "C0_28_8D_02_4B_77"
				if (/^[0-9A-Fa-f]{2}[-:_]([0-9A-Fa-f]{2}[-:_]){4}[0-9A-Fa-f]{2}$/.test(name)) {
					console.log('[devices] Skipping device with MAC address as name:', mac, name);
					return;
				}

				if (name && name.length > 0) {
					// Check if device already exists
					const existing = currentDevices.find((d) => d.mac === mac);
					if (!existing) {
						const newDevice = {
							mac,
							name,
							rssi: -70, // Default RSSI value (will be updated if available)
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
			}
		});
	}
}

// Parse RSSI from device info output
function parseRSSIFromInfo(output) {
	const rssiMatch = output.match(/RSSI:\s*(-?\d+)/);
	return rssiMatch ? parseInt(rssiMatch[1], 10) : -70;
}

// Send command to bluetoothctl
function sendCommand(command) {
	return new Promise((resolve, reject) => {
		if (!isConnected || !bluetoothctl) {
			reject(new Error('bluetoothctl not connected'));
			return;
		}

		console.log('[command]', command);
		outputBuffer = '';

		try {
			bluetoothctl.stdin.write(command + '\n');

			// Give it time to execute and capture output
			setTimeout(() => {
				resolve(outputBuffer);
			}, 500);
		} catch (err) {
			reject(err);
		}
	});
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
		res.json({ success: true, command, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/scan', async (req, res) => {
	try {
		const { state } = req.body;

		// Reset devices when starting a new scan
		if (state === true) {
			currentDevices = [];
			console.log('[scan] Cleared device list for new scan');

			// Notify clients that scan is starting
			broadcastMessage({
				type: 'scan-started'
			});
		} else {
			// Notify clients that scan is stopping
			broadcastMessage({
				type: 'scan-stopped'
			});
		}

		const command = `scan ${state ? 'on' : 'off'}`;
		const output = await sendCommand(command);
		res.json({ success: true, command, output });
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
		res.json({ success: true, command: `trust ${mac}`, output });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

app.post('/api/connect', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const output = await sendCommand(`connect ${mac}`);

		// Update device connection status
		const device = currentDevices.find(d => d.mac === mac);
		if (device) {
			device.is_connected = true;
			connectedDeviceMac = mac;

			// Broadcast connection status to all clients
			broadcastMessage({
				type: 'device-connected',
				device: device
			});
		}

		res.json({
			success: true,
			command: `connect ${mac}`,
			output,
			device: device || { mac, name: 'Unknown', rssi: -70, is_connected: true }
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

		// Update device connection status
		const device = currentDevices.find(d => d.mac === mac);
		if (device) {
			device.is_connected = false;

			// Broadcast disconnection status to all clients
			broadcastMessage({
				type: 'device-disconnected',
				device: device
			});
		}
		if (mac === connectedDeviceMac) {
			connectedDeviceMac = null;
		}

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
		devices_count: currentDevices.length
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
		devices_count: currentDevices.length,
		connected_device: connectedDeviceMac ? currentDevices.find(d => d.mac === connectedDeviceMac) : null
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
	server.close(() => {
		process.exit(0);
	});
});
