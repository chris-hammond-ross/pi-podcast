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
 * Includes queue management using MPV's internal playlist
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

		// Queue state - mirrors MPV's internal playlist
		// Each item: { episodeId, episode (full data), filePath }
		this.queue = [];
		this.queuePosition = -1; // Current position in queue (-1 = nothing playing)

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

		// Operation lock to prevent race conditions
		this.operationLock = false;
		this.operationQueue = [];
	}

	/**
	 * Acquire the operation lock, waiting if necessary
	 * @param {string} operationName - Name of the operation (for logging)
	 * @returns {Promise<Function>} Release function to call when done
	 */
	async acquireLock(operationName) {
		return new Promise((resolve) => {
			const tryAcquire = () => {
				if (!this.operationLock) {
					this.operationLock = true;
					console.log(`[media] Lock acquired for: ${operationName}`);
					resolve(() => {
						this.operationLock = false;
						console.log(`[media] Lock released for: ${operationName}`);
						// Process next queued operation if any
						if (this.operationQueue.length > 0) {
							const next = this.operationQueue.shift();
							next();
						}
					});
				} else {
					console.log(`[media] Waiting for lock: ${operationName}`);
					this.operationQueue.push(tryAcquire);
				}
			};
			tryAcquire();
		});
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

			// Determine the runtime directory from environment or default
			const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR || '/run/pi-podcast';

			// PulseAudio socket path - check multiple possible locations
			const possiblePulseSockets = [
				`${xdgRuntimeDir}/pulse/native`,
				'/run/pi-podcast/pulse/native',
				`/tmp/pulse-${process.getuid()}/native`
			];

			let pulseServer = process.env.PULSE_SERVER;
			if (!pulseServer) {
				for (const socketPath of possiblePulseSockets) {
					if (fs.existsSync(socketPath)) {
						pulseServer = `unix:${socketPath}`;
						console.log(`[media] Found PulseAudio socket at: ${socketPath}`);
						break;
					}
				}
			}

			console.log(`[media] XDG_RUNTIME_DIR: ${xdgRuntimeDir}`);
			console.log(`[media] PULSE_SERVER: ${pulseServer || 'not set'}`);

			// Spawn MPV in idle mode with IPC socket
			// Use PulseAudio for audio output (configured by install.sh)
			const args = [
				'--idle=yes',
				'--no-video',
				`--input-ipc-server=${this.socketPath}`,
				'--audio-display=no',
				'--keep-open=no',        // Don't keep file open at end (allows playlist advance)
				'--keep-open-pause=no',  // Don't pause at end
				'--hr-seek=yes',
				'--ao=pulse'
			];

			console.log('[media] Starting MPV with args:', args.join(' '));

			// Build environment for MPV process
			const mpvEnv = {
				...process.env,
				XDG_RUNTIME_DIR: xdgRuntimeDir,
				HOME: process.env.HOME || '/var/lib/pi-podcast'
			};

			// Only set PULSE_SERVER if we found a socket
			if (pulseServer) {
				mpvEnv.PULSE_SERVER = pulseServer;
			}

			console.log('[media] MPV environment:', {
				XDG_RUNTIME_DIR: mpvEnv.XDG_RUNTIME_DIR,
				PULSE_SERVER: mpvEnv.PULSE_SERVER,
				HOME: mpvEnv.HOME
			});

			this.mpvProcess = spawn('mpv', args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: mpvEnv
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
		const { event, name } = message;

		switch (event) {
			case 'property-change':
				this.handlePropertyChange(name, message.data);
				break;

			case 'end-file':
				this.handleEndFile(message);
				break;

			case 'file-loaded':
				console.log('[media] File loaded');
				this.handleFileLoaded();
				break;

			case 'start-file':
				console.log('[media] Start file, playlist entry:', message.playlist_entry_id);
				break;

			case 'seek':
				console.log('[media] Seek event');
				break;

			case 'playback-restart':
				console.log('[media] Playback restart');
				break;

			case 'idle':
				console.log('[media] MPV idle');
				this.handleIdle();
				break;

			case 'log-message':
				// Log MPV's internal log messages (only errors/warnings)
				if (message.level && message.text && ['error', 'warn'].includes(message.level)) {
					console.log(`[mpv ${message.level}] ${message.prefix}: ${message.text}`);
				}
				break;

			default:
				// Only log unknown events that aren't noisy
				if (!['audio-reconfig'].includes(event)) {
					console.log('[media] Event:', event);
				}
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

			case 'playlist-pos':
				// MPV's playlist position changed
				if (value !== null && value !== undefined && value !== this.queuePosition) {
					console.log(`[media] Playlist position changed: ${this.queuePosition} -> ${value}`);
					this.handleQueuePositionChange(value);
				}
				break;

			case 'playlist-count':
				console.log(`[media] Playlist count: ${value}`);
				break;

			case 'eof-reached':
				if (value === true) {
					console.log('[media] EOF reached');
				}
				break;
		}
	}

	/**
	 * Handle file loaded event - update current episode based on queue position
	 */
	async handleFileLoaded() {
		try {
			// Get current playlist position from MPV
			const pos = await this.getProperty('playlist-pos');
			if (pos !== null && pos >= 0 && pos < this.queue.length) {
				this.queuePosition = pos;
				const queueItem = this.queue[pos];
				this.currentEpisode = queueItem.episode;

				// Get duration
				try {
					this.duration = await this.getProperty('duration') || 0;
				} catch (err) {
					console.warn('[media] Could not get duration:', err.message);
				}

				// Resume from saved position if available
				if (this.currentEpisode.playback_position > 0 && !this.currentEpisode.playback_completed) {
					console.log(`[media] Resuming from position: ${this.currentEpisode.playback_position}s`);
					await this.seek(this.currentEpisode.playback_position);
				}

				this.isPlaying = true;
				this.isPaused = false;

				// Start position save timer
				this.startPositionSaveTimer();

				console.log(`[media] Now playing: ${this.currentEpisode.title} (queue position ${pos})`);

				this.broadcastStatus();
				this.broadcastQueue();
				this.broadcast({
					type: 'media:track-changed',
					episode: {
						id: this.currentEpisode.id,
						title: this.currentEpisode.title,
						subscription_id: this.currentEpisode.subscription_id,
						duration: this.duration
					},
					queuePosition: this.queuePosition,
					queueLength: this.queue.length
				});
			}
		} catch (err) {
			console.error('[media] Error in handleFileLoaded:', err.message);
		}
	}

	/**
	 * Handle queue position change from MPV
	 * @param {number} newPosition - New position in queue
	 */
	async handleQueuePositionChange(newPosition) {
		// Save position of previous episode before changing
		if (this.currentEpisode && this.position > 0) {
			await this.saveCurrentPosition();
		}

		this.queuePosition = newPosition;

		if (newPosition >= 0 && newPosition < this.queue.length) {
			const queueItem = this.queue[newPosition];
			this.currentEpisode = queueItem.episode;
			this.position = 0;

			console.log(`[media] Queue position changed to ${newPosition}: ${this.currentEpisode.title}`);
		}
	}

	/**
	 * Handle end-file event from MPV
	 * @param {Object} message - End file message
	 */
	async handleEndFile(message) {
		const reason = message.reason;
		const fileError = message.file_error;

		console.log('[media] End file, reason:', reason);

		if (fileError) {
			console.error('[media] File error:', fileError);
		}

		if (reason === 'eof') {
			// Episode finished naturally
			if (this.currentEpisode) {
				episodeService.markAsCompleted(this.currentEpisode.id);
				this.broadcast({
					type: 'media:episode-completed',
					episodeId: this.currentEpisode.id
				});
			}
			// MPV will automatically advance to next in playlist if available
		} else if (reason === 'error') {
			const errorMsg = fileError || 'Playback error';
			console.error('[media] Playback error:', errorMsg);
			this.emit('playback-error', { error: errorMsg });
			this.broadcast({
				type: 'media:error',
				error: errorMsg
			});
		}
		// For 'stop' reason, we handle it elsewhere
	}

	/**
	 * Handle MPV entering idle state (nothing playing)
	 */
	handleIdle() {
		console.log('[media] Entered idle state - queue finished or stopped');

		this.stopPositionSaveTimer();

		// Save final position
		if (this.currentEpisode && this.position > 0) {
			this.saveCurrentPosition();
		}

		this.currentEpisode = null;
		this.isPlaying = false;
		this.isPaused = false;
		this.position = 0;
		this.duration = 0;
		this.queuePosition = -1;

		this.broadcastStatus();
		this.broadcast({
			type: 'media:queue-finished'
		});
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
		await this.observeProperty('playlist-pos');
		await this.observeProperty('playlist-count');
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

	// ===== Queue Management Methods =====

	/**
	 * Validate and get episode for queue operations
	 * @param {number} episodeId - Episode ID
	 * @returns {Object} Episode data with file path validation
	 */
	validateEpisodeForQueue(episodeId) {
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

		return episode;
	}

	/**
	 * Play an episode immediately, replacing the queue
	 * @param {number} episodeId - Episode ID to play
	 * @returns {Promise<Object>} Playback result
	 */
	async playEpisode(episodeId) {
		const releaseLock = await this.acquireLock('playEpisode');

		try {
			const episode = this.validateEpisodeForQueue(episodeId);

			console.log(`[media] Playing episode: ${episode.title}`);

			// Save current position before changing
			if (this.currentEpisode) {
				await this.saveCurrentPosition();
			}

			// Clear queue and add this episode
			this.queue = [{
				episodeId: episode.id,
				episode: episode,
				filePath: episode.file_path
			}];
			this.queuePosition = 0;

			// Load the file (replace mode clears MPV playlist and plays)
			await this.sendCommand(['loadfile', episode.file_path, 'replace']);

			// Set current episode
			this.currentEpisode = episode;
			this.isPlaying = true;
			this.isPaused = false;

			// Wait a moment for file to load
			await new Promise(resolve => setTimeout(resolve, 500));

			// Ensure playback is not paused (MPV can preserve pause state from previous playback)
			await this.setProperty('pause', false);

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

			// Broadcast status and queue update
			this.broadcastStatus();
			this.broadcastQueue();
			this.broadcast({
				type: 'media:track-changed',
				episode: {
					id: episode.id,
					title: episode.title,
					subscription_id: episode.subscription_id,
					duration: this.duration
				},
				queuePosition: 0,
				queueLength: 1
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
		} finally {
			releaseLock();
		}
	}

	/**
	 * Add an episode to the end of the queue
	 * @param {number} episodeId - Episode ID to add
	 * @param {boolean} autoPlay - Whether to auto-start playback if queue was empty (default: false)
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addToQueue(episodeId, autoPlay = false) {
		const episode = this.validateEpisodeForQueue(episodeId);

		// Check if already in queue
		if (this.queue.some(item => item.episodeId === episodeId)) {
			throw new Error('Episode already in queue');
		}

		console.log(`[media] Adding to queue: ${episode.title}`);

		// Add to our queue
		this.queue.push({
			episodeId: episode.id,
			episode: episode,
			filePath: episode.file_path
		});

		// Add to MPV playlist
		// Only use 'append-play' if autoPlay is true and queue was empty
		const wasEmpty = this.queue.length === 1 && !this.isPlaying;
		const mode = (autoPlay && wasEmpty) ? 'append-play' : 'append';

		await this.sendCommand(['loadfile', episode.file_path, mode]);

		if (autoPlay && wasEmpty) {
			this.queuePosition = 0;
		}

		this.broadcastQueue();

		return {
			success: true,
			queuePosition: this.queue.length - 1,
			queueLength: this.queue.length
		};
	}

	/**
	 * Add multiple episodes to the queue
	 * @param {number[]} episodeIds - Array of episode IDs to add
	 * @param {boolean} autoPlay - Whether to auto-start playback if queue was empty (default: false)
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addMultipleToQueue(episodeIds, autoPlay = false) {
		const added = [];
		const errors = [];

		for (const episodeId of episodeIds) {
			try {
				await this.addToQueue(episodeId, autoPlay);
				added.push(episodeId);
			} catch (err) {
				errors.push({ episodeId, error: err.message });
			}
		}

		return {
			success: true,
			added: added.length,
			errors: errors.length > 0 ? errors : undefined,
			queueLength: this.queue.length
		};
	}

	/**
	 * Play next episode in queue
	 * @returns {Promise<Object>} Result
	 */
	async playNext() {
		const releaseLock = await this.acquireLock('playNext');

		try {
			if (this.queue.length === 0) {
				throw new Error('Queue is empty');
			}

			if (this.queuePosition >= this.queue.length - 1) {
				throw new Error('Already at end of queue');
			}

			// Save current position
			if (this.currentEpisode) {
				await this.saveCurrentPosition();
			}

			// Tell MPV to play next
			await this.sendCommand(['playlist-next']);

			// Wait for MPV to process and update state
			await new Promise(resolve => setTimeout(resolve, 200));

			return { success: true };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Play previous episode in queue
	 * @returns {Promise<Object>} Result
	 */
	async playPrevious() {
		const releaseLock = await this.acquireLock('playPrevious');

		try {
			if (this.queue.length === 0) {
				throw new Error('Queue is empty');
			}

			if (this.queuePosition <= 0) {
				throw new Error('Already at start of queue');
			}

			// Save current position
			if (this.currentEpisode) {
				await this.saveCurrentPosition();
			}

			// Tell MPV to play previous
			await this.sendCommand(['playlist-prev']);

			// Wait for MPV to process and update state
			await new Promise(resolve => setTimeout(resolve, 200));

			return { success: true };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Jump to a specific position in the queue and start playing
	 * @param {number} index - Queue index to play
	 * @returns {Promise<Object>} Result
	 */
	async playQueueIndex(index) {
		const releaseLock = await this.acquireLock('playQueueIndex');

		try {
			if (index < 0 || index >= this.queue.length) {
				throw new Error('Invalid queue index');
			}

			// Save current position of previous episode
			if (this.currentEpisode) {
				await this.saveCurrentPosition();
			}

			console.log(`[media] Playing queue index ${index}`);

			// Get the episode we're about to play
			const queueItem = this.queue[index];
			const episode = queueItem.episode;

			// Update internal state immediately (don't wait for MPV events)
			this.queuePosition = index;
			this.currentEpisode = episode;
			this.position = 0;
			this.isPlaying = true;
			this.isPaused = false;

			// Set MPV playlist position
			await this.setProperty('playlist-pos', index);

			// Wait a moment for MPV to process the playlist change
			await new Promise(resolve => setTimeout(resolve, 300));

			// Ensure playback is not paused - this is critical for starting playback
			// when switching playlists or when MPV was in an idle/paused state
			await this.setProperty('pause', false);

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

			// Broadcast all updates to clients
			this.broadcastStatus();
			this.broadcastQueue();
			this.broadcast({
				type: 'media:track-changed',
				episode: {
					id: episode.id,
					title: episode.title,
					subscription_id: episode.subscription_id,
					duration: this.duration
				},
				queuePosition: this.queuePosition,
				queueLength: this.queue.length
			});

			return { success: true };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Remove an episode from the queue by index
	 * @param {number} index - Queue index to remove
	 * @returns {Promise<Object>} Result
	 */
	async removeFromQueue(index) {
		if (index < 0 || index >= this.queue.length) {
			throw new Error('Invalid queue index');
		}

		// Don't allow removing currently playing item (use skip instead)
		if (index === this.queuePosition) {
			throw new Error('Cannot remove currently playing episode. Use skip or stop instead.');
		}

		const removed = this.queue[index];
		console.log(`[media] Removing from queue: ${removed.episode.title}`);

		// Remove from MPV playlist
		await this.sendCommand(['playlist-remove', index]);

		// Remove from our queue
		this.queue.splice(index, 1);

		// Adjust queue position if needed
		if (index < this.queuePosition) {
			this.queuePosition--;
		}

		this.broadcastQueue();

		return {
			success: true,
			removed: removed.episodeId,
			queueLength: this.queue.length
		};
	}

	/**
	 * Remove an episode from the queue by episode ID
	 * This handles the case where the episode is currently playing by stopping playback first
	 * @param {number} episodeId - Episode ID to remove
	 * @returns {Promise<Object>} Result with wasPlaying flag
	 */
	async removeEpisodeFromQueue(episodeId) {
		const releaseLock = await this.acquireLock('removeEpisodeFromQueue');

		try {
			// Find the episode in the queue
			const index = this.queue.findIndex(item => item.episodeId === episodeId);

			if (index === -1) {
				// Episode not in queue - that's fine, nothing to do
				return {
					success: true,
					removed: false,
					wasPlaying: false,
					queueLength: this.queue.length
				};
			}

			const wasPlaying = index === this.queuePosition;
			const removed = this.queue[index];

			console.log(`[media] Removing episode from queue: ${removed.episode.title}, wasPlaying: ${wasPlaying}`);

			if (wasPlaying) {
				// Save current position before stopping
				if (this.currentEpisode && this.position > 0) {
					await this.saveCurrentPosition();
				}

				// Stop playback
				try {
					await this.sendCommand(['stop']);
				} catch (err) {
					console.warn('[media] Could not stop playback:', err.message);
				}

				this.stopPositionSaveTimer();
				this.currentEpisode = null;
				this.isPlaying = false;
				this.isPaused = false;
				this.position = 0;
				this.duration = 0;
			}

			// Remove from MPV playlist
			try {
				await this.sendCommand(['playlist-remove', index]);
			} catch (err) {
				console.warn('[media] Could not remove from MPV playlist:', err.message);
			}

			// Remove from our queue
			this.queue.splice(index, 1);

			// Adjust queue position
			if (wasPlaying) {
				// If there are more items in the queue after this one, we could auto-advance
				// For now, just reset to indicate nothing is playing
				this.queuePosition = -1;
			} else if (index < this.queuePosition) {
				this.queuePosition--;
			}

			this.broadcastStatus();
			this.broadcastQueue();

			return {
				success: true,
				removed: true,
				wasPlaying: wasPlaying,
				queueLength: this.queue.length
			};
		} finally {
			releaseLock();
		}
	}

	/**
	 * Clear the entire queue and stop playback
	 * @returns {Promise<Object>} Result
	 */
	async clearQueue() {
		const releaseLock = await this.acquireLock('clearQueue');

		try {
			console.log('[media] Clearing queue');

			// Save current position
			if (this.currentEpisode) {
				await this.saveCurrentPosition();
			}

			// Stop playback first (this is important - playlist-clear alone doesn't stop the current file)
			try {
				await this.sendCommand(['stop']);
			} catch (err) {
				console.warn('[media] Could not stop playback:', err.message);
			}

			// Clear MPV playlist
			await this.sendCommand(['playlist-clear']);

			// Clear our queue
			this.queue = [];
			this.queuePosition = -1;
			this.currentEpisode = null;
			this.isPlaying = false;
			this.isPaused = false;
			this.position = 0;
			this.duration = 0;

			this.stopPositionSaveTimer();
			this.broadcastStatus();
			this.broadcastQueue();

			return { success: true };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Move an item in the queue
	 * @param {number} fromIndex - Current index
	 * @param {number} toIndex - Target index
	 * @returns {Promise<Object>} Result
	 */
	async moveInQueue(fromIndex, toIndex) {
		if (fromIndex < 0 || fromIndex >= this.queue.length) {
			throw new Error('Invalid from index');
		}
		if (toIndex < 0 || toIndex >= this.queue.length) {
			throw new Error('Invalid to index');
		}
		if (fromIndex === toIndex) {
			return { success: true, queueLength: this.queue.length };
		}

		console.log(`[media] Moving queue item from ${fromIndex} to ${toIndex}`);

		// Move in MPV playlist
		await this.sendCommand(['playlist-move', fromIndex, toIndex]);

		// Move in our queue
		const [item] = this.queue.splice(fromIndex, 1);
		this.queue.splice(toIndex, 0, item);

		// Adjust queue position
		if (fromIndex === this.queuePosition) {
			this.queuePosition = toIndex;
		} else if (fromIndex < this.queuePosition && toIndex >= this.queuePosition) {
			this.queuePosition--;
		} else if (fromIndex > this.queuePosition && toIndex <= this.queuePosition) {
			this.queuePosition++;
		}

		this.broadcastQueue();

		return { success: true, queueLength: this.queue.length };
	}

	/**
	 * Shuffle the queue (excluding currently playing item)
	 * Uses Fisher-Yates shuffle algorithm
	 * @returns {Promise<Object>} Result
	 */
	async shuffleQueue() {
		const releaseLock = await this.acquireLock('shuffleQueue');

		try {
			if (this.queue.length <= 1) {
				return { success: true, queueLength: this.queue.length, message: 'Queue too short to shuffle' };
			}

			console.log('[media] Shuffling queue');

			// If something is playing, we'll shuffle everything except the current item
			// The current item stays at its position
			const currentlyPlayingIndex = this.queuePosition;
			const hasCurrentlyPlaying = currentlyPlayingIndex >= 0 && currentlyPlayingIndex < this.queue.length;

			// Extract the currently playing item if any
			let currentItem = null;
			let itemsToShuffle = [...this.queue];

			if (hasCurrentlyPlaying) {
				currentItem = itemsToShuffle.splice(currentlyPlayingIndex, 1)[0];
			}

			// Fisher-Yates shuffle
			for (let i = itemsToShuffle.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[itemsToShuffle[i], itemsToShuffle[j]] = [itemsToShuffle[j], itemsToShuffle[i]];
			}

			// Rebuild the queue with current item at position 0 (if playing)
			if (hasCurrentlyPlaying && currentItem) {
				this.queue = [currentItem, ...itemsToShuffle];
				this.queuePosition = 0;
			} else {
				this.queue = itemsToShuffle;
			}

			// Rebuild MPV playlist to match
			await this.rebuildMpvPlaylist();

			this.broadcastQueue();

			return { success: true, queueLength: this.queue.length };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Sort the queue by a specified field and order
	 * Currently playing item moves to its new sorted position
	 * @param {string} sortBy - Field to sort by: 'pub_date' or 'downloaded_at'
	 * @param {string} order - Sort order: 'asc' or 'desc'
	 * @returns {Promise<Object>} Result
	 */
	async sortQueue(sortBy = 'pub_date', order = 'asc') {
		const releaseLock = await this.acquireLock('sortQueue');

		try {
			if (this.queue.length <= 1) {
				return { success: true, queueLength: this.queue.length, message: 'Queue too short to sort' };
			}

			// Validate sortBy
			const validSortFields = ['pub_date', 'downloaded_at'];
			if (!validSortFields.includes(sortBy)) {
				throw new Error(`Invalid sort field. Must be one of: ${validSortFields.join(', ')}`);
			}

			// Validate order
			const validOrders = ['asc', 'desc'];
			if (!validOrders.includes(order.toLowerCase())) {
				throw new Error(`Invalid sort order. Must be one of: ${validOrders.join(', ')}`);
			}

			console.log(`[media] Sorting queue by ${sortBy} ${order}`);

			const isAsc = order.toLowerCase() === 'asc';

			// Sort the queue
			this.queue.sort((a, b) => {
				let valueA, valueB;

				if (sortBy === 'pub_date') {
					// pub_date is stored as ISO string
					valueA = a.episode.pub_date ? new Date(a.episode.pub_date).getTime() : 0;
					valueB = b.episode.pub_date ? new Date(b.episode.pub_date).getTime() : 0;
				} else if (sortBy === 'downloaded_at') {
					// downloaded_at is stored as unix timestamp
					valueA = a.episode.downloaded_at || 0;
					valueB = b.episode.downloaded_at || 0;
				}

				if (isAsc) {
					return valueA - valueB;
				} else {
					return valueB - valueA;
				}
			});

			// Find the new position of the currently playing episode
			if (this.currentEpisode) {
				const newPosition = this.queue.findIndex(item => item.episodeId === this.currentEpisode.id);
				if (newPosition !== -1) {
					this.queuePosition = newPosition;
				}
			}

			// Rebuild MPV playlist to match
			await this.rebuildMpvPlaylist();

			this.broadcastQueue();

			return { success: true, queueLength: this.queue.length, sortBy, order };
		} finally {
			releaseLock();
		}
	}

	/**
	 * Rebuild the MPV playlist to match our internal queue
	 * Used after shuffle/sort operations
	 */
	async rebuildMpvPlaylist() {
		// Clear MPV playlist
		await this.sendCommand(['playlist-clear']);

		// Add all items back in new order
		for (let i = 0; i < this.queue.length; i++) {
			const item = this.queue[i];
			const mode = i === 0 ? 'append' : 'append';
			await this.sendCommand(['loadfile', item.filePath, mode]);
		}

		// If we have a current position, jump to it
		if (this.queuePosition >= 0 && this.queuePosition < this.queue.length) {
			// Set the playlist position
			await this.setProperty('playlist-pos', this.queuePosition);

			// Restore playback position within the episode
			if (this.position > 0) {
				await new Promise(resolve => setTimeout(resolve, 300));
				try {
					await this.seek(this.position);
				} catch (err) {
					console.warn('[media] Could not restore position after rebuild:', err.message);
				}
			}

			// Restore pause state
			if (this.isPaused) {
				await this.setProperty('pause', true);
			}
		}
	}

	/**
	 * Get the current queue
	 * @returns {Object} Queue information
	 */
	getQueue() {
		return {
			items: this.queue.map((item, index) => ({
				index,
				episodeId: item.episodeId,
				title: item.episode.title,
				subscription_id: item.episode.subscription_id,
				pub_date: item.episode.pub_date,
				duration: item.episode.duration,
				isPlaying: index === this.queuePosition
			})),
			currentIndex: this.queuePosition,
			length: this.queue.length
		};
	}

	/**
	 * Get a page/window of the queue for virtualized display
	 * Only returns the essential data needed for rendering
	 * @param {number} offset - Starting index in the queue
	 * @param {number} limit - Maximum number of items to return
	 * @returns {Object} Queue page information
	 */
	getQueuePage(offset, limit) {
		const totalLength = this.queue.length;
		
		// Clamp offset to valid range
		const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, totalLength - 1)));
		
		// Calculate the actual slice
		const endIndex = Math.min(clampedOffset + limit, totalLength);
		const slicedItems = this.queue.slice(clampedOffset, endIndex);
		
		// Map to minimal data structure for transfer
		const items = slicedItems.map((item, i) => {
			const absoluteIndex = clampedOffset + i;
			return {
				index: absoluteIndex,
				episodeId: item.episodeId,
				title: item.episode.title,
				duration: item.episode.duration ? parseInt(item.episode.duration, 10) : undefined,
				isPlaying: absoluteIndex === this.queuePosition
			};
		});
		
		return {
			items,
			startIndex: slicedItems.length > 0 ? clampedOffset : 0,
			endIndex: slicedItems.length > 0 ? endIndex - 1 : 0,
			totalLength,
			currentIndex: this.queuePosition
		};
	}

	/**
	 * Broadcast current queue to all clients
	 * NOTE: For large queues, only sends metadata to avoid overwhelming clients
	 */
	broadcastQueue() {
		// Threshold for "large queue" - above this, only send metadata
		const LARGE_QUEUE_THRESHOLD = 200;
		
		if (this.queue.length > LARGE_QUEUE_THRESHOLD) {
			// For large queues, only send metadata (no items array)
			console.log(`[media] Broadcasting queue metadata only (${this.queue.length} items exceeds threshold of ${LARGE_QUEUE_THRESHOLD})`);
			this.broadcast({
				type: 'media:queue-update',
				items: [], // Empty array - clients should use paginated API
				currentIndex: this.queuePosition,
				length: this.queue.length
			});
		} else {
			// For small queues, send full data as before
			this.broadcast({
				type: 'media:queue-update',
				...this.getQueue()
			});
		}
	}

	// ===== Playback Control Methods =====

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
	 * Stop playback completely (keeps queue)
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
		// Note: We keep the queue intact, just stop playback

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
			queuePosition: this.queuePosition,
			queueLength: this.queue.length,
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
		this.queue = [];
		this.queuePosition = -1;
		this.pendingRequests.clear();

		this.broadcast({
			type: 'media:disconnected'
		});

		this.emit('mpv-exit');
	}

	/**
	 * Cleanup and shutdown the media player service
	 * Properly waits for MPV to exit to avoid blocking systemd shutdown
	 */
	async cleanup() {
		console.log('[media] Cleaning up media player service...');

		// Save position before shutdown
		await this.saveCurrentPosition();

		this.stopPositionSaveTimer();

		// Close socket first to stop sending commands
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}

		// Kill MPV process and wait for it to exit
		if (this.mpvProcess) {
			await new Promise((resolve) => {
				const mpv = this.mpvProcess;

				// Set up exit handler
				const onExit = () => {
					this.mpvProcess = null;
					resolve();
				};

				// If already exited, resolve immediately
				if (mpv.exitCode !== null || mpv.killed) {
					onExit();
					return;
				}

				mpv.once('exit', onExit);

				// Send SIGTERM
				console.log('[media] Sending SIGTERM to MPV...');
				mpv.kill('SIGTERM');

				// Force SIGKILL after 2 seconds if still running
				const killTimeout = setTimeout(() => {
					if (this.mpvProcess && !this.mpvProcess.killed) {
						console.log('[media] Force killing MPV with SIGKILL');
						this.mpvProcess.kill('SIGKILL');
					}
				}, 2000);

				// Safety timeout - don't wait forever (5 seconds max)
				const safetyTimeout = setTimeout(() => {
					clearTimeout(killTimeout);
					if (this.mpvProcess) {
						console.log('[media] MPV cleanup timeout, continuing anyway');
						this.mpvProcess = null;
						resolve();
					}
				}, 5000);

				// Clean up timeouts when process exits
				mpv.once('exit', () => {
					clearTimeout(killTimeout);
					clearTimeout(safetyTimeout);
				});
			});
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