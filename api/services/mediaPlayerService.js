const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const net = require('net');
const fs = require('fs');
const path = require('path');
const {
	MPV_SOCKET_PATH,
	MPV_STARTUP_TIMEOUT,
	MPV_COMMAND_TIMEOUT,
	MPV_POSITION_SAVE_INTERVAL,
	MPV_COMPLETION_THRESHOLD
} = require('../config/constants');
const episodeService = require('./episodeService');

/**
 * Media Player Service
 * Manages MPV playback via IPC socket for podcast episode playback
 */
class MediaPlayerService extends EventEmitter {
	constructor() {
		super();

		// MPV process and socket
		this.mpvProcess = null;
		this.socket = null;
		this.socketPath = MPV_SOCKET_PATH;

		// Playback state
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;
		this.volume = 100;

		// IPC state
		this.requestId = 0;
		this.pendingRequests = new Map();
		this.inputBuffer = '';

		// Position save timer
		this.positionSaveTimer = null;

		// Broadcast callback (set by WebSocket)
		this.broadcastCallback = null;

		// Observed properties mapping (for property change events)
		this.observedProperties = new Map();
	}

	/**
	 * Set the broadcast callback for WebSocket messages
	 * @param {Function} callback - Function to broadcast messages to all clients
	 */
	setBroadcastCallback(callback) {
		this.broadcastCallback = callback;
	}

	/**
	 * Broadcast a message to all WebSocket clients
	 * @param {Object} message - The message to broadcast
	 */
	broadcast(message) {
		if (this.broadcastCallback) {
			this.broadcastCallback(message);
		}
	}

	/**
	 * Initialize the media player service
	 * Spawns MPV in idle mode and connects to IPC socket
	 */
	async initialize() {
		console.log('[media] Initializing media player service...');

		try {
			await this.startMpv();
			await this.connectSocket();
			await this.setupPropertyObservers();
			console.log('[media] Media player service initialized');
		} catch (error) {
			console.error('[media] Failed to initialize:', error.message);
			// Don't throw - allow the app to run without media player
		}
	}

	/**
	 * Start the MPV process in idle mode
	 */
	async startMpv() {
		return new Promise((resolve, reject) => {
			// Remove existing socket file if it exists
			if (fs.existsSync(this.socketPath)) {
				try {
					fs.unlinkSync(this.socketPath);
				} catch (err) {
					console.warn('[media] Could not remove existing socket:', err.message);
				}
			}

			// Ensure socket directory exists
			const socketDir = path.dirname(this.socketPath);
			if (!fs.existsSync(socketDir)) {
				fs.mkdirSync(socketDir, { recursive: true });
			}

			// Spawn MPV in idle mode with IPC socket
			const args = [
				'--idle=yes',
				'--no-video',
				`--input-ipc-server=${this.socketPath}`,
				'--audio-display=no',
				'--keep-open=yes',
				'--hr-seek=yes',
				'--ao=pulse',
				'--msg-level=all=v'  // Verbose logging for debugging
			];

			console.log('[media] Starting MPV with args:', args.join(' '));

			this.mpvProcess = spawn('mpv', args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					// Ensure PulseAudio can find the server
					PULSE_SERVER: process.env.PULSE_SERVER || 'unix:/run/pi-podcast/pulse/native',
					XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/pi-podcast'
				}
			});

			this.mpvProcess.stdout.on('data', (data) => {
				const output = data.toString().trim();
				if (output) {
					console.log('[mpv stdout]', output);
				}
			});

			this.mpvProcess.stderr.on('data', (data) => {
				const output = data.toString().trim();
				if (output) {
					// Log all stderr output for debugging
					console.log('[mpv stderr]', output);
				}
			});

			this.mpvProcess.on('error', (error) => {
				console.error('[media] MPV process error:', error.message);
				this.emit('error', { error: error.message });
				reject(error);
			});

			this.mpvProcess.on('exit', (code, signal) => {
				console.log(`[media] MPV process exited with code ${code}, signal ${signal}`);
				this.handleMpvExit();
			});

			// Wait for socket to be created
			const timeout = setTimeout(() => {
				reject(new Error('MPV startup timeout - socket not created'));
			}, MPV_STARTUP_TIMEOUT);

			const checkSocket = () => {
				if (fs.existsSync(this.socketPath)) {
					clearTimeout(timeout);
					console.log('[media] MPV socket created');
					resolve();
				} else {
					setTimeout(checkSocket, 100);
				}
			};

			checkSocket();
		});
	}

	/**
	 * Connect to the MPV IPC socket
	 */
	async connectSocket() {
		return new Promise((resolve, reject) => {
			this.socket = net.createConnection(this.socketPath);

			this.socket.on('connect', () => {
				console.log('[media] Connected to MPV IPC socket');
				resolve();
			});

			this.socket.on('data', (data) => {
				this.handleSocketData(data);
			});

			this.socket.on('error', (error) => {
				console.error('[media] Socket error:', error.message);
				reject(error);
			});

			this.socket.on('close', () => {
				console.log('[media] Socket closed');
				this.socket = null;
			});
		});
	}

	/**
	 * Handle incoming data from MPV socket
	 * @param {Buffer} data - Raw data from socket
	 */
	handleSocketData(data) {
		this.inputBuffer += data.toString();

		// Process complete JSON messages (newline-delimited)
		let newlineIndex;
		while ((newlineIndex = this.inputBuffer.indexOf('\n')) !== -1) {
			const jsonStr = this.inputBuffer.slice(0, newlineIndex);
			this.inputBuffer = this.inputBuffer.slice(newlineIndex + 1);

			if (jsonStr.trim()) {
				try {
					const message = JSON.parse(jsonStr);
					this.handleMpvMessage(message);
				} catch (err) {
					console.error('[media] Failed to parse MPV message:', err.message);
				}
			}
		}
	}

	/**
	 * Handle parsed MPV IPC message
	 * @param {Object} message - Parsed JSON message from MPV
	 */
	handleMpvMessage(message) {
		// Handle command responses
		if (message.request_id !== undefined) {
			const pending = this.pendingRequests.get(message.request_id);
			if (pending) {
				this.pendingRequests.delete(message.request_id);
				clearTimeout(pending.timeout);

				if (message.error && message.error !== 'success') {
					pending.reject(new Error(message.error));
				} else {
					pending.resolve(message.data);
				}
			}
		}

		// Handle events
		if (message.event) {
			this.handleMpvEvent(message);
		}
	}

	/**
	 * Handle MPV events
	 * @param {Object} message - Event message from MPV
	 */
	handleMpvEvent(message) {
		const { event, name, data } = message;

		switch (event) {
			case 'property-change':
				this.handlePropertyChange(name, data);
				break;

			case 'end-file':
				this.handleEndFile(message);
				break;

			case 'file-loaded':
				console.log('[media] File loaded');
				this.emit('track-loaded');
				break;

			case 'seek':
				console.log('[media] Seek event');
				break;

			case 'playback-restart':
				console.log('[media] Playback restart');
				break;

			case 'log-message':
				// Log MPV's internal log messages
				if (message.level && message.text) {
					console.log(`[mpv ${message.level}] ${message.prefix}: ${message.text}`);
				}
				break;

			default:
				// Log unknown events for debugging
				console.log('[media] Event:', event, JSON.stringify(message));
		}
	}

	/**
	 * Handle property change events from MPV
	 * @param {string} name - Property name
	 * @param {*} value - New property value
	 */
	handlePropertyChange(name, value) {
		switch (name) {
			case 'time-pos':
				if (value !== null && value !== undefined) {
					this.position = value;
					this.broadcast({
						type: 'media:time-update',
						position: this.position,
						duration: this.duration,
						episodeId: this.currentEpisode?.id
					});
				}
				break;

			case 'duration':
				if (value !== null && value !== undefined) {
					this.duration = value;
				}
				break;

			case 'pause':
				this.isPaused = value;
				this.isPlaying = !value && this.currentEpisode !== null;
				this.broadcastStatus();
				break;

			case 'volume':
				this.volume = value;
				this.broadcast({
					type: 'media:volume-change',
					volume: this.volume
				});
				break;

			case 'eof-reached':
				if (value === true) {
					this.handlePlaybackComplete();
				}
				break;
		}
	}

	/**
	 * Handle end-file event from MPV
	 * @param {Object} message - End file message
	 */
	handleEndFile(message) {
		const reason = message.reason;
		const fileError = message.file_error;

		console.log('[media] End file event:', JSON.stringify(message));
		console.log('[media] End file, reason:', reason);

		if (fileError) {
			console.error('[media] File error:', fileError);
		}

		if (reason === 'eof') {
			this.handlePlaybackComplete();
		} else if (reason === 'error') {
			const errorMsg = fileError || 'Playback error';
			console.error('[media] Playback error:', errorMsg);
			this.emit('playback-error', { error: errorMsg });
			this.broadcast({
				type: 'media:error',
				error: errorMsg
			});
		}
	}

	/**
	 * Handle playback completion
	 */
	handlePlaybackComplete() {
		console.log('[media] Playback complete');

		if (this.currentEpisode) {
			// Mark episode as completed in database
			episodeService.markAsCompleted(this.currentEpisode.id);

			this.broadcast({
				type: 'media:completed',
				episodeId: this.currentEpisode.id
			});

			this.emit('playback-complete', { episodeId: this.currentEpisode.id });
		}

		this.stopPositionSaveTimer();
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;

		this.broadcastStatus();
	}

	/**
	 * Set up property observers for real-time updates
	 */
	async setupPropertyObservers() {
		// Observe key properties
		await this.observeProperty('time-pos');
		await this.observeProperty('duration');
		await this.observeProperty('pause');
		await this.observeProperty('volume');
		await this.observeProperty('eof-reached');
	}

	/**
	 * Observe a property for changes
	 * @param {string} property - Property name to observe
	 */
	async observeProperty(property) {
		const id = this.observedProperties.size + 1;
		this.observedProperties.set(id, property);
		await this.sendCommand(['observe_property', id, property]);
	}

	/**
	 * Send a command to MPV
	 * @param {Array} command - Command array
	 * @returns {Promise<*>} Command result
	 */
	async sendCommand(command) {
		if (!this.socket) {
			throw new Error('Not connected to MPV');
		}

		return new Promise((resolve, reject) => {
			const requestId = ++this.requestId;

			const timeout = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				reject(new Error('Command timeout'));
			}, MPV_COMMAND_TIMEOUT);

			this.pendingRequests.set(requestId, { resolve, reject, timeout });

			const message = JSON.stringify({
				command,
				request_id: requestId
			}) + '\n';

			this.socket.write(message);
		});
	}

	/**
	 * Get a property value from MPV
	 * @param {string} property - Property name
	 * @returns {Promise<*>} Property value
	 */
	async getProperty(property) {
		return this.sendCommand(['get_property', property]);
	}

	/**
	 * Set a property value in MPV
	 * @param {string} property - Property name
	 * @param {*} value - Property value
	 */
	async setProperty(property, value) {
		return this.sendCommand(['set_property', property, value]);
	}

	// ===== Public Playback Methods =====

	/**
	 * Play an episode by ID
	 * @param {number} episodeId - Episode ID to play
	 * @returns {Promise<Object>} Playback result
	 */
	async playEpisode(episodeId) {
		const episode = episodeService.getEpisodeById(episodeId);

		if (!episode) {
			throw new Error('Episode not found');
		}

		if (!episode.file_path || !episode.downloaded_at) {
			throw new Error('Episode not downloaded');
		}

		if (!fs.existsSync(episode.file_path)) {
			throw new Error('Episode file not found');
		}

		console.log(`[media] Playing episode: ${episode.title}`);
		console.log(`[media] File path: ${episode.file_path}`);

		// Stop current playback if any
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		// Load the file
		await this.sendCommand(['loadfile', episode.file_path, 'replace']);

		// Set current episode
		this.currentEpisode = episode;
		this.isPlaying = true;
		this.isPaused = false;

		// Wait a moment for file to load
		await new Promise(resolve => setTimeout(resolve, 500));

		// Get duration
		try {
			this.duration = await this.getProperty('duration') || 0;
		} catch (err) {
			console.warn('[media] Could not get duration:', err.message);
		}

		// Resume from saved position if available
		if (episode.playback_position > 0 && !episode.playback_completed) {
			console.log(`[media] Resuming from position: ${episode.playback_position}s`);
			await this.seek(episode.playback_position);
		}

		// Start position save timer
		this.startPositionSaveTimer();

		// Broadcast status
		this.broadcastStatus();
		this.broadcast({
			type: 'media:track-changed',
			episode: {
				id: episode.id,
				title: episode.title,
				subscription_id: episode.subscription_id,
				duration: this.duration
			}
		});

		return {
			success: true,
			episode: {
				id: episode.id,
				title: episode.title,
				duration: this.duration,
				resumedFrom: episode.playback_position > 0 ? episode.playback_position : 0
			}
		};
	}

	/**
	 * Pause or resume playback
	 * @returns {Promise<Object>} Result with new pause state
	 */
	async togglePause() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		const newPauseState = !this.isPaused;
		await this.setProperty('pause', newPauseState);

		return { paused: newPauseState };
	}

	/**
	 * Pause playback
	 */
	async pause() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		await this.setProperty('pause', true);
	}

	/**
	 * Resume playback
	 */
	async resume() {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		await this.setProperty('pause', false);
	}

	/**
	 * Stop playback completely
	 */
	async stop() {
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		await this.sendCommand(['stop']);

		this.stopPositionSaveTimer();
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;

		this.broadcastStatus();
	}

	/**
	 * Seek to a position
	 * @param {number} position - Position in seconds (absolute)
	 */
	async seek(position) {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		await this.sendCommand(['seek', position, 'absolute']);
		this.position = position;
	}

	/**
	 * Seek relative to current position
	 * @param {number} offset - Offset in seconds (positive or negative)
	 */
	async seekRelative(offset) {
		if (!this.currentEpisode) {
			throw new Error('Nothing is playing');
		}

		await this.sendCommand(['seek', offset, 'relative']);
	}

	/**
	 * Set volume level
	 * @param {number} level - Volume level (0-100)
	 */
	async setVolume(level) {
		const clamped = Math.max(0, Math.min(100, level));
		await this.setProperty('volume', clamped);
		this.volume = clamped;
	}

	/**
	 * Get current playback status
	 * @returns {Object} Status object
	 */
	getStatus() {
		return {
			isPlaying: this.isPlaying,
			isPaused: this.isPaused,
			position: this.position,
			duration: this.duration,
			volume: this.volume,
			currentEpisode: this.currentEpisode ? {
				id: this.currentEpisode.id,
				title: this.currentEpisode.title,
				subscription_id: this.currentEpisode.subscription_id
			} : null,
			mpvConnected: this.socket !== null
		};
	}

	/**
	 * Broadcast current status to all clients
	 */
	broadcastStatus() {
		this.broadcast({
			type: 'media:status',
			...this.getStatus()
		});
	}

	// ===== Position Persistence =====

	/**
	 * Start the position save timer
	 */
	startPositionSaveTimer() {
		this.stopPositionSaveTimer();

		this.positionSaveTimer = setInterval(() => {
			this.saveCurrentPosition();
		}, MPV_POSITION_SAVE_INTERVAL);
	}

	/**
	 * Stop the position save timer
	 */
	stopPositionSaveTimer() {
		if (this.positionSaveTimer) {
			clearInterval(this.positionSaveTimer);
			this.positionSaveTimer = null;
		}
	}

	/**
	 * Save the current playback position to database
	 */
	async saveCurrentPosition() {
		if (!this.currentEpisode || this.position <= 0) {
			return;
		}

		try {
			// Check if we're near the end (mark as complete)
			if (this.duration > 0) {
				const progress = this.position / this.duration;
				if (progress >= MPV_COMPLETION_THRESHOLD) {
					episodeService.markAsCompleted(this.currentEpisode.id);
					console.log(`[media] Episode ${this.currentEpisode.id} marked as complete`);
					return;
				}
			}

			// Save current position
			episodeService.updatePlaybackPosition(this.currentEpisode.id, this.position);
		} catch (err) {
			console.error('[media] Failed to save position:', err.message);
		}
	}

	// ===== Cleanup =====

	/**
	 * Handle MPV process exit
	 */
	handleMpvExit() {
		this.stopPositionSaveTimer();
		this.socket = null;
		this.mpvProcess = null;
		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.pendingRequests.clear();

		this.broadcast({
			type: 'media:disconnected'
		});

		this.emit('mpv-exit');
	}

	/**
	 * Cleanup and shutdown the media player service
	 */
	async cleanup() {
		console.log('[media] Cleaning up media player service...');

		// Save position before shutdown
		await this.saveCurrentPosition();

		this.stopPositionSaveTimer();

		// Close socket
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}

		// Kill MPV process
		if (this.mpvProcess) {
			this.mpvProcess.kill('SIGTERM');

			// Force kill after timeout
			setTimeout(() => {
				if (this.mpvProcess) {
					this.mpvProcess.kill('SIGKILL');
				}
			}, 2000);

			this.mpvProcess = null;
		}

		// Remove socket file
		if (fs.existsSync(this.socketPath)) {
			try {
				fs.unlinkSync(this.socketPath);
			} catch (err) {
				console.warn('[media] Could not remove socket file:', err.message);
			}
		}

		console.log('[media] Media player service cleaned up');
	}

	/**
	 * Check if the service is ready for playback
	 * @returns {boolean} True if ready
	 */
	isReady() {
		return this.socket !== null && this.mpvProcess !== null;
	}

	/**
	 * Get health status
	 * @returns {Object} Health status
	 */
	getHealth() {
		return {
			status: this.isReady() ? 'ok' : 'error',
			mpvRunning: this.mpvProcess !== null,
			socketConnected: this.socket !== null
		};
	}
}

// Create singleton instance
const mediaPlayerService = new MediaPlayerService();

module.exports = mediaPlayerService;
