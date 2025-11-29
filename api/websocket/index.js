const WebSocket = require('ws');
const { bluetoothService, downloadProcessor, downloadQueueService } = require('../services');

/**
 * Initialize WebSocket server and set up event handlers
 * @param {http.Server} server - The HTTP server instance
 * @returns {WebSocket.Server} The WebSocket server instance
 */
function initializeWebSocket(server) {
	const wss = new WebSocket.Server({ server });

	// Broadcast helper
	const broadcast = (message) => {
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		});
	};

	// Set up broadcast callback for Bluetooth service
	bluetoothService.setBroadcastCallback(broadcast);

	// Set up download processor event handlers
	setupDownloadEvents(downloadProcessor, broadcast);

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

		// Send current download status to new client
		sendDownloadStatus(ws);

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

					// Also send download status
					sendDownloadStatus(ws);
				} else if (data.type === 'request-download-status') {
					// Client specifically requesting download status
					sendDownloadStatus(ws);
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
 * Set up download processor event handlers
 * @param {DownloadProcessor} processor - The download processor instance
 * @param {Function} broadcast - Broadcast function
 */
function setupDownloadEvents(processor, broadcast) {
	processor.on('processor:started', () => {
		broadcast({
			type: 'download:processor-started'
		});
	});

	processor.on('processor:stopped', () => {
		broadcast({
			type: 'download:processor-stopped'
		});
	});

	processor.on('processor:paused', () => {
		broadcast({
			type: 'download:processor-paused'
		});
	});

	processor.on('processor:resumed', () => {
		broadcast({
			type: 'download:processor-resumed'
		});
	});

	processor.on('queue:empty', () => {
		broadcast({
			type: 'download:queue-empty'
		});
	});

	processor.on('download:started', (data) => {
		broadcast({
			type: 'download:started',
			...data
		});
		// Also send updated queue status
		broadcastQueueStatus(broadcast);
	});

	processor.on('download:progress', (data) => {
		broadcast({
			type: 'download:progress',
			...data
		});
	});

	processor.on('download:completed', (data) => {
		broadcast({
			type: 'download:completed',
			...data
		});
		// Also send updated queue status
		broadcastQueueStatus(broadcast);
	});

	processor.on('download:failed', (data) => {
		broadcast({
			type: 'download:failed',
			...data
		});
		// Also send updated queue status
		broadcastQueueStatus(broadcast);
	});

	processor.on('download:retry', (data) => {
		broadcast({
			type: 'download:retry',
			...data
		});
	});
}

/**
 * Broadcast current queue status to all clients
 * @param {Function} broadcast - Broadcast function
 */
function broadcastQueueStatus(broadcast) {
	const status = downloadProcessor.getStatus();
	broadcast({
		type: 'download:queue-status',
		...status
	});
}

/**
 * Send download status to a specific client
 * @param {WebSocket} ws - The WebSocket client
 */
function sendDownloadStatus(ws) {
	const status = downloadProcessor.getStatus();
	sendToClient(ws, {
		type: 'download:queue-status',
		...status
	});
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
