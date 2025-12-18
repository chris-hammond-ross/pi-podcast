const express = require('express');
const http = require('http');
const path = require('path');
const { initializeDatabase, closeDatabase } = require('./config/database');
const { PORT } = require('./config/constants');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const { initializeWebSocket } = require('./websocket');
const { bluetoothService, downloadProcessor, mediaPlayerService, systemService } = require('./services');
const { getHealth } = require('./utils/health');

const app = express();
const server = http.createServer(app);

// Store WebSocket server reference for cleanup
let wss = null;

// Initialize database
initializeDatabase();

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', async (req, res) => {
	const deep = req.query.deep === 'true';
	const health = await getHealth({ deep });
	
	// Set appropriate status code based on health
	const statusCode = health.status === 'ok' ? 200 : 
	                   health.status === 'degraded' ? 200 : 503;
	
	res.status(statusCode).json(health);
});

// Catch-all route for React Router (SPA support)
// This must come after all API routes
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize WebSocket and store reference
wss = initializeWebSocket(server);

// Start server
server.listen(PORT, async () => {
	console.log(`[server] Listening on http://localhost:${PORT}`);

	console.log('[server] Starting Bluetooth initialization...');
	bluetoothService.initialize();

	console.log('[server] Starting download processor...');
	downloadProcessor.start();

	console.log('[server] Starting media player initialization...');
	try {
		await mediaPlayerService.initialize();
	} catch (err) {
		console.error('[server] Media player initialization failed:', err.message);
		console.log('[server] Continuing without media player - playback will not be available');
	}
});

/**
 * Graceful shutdown handler
 * Properly cleans up all resources before exiting
 */
async function shutdown(signal) {
	console.log(`[server] Received ${signal}, shutting down...`);

	// Set a hard timeout - if we can't shut down gracefully in 10 seconds, force exit
	const forceExitTimeout = setTimeout(() => {
		console.error('[server] Graceful shutdown timed out, forcing exit');
		process.exit(1);
	}, 10000);

	try {
		// 1. Stop accepting new connections
		console.log('[server] Stopping HTTP server...');
		server.close();

		// 2. Stop the stats broadcast timer (this keeps the event loop alive)
		console.log('[server] Stopping system stats broadcast...');
		systemService.stopStatsBroadcast();

		// 3. Close all WebSocket connections
		if (wss) {
			console.log('[server] Closing WebSocket connections...');
			wss.clients.forEach((client) => {
				try {
					client.terminate();
				} catch (err) {
					// Ignore errors when terminating clients
				}
			});
			wss.close();
		}

		// 4. Stop download processor
		console.log('[download] Stopping download processor...');
		downloadProcessor.stop();

		// 5. Clean up Bluetooth
		console.log('[bluetooth] Cleaning up Bluetooth service...');
		bluetoothService.cleanup();

		// 6. Clean up media player (this kills MPV and waits for it to exit)
		console.log('[media] Cleaning up media player service...');
		await mediaPlayerService.cleanup();

		// 7. Close database
		console.log('[database] Closing database connection...');
		closeDatabase();

		console.log('[server] Shutdown complete');

		// Clear the force exit timeout and exit cleanly
		clearTimeout(forceExitTimeout);
		process.exit(0);

	} catch (err) {
		console.error('[server] Error during shutdown:', err.message);
		clearTimeout(forceExitTimeout);
		process.exit(1);
	}
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
	console.error('[server] Uncaught exception:', err);
	shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('[server] Unhandled rejection at:', promise, 'reason:', reason);
});