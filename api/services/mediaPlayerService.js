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
	}

	/**
	 * Add an episode to the end of the queue
	 * @param {number} episodeId - Episode ID to add
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addToQueue(episodeId) {
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
		// If nothing is playing, use 'append-play' to start playback
		const isIdle = this.queue.length === 1 && !this.isPlaying;
		const mode = isIdle ? 'append-play' : 'append';
		
		await this.sendCommand(['loadfile', episode.file_path, mode]);

		if (isIdle) {
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
	 * @returns {Promise<Object>} Result with queue info
	 */
	async addMultipleToQueue(episodeIds) {
		const added = [];
		const errors = [];

		for (const episodeId of episodeIds) {
			try {
				await this.addToQueue(episodeId);
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

		return { success: true };
	}

	/**
	 * Play previous episode in queue
	 * @returns {Promise<Object>} Result
	 */
	async playPrevious() {
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

		return { success: true };
	}

	/**
	 * Jump to a specific position in the queue
	 * @param {number} index - Queue index to play
	 * @returns {Promise<Object>} Result
	 */
	async playQueueIndex(index) {
		if (index < 0 || index >= this.queue.length) {
			throw new Error('Invalid queue index');
		}

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
		}

		// Set MPV playlist position
		await this.setProperty('playlist-pos', index);

		return { success: true };
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
	 * Clear the entire queue and stop playback
	 * @returns {Promise<Object>} Result
	 */
	async clearQueue() {
		console.log('[media] Clearing queue');

		// Save current position
		if (this.currentEpisode) {
			await this.saveCurrentPosition();
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
	 * Broadcast current queue to all clients
	 */
	broadcastQueue() {
		this.broadcast({
			type: 'media:queue-update',
			...this.getQueue()
		});
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
