const express = require('express');
const http = require('http');
const path = require('path');
const { initializeDatabase, closeDatabase } = require('./config/database');
const { PORT } = require('./config/constants');
const corsMiddleware = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const { initializeWebSocket } = require('./websocket');
const { bluetoothService } = require('./services');
const { getHealth } = require('./utils/health');

const app = express();
const server = http.createServer(app);

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

// Initialize WebSocket
initializeWebSocket(server);

// Start server
server.listen(PORT, () => {
	console.log(`[server] Listening on http://localhost:${PORT}`);
	console.log('[server] Starting Bluetooth initialization...');
	bluetoothService.initialize();
});

// Cleanup on exit
process.on('SIGINT', () => {
	console.log('[server] Shutting down...');
	bluetoothService.cleanup();
	closeDatabase();
	server.close(() => {
		process.exit(0);
	});
});

process.on('SIGTERM', () => {
	console.log('[server] Shutting down...');
	bluetoothService.cleanup();
	closeDatabase();
	server.close(() => {
		process.exit(0);
	});
});
