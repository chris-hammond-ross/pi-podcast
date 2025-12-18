/**
 * System Service
 * Handles system-level operations like service restarts, reboots, and system stats
 * 
 * IMPORTANT: For this to work on the Pi, you need to add passwordless sudo
 * access for the pi-podcast user. Add this to /etc/sudoers.d/pi-podcast-restart:
 * 
 *   pi-podcast ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart pi-podcast, /usr/bin/systemctl restart pulseaudio-pi-podcast, /usr/bin/vcgencmd measure_temp, /usr/sbin/reboot
 * 
 * Create the file with: sudo visudo -f /etc/sudoers.d/pi-podcast-restart
 */

const { exec, spawn } = require('child_process');
const util = require('util');
const os = require('os');
const fs = require('fs');
const execAsync = util.promisify(exec);

const isLinux = process.platform === 'linux';

// Stats broadcasting
let broadcastCallback = null;
let statsIntervalId = null;
const STATS_INTERVAL = 2000; // Update every 2 seconds

/**
 * Set the broadcast callback for WebSocket updates
 * @param {Function} callback - The broadcast function
 */
function setBroadcastCallback(callback) {
	broadcastCallback = callback;
}

/**
 * Start broadcasting system stats
 */
function startStatsBroadcast() {
	if (statsIntervalId) {
		console.log('[systemService] Stats broadcast already running');
		return;
	}

	console.log('[systemService] Starting stats broadcast');
	statsIntervalId = setInterval(async () => {
		if (broadcastCallback) {
			const stats = await getSystemStats();
			broadcastCallback({
				type: 'system:stats',
				...stats
			});
		}
	}, STATS_INTERVAL);

	// Send initial stats immediately
	if (broadcastCallback) {
		getSystemStats().then(stats => {
			broadcastCallback({
				type: 'system:stats',
				...stats
			});
		});
	}
}

/**
 * Stop broadcasting system stats
 */
function stopStatsBroadcast() {
	if (statsIntervalId) {
		console.log('[systemService] Stopping stats broadcast');
		clearInterval(statsIntervalId);
		statsIntervalId = null;
	}
}

/**
 * Get the OS name
 */
async function getOS() {
	if (!isLinux) {
		return `${os.type()} ${os.release()}`;
	}

	try {
		const { stdout } = await execAsync('cat /etc/os-release');
		const match = stdout.match(/PRETTY_NAME="([^"]*)"/);
		return match ? match[1] : 'Unknown Linux';
	} catch (error) {
		console.error('[systemService] Failed to get OS:', error.message);
		return 'Unknown Linux';
	}
}

/**
 * Get CPU information
 */
async function getCpuInfo() {
	const cores = os.cpus().length;

	if (!isLinux) {
		// Mock data for development
		const mockFreq = 0.6 + Math.random() * 0.2;
		return {
			frequency: Math.round(mockFreq * 100) / 100,
			cores
		};
	}

	try {
		const { stdout } = await execAsync('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq');
		const freqKhz = parseInt(stdout.trim(), 10);
		const freqGhz = Math.round((freqKhz / 1000000) * 100) / 100;
		return {
			frequency: freqGhz,
			cores
		};
	} catch (error) {
		console.error('[systemService] Failed to get CPU frequency:', error.message);
		return {
			frequency: null,
			cores
		};
	}
}

/**
 * Get memory information
 */
function getMemoryInfo() {
	const totalBytes = os.totalmem();
	const freeBytes = os.freemem();
	const usedBytes = totalBytes - freeBytes;

	return {
		total: Math.round((totalBytes / 1024 / 1024 / 1024) * 100) / 100,
		used: Math.round((usedBytes / 1024 / 1024 / 1024) * 100) / 100,
		free: Math.round((freeBytes / 1024 / 1024 / 1024) * 100) / 100,
		usage_percentage: Math.round((usedBytes / totalBytes) * 1000) / 10
	};
}

/**
 * Get disk usage
 */
async function getDiskUsage() {
	if (!isLinux) {
		// Mock data for development
		return {
			total: 28.7,
			used: 8.7 + Math.random() * 0.1,
			free: 20.0,
			usage_percentage: 30.3
		};
	}

	try {
		const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
		const [total, used, free] = stdout.trim().split(' ').map(Number);

		return {
			total: Math.round((total / 1024 / 1024 / 1024) * 100) / 100,
			used: Math.round((used / 1024 / 1024 / 1024) * 100) / 100,
			free: Math.round((free / 1024 / 1024 / 1024) * 100) / 100,
			usage_percentage: Math.round((used / total) * 1000) / 10
		};
	} catch (error) {
		console.error('[systemService] Failed to get disk usage:', error.message);
		return {
			total: null,
			used: null,
			free: null,
			usage_percentage: null
		};
	}
}

/**
 * Get system temperature (Raspberry Pi specific)
 */
async function getTemperature() {
	if (!isLinux) {
		// Mock temperature for development (varies between 40-50)
		return 44.4 + Math.random() * 5;
	}

	try {
		// Try vcgencmd first (Raspberry Pi)
		const { stdout } = await execAsync('sudo /usr/bin/vcgencmd measure_temp');
		const match = stdout.match(/temp=([\d.]+)/);
		return match ? parseFloat(match[1]) : null;
	} catch (error) {
		// Fallback: try thermal zone (generic Linux)
		try {
			const { stdout } = await execAsync('cat /sys/class/thermal/thermal_zone0/temp');
			return Math.round(parseInt(stdout.trim(), 10) / 100) / 10;
		} catch (fallbackError) {
			console.error('[systemService] Failed to get temperature:', error.message);
			return null;
		}
	}
}

/**
 * Get system uptime
 */
function getUptime() {
	const uptimeSeconds = os.uptime();
	const days = Math.floor(uptimeSeconds / 86400);
	const hours = Math.floor((uptimeSeconds % 86400) / 3600);
	const minutes = Math.floor((uptimeSeconds % 3600) / 60);

	const parts = [];
	if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
	if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
	if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

	return parts.length > 0 ? parts.join(', ') : 'less than a minute';
}

/**
 * Get all system stats
 */
async function getSystemStats() {
	const [osName, cpu, disk, temperature] = await Promise.all([
		getOS(),
		getCpuInfo(),
		getDiskUsage(),
		getTemperature()
	]);

	return {
		os: osName,
		timestamp: Date.now(),
		cpu,
		memory: getMemoryInfo(),
		disk,
		temperature,
		uptime: getUptime()
	};
}

/**
 * Restart the podcast services
 * PulseAudio should restart first (audio subsystem), then the main service
 */
async function restartServices() {
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

/**
 * Reboot the system
 * This will reboot the entire Raspberry Pi
 */
async function rebootSystem() {
	if (!isLinux) {
		// Mock response for development on Windows/Mac
		console.log('[systemService] Mock reboot - not on Linux');
		return { message: 'System reboot simulated (development mode)' };
	}

	console.log('[systemService] Initiating system reboot...');

	// Spawn the reboot command as a detached process
	// This ensures the reboot happens even if the Node process exits
	const child = spawn('sudo', ['/usr/sbin/reboot'], {
		detached: true,
		stdio: 'ignore'
	});

	// Unref the child so the parent can exit independently
	child.unref();

	console.log('[systemService] Reboot command spawned');

	return { message: 'System reboot initiated' };
}

module.exports = {
	restartServices,
	rebootSystem,
	getSystemStats,
	setBroadcastCallback,
	startStatsBroadcast,
	stopStatsBroadcast
};
