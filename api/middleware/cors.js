const cors = require('cors');

/**
 * CORS middleware configuration
 * Allows requests from pi-podcast.local, local development, and the Pi's IP address
 */
const corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);
		
		// List of allowed origins
		const allowedOrigins = [
			'http://pi-podcast.local',
			'http://localhost:5173',      // Vite dev server
			'http://localhost:3000',      // Alternative dev port
			'http://127.0.0.1:5173',      // Vite dev server (IP)
			'http://127.0.0.1:3000',      // Alternative dev port (IP)
			/^http:\/\/localhost:\d+$/,   // Any localhost port
			/^http:\/\/127\.0\.0\.1:\d+$/,  // Any 127.0.0.1 port
			/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,  // Any 192.168.x.x address (with optional port)
			/^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,  // Any 10.x.x.x address (with optional port)
		];
		
		// Check if origin matches any pattern
		const isAllowed = allowedOrigins.some(pattern => {
			if (typeof pattern === 'string') {
				return origin === pattern;
			}
			if (pattern instanceof RegExp) {
				return pattern.test(origin);
			}
			return false;
		});
		
		if (isAllowed) {
			callback(null, true);
		} else {
			console.log('[cors] Blocked origin:', origin);
			callback(new Error('Not allowed by CORS'));
		}
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);
