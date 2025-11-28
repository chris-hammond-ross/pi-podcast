const cors = require('cors');

/**
 * CORS middleware configuration
 * Allows requests from pi-podcast.local and the Pi's IP address
 */
const corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);
		
		// List of allowed origins
		const allowedOrigins = [
			'http://pi-podcast.local',
			/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}$/,  // Any 192.168.x.x address
			/^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,  // Any 10.x.x.x address
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
	credentials: true
};

module.exports = cors(corsOptions);
