const WebSocket = require('ws');
const { bluetoothService } = require('../services');

/**
 * Initialize WebSocket server and set up event handlers
 * @param {http.Server} server - The HTTP server instance
 * @returns {WebSocket.Server} The WebSocket server instance
 */
function initializeWebSocket(server) {
	const wss = new WebSocket.Server({ server });

	// Set up broadcast callback for Bluetooth service
	bluetoothService.setBroadcastCallback((message) => {
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		});
	});

	wss.on('connection', (ws) => {
		console.log('[websocket] Client connected');

		// Send initial system status to the new client
		sendToClient(ws, {
			type: 'system-status',
			bluetooth_connected: bluetoothService.isConnected,
			bluetooth_powered: bluetoothService.bluetoothPowered,
			devices_count: bluetoothService.currentDevices.length,
			connected_device: bluetoothService.connectedDeviceMac 
				? bluetoothService.currentDevices.find(d => d.mac === bluetoothService.connectedDeviceMac) 
				: null,
			is_scanning: bluetoothService.isScanning
		});

		// Send current devices list to the new client
		if (bluetoothService.currentDevices.length > 0) {
			sendToClient(ws, {
				type: 'devices-list',
				devices: bluetoothService.currentDevices
			});
		}

		ws.on('message', (message) => {
			try {
				const data = JSON.parse(message);
				console.log('[websocket] Received:', data);

				// Handle client messages
				if (data.type === 'ping') {
					sendToClient(ws, { type: 'pong' });
				} else if (data.type === 'request-status') {
					// Client is requesting current status (e.g., after reconnection)
					console.log('[websocket] Sending status on request');
					sendToClient(ws, {
						type: 'system-status',
						bluetooth_connected: bluetoothService.isConnected,
						bluetooth_powered: bluetoothService.bluetoothPowered,
						devices_count: bluetoothService.currentDevices.length,
						connected_device: bluetoothService.connectedDeviceMac 
							? bluetoothService.currentDevices.find(d => d.mac === bluetoothService.connectedDeviceMac) 
							: null,
						is_scanning: bluetoothService.isScanning
					});
					
					// Also send devices list
					if (bluetoothService.currentDevices.length > 0) {
						sendToClient(ws, {
							type: 'devices-list',
							devices: bluetoothService.currentDevices
						});
					}
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

	return wss;
}

/**
 * Send a message to a specific WebSocket client
 * @param {WebSocket} ws - The WebSocket client
 * @param {Object} message - The message to send
 */
function sendToClient(ws, message) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	}
}

module.exports = {
	initializeWebSocket
};
