/**
 * Global error handling middleware
 * Catches any errors that occur in routes and returns a consistent error response
 */
function errorHandler(err, req, res, next) {
	console.error('[error]', err);

	// Default error
	let status = 500;
	let message = 'Internal server error';

	// Handle specific error types
	if (err.name === 'ValidationError') {
		status = 400;
		message = err.message;
	} else if (err.name === 'UnauthorizedError') {
		status = 401;
		message = 'Unauthorized';
	} else if (err.message) {
		message = err.message;
	}

	res.status(status).json({
		success: false,
		error: message,
		...(process.env.NODE_ENV === 'development' && { stack: err.stack })
	});
}

module.exports = errorHandler;
