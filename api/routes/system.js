const express = require('express');
const router = express.Router();
const { systemService } = require('../services');

/**
 * POST /api/system/restart
 * Restart the pi-podcast and pulseaudio services
 */
router.post('/restart', async (req, res) => {
	try {
		const result = await systemService.restartServices();
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

module.exports = router;
