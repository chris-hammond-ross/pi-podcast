/**
 * System Service
 * Handles system-level operations like service restarts
 * 
 * IMPORTANT: For this to work on the Pi, you need to add passwordless sudo
 * access for the pi-podcast user. Add this to /etc/sudoers.d/pi-podcast-restart:
 * 
 *   pi-podcast ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart pi-podcast, /usr/bin/systemctl restart pulseaudio-pi-podcast
 * 
 * Create the file with: sudo visudo -f /etc/sudoers.d/pi-podcast-restart
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * Restart the podcast services
 * PulseAudio should restart first (audio subsystem), then the main service
 */
async function restartServices() {
	const isLinux = process.platform === 'linux';

	if (!isLinux) {
		// Mock response for development on Windows/Mac
		console.log('[systemService] Mock restart - not on Linux');
		return { message: 'Services restart simulated (development mode)' };
	}

	try {
		console.log('[systemService] Restarting pulseaudio-pi-podcast...');
		await execAsync('sudo systemctl restart pulseaudio-pi-podcast');

		// Small delay to let PulseAudio initialize
		await new Promise(resolve => setTimeout(resolve, 1000));

		console.log('[systemService] Restarting pi-podcast...');
		await execAsync('sudo systemctl restart pi-podcast');

		return { message: 'Services restarted successfully' };
	} catch (error) {
		console.error('[systemService] Failed to restart services:', error.message);
		throw new Error(`Failed to restart services: ${error.message}`);
	}
}

module.exports = {
	restartServices
};
