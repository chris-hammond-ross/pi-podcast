const express = require('express');
const router = express.Router();
const { bluetoothService } = require('../services');

/**
 * POST /api/bluetooth/init
 * Initialize Bluetooth
 */
router.post('/init', (req, res) => {
	try {
		if (!bluetoothService.isConnected) {
			bluetoothService.initialize();
		}
		res.json({ success: true, message: 'Bluetooth initialized' });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/power
 * Power Bluetooth on or off
 * Body: { state: boolean }
 */
router.post('/power', async (req, res) => {
	try {
		const { state } = req.body;
		const result = await bluetoothService.setPower(state);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/scan
 * Start or stop scanning for devices
 * Body: { state: boolean }
 */
router.post('/scan', async (req, res) => {
	try {
		const { state } = req.body;
		const result = await bluetoothService.setScan(state);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * GET /api/bluetooth/devices
 * Get all discovered devices
 */
router.get('/devices', (req, res) => {
	const devices = bluetoothService.getDevices();
	res.json({
		success: true,
		devices: devices,
		device_count: devices.length
	});
});

/**
 * POST /api/bluetooth/pair
 * Pair with a device
 * Body: { mac: string }
 */
router.post('/pair', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.pairDevice(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/trust
 * Trust a device
 * Body: { mac: string }
 */
router.post('/trust', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.trustDevice(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/connect
 * Connect to a device
 * Body: { mac: string, fullSequence?: boolean }
 */
router.post('/connect', async (req, res) => {
	try {
		const { mac, fullSequence = true } = req.body;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.connectDevice(mac, fullSequence);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/disconnect
 * Disconnect from a device
 * Body: { mac: string }
 */
router.post('/disconnect', async (req, res) => {
	try {
		const { mac } = req.body;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.disconnectDevice(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * DELETE /api/bluetooth/device/:mac
 * Remove a device
 */
router.delete('/device/:mac', async (req, res) => {
	try {
		const { mac } = req.params;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.removeDevice(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * GET /api/bluetooth/device/:mac/info
 * Get device info
 */
router.get('/device/:mac/info', async (req, res) => {
	try {
		const { mac } = req.params;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.getDeviceInfo(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * GET /api/bluetooth/device/:mac/battery
 * Get battery level for a device
 * Returns: { mac, battery: number|null, supported: boolean }
 */
router.get('/device/:mac/battery', async (req, res) => {
	try {
		const { mac } = req.params;
		if (!mac) throw new Error('MAC address required');

		const result = await bluetoothService.getBatteryLevel(mac);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * POST /api/bluetooth/command
 * Send a raw command to bluetoothctl
 * Body: { command: string }
 */
router.post('/command', async (req, res) => {
	try {
		const { command } = req.body;
		if (!command) throw new Error('Command required');

		const result = await bluetoothService.sendRawCommand(command);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

/**
 * GET /api/bluetooth/status
 * Get current connection status
 */
router.get('/status', (req, res) => {
	const status = bluetoothService.getStatus();
	res.json({ success: true, ...status });
});

module.exports = router;
