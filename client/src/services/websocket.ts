/**
 * WebSocket Service for real-time updates
 * Manages WebSocket connection lifecycle and message handling
 */

import type { BluetoothDevice } from './bluetooth';
import type { CpuInfo, MemoryInfo, DiskInfo } from './system';

// Message types from server
export type ServerMessageType =
	// Bluetooth messages
	| 'device-found'
	| 'device-connected'
	| 'device-disconnected'
	| 'device-removed'
	| 'device-updated'
	| 'devices-list'
	| 'system-status'
	| 'bluetooth-power-changed'
	| 'scan-started'
	| 'scan-stopped'
	| 'output'
	| 'pong'
	// Download messages
	| 'download:processor-started'
	| 'download:processor-stopped'
	| 'download:processor-paused'
	| 'download:processor-resumed'
	| 'download:queue-empty'
	| 'download:queue-status'
	| 'download:started'
	| 'download:progress'
	| 'download:completed'
	| 'download:failed'
	| 'download:retry'
	// Media player messages
	| 'media:status'
	| 'media:time-update'
	| 'media:volume-change'
	| 'media:track-changed'
	| 'media:episode-completed'
	| 'media:error'
	| 'media:disconnected'
	| 'media:queue-update'
	| 'media:queue-finished'
	// System messages
	| 'system:stats';

// Download-related types
export interface DownloadQueueItem {
	id: number;
	episode_id: number;
	status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
	progress: number;
	error_message?: string;
	retry_count: number;
	priority: number;
	created_at: number;
	started_at?: number;
	completed_at?: number;
	episode_title?: string;
	audio_url?: string;
	audio_length?: number;
	subscription_id?: number;
	subscription_name?: string;
}

export interface DownloadQueueCounts {
	total: number;
	pending: number;
	downloading: number;
	completed: number;
	failed: number;
	cancelled: number;
}

export interface DownloadQueueStatus {
	counts: DownloadQueueCounts;
	activeItems: DownloadQueueItem[];
	isActive: boolean;
}

export interface DownloadProgressData {
	queueId: number;
	episodeId: number;
	title: string;
	downloadedBytes: number;
	totalBytes: number;
	percent: number;
}

export interface DownloadEventData {
	queueId: number;
	episodeId: number;
	title: string;
	subscriptionName?: string;
	totalBytes?: number;
	filePath?: string;
	fileSize?: number;
	error?: string;
	retryCount?: number;
	maxRetries?: number;
}

// Media player-related types
export interface MediaCurrentEpisode {
	id: number;
	title: string;
	subscription_id: number;
	duration?: number;
}

export interface MediaQueueItem {
	index: number;
	episodeId: number;
	title: string;
	subscription_id: number;
	pub_date: string;
	duration: string;
	isPlaying: boolean;
}

export interface MediaStatusData {
	isPlaying: boolean;
	isPaused: boolean;
	position: number;
	duration: number;
	volume: number;
	currentEpisode: MediaCurrentEpisode | null;
	queuePosition: number;
	queueLength: number;
	mpvConnected: boolean;
}

export interface MediaTimeUpdateData {
	position: number;
	duration: number;
	episodeId: number;
}

export interface MediaVolumeChangeData {
	volume: number;
}

export interface MediaTrackChangedData {
	episode: MediaCurrentEpisode;
	queuePosition: number;
	queueLength: number;
}

export interface MediaCompletedData {
	episodeId: number;
}

export interface MediaErrorData {
	error: string;
}

export interface MediaQueueUpdateData {
	items: MediaQueueItem[];
	currentIndex: number;
	length: number;
}

// System stats-related types
export interface SystemStatsData {
	os: string;
	timestamp: number;
	cpu: CpuInfo;
	memory: MemoryInfo;
	disk: DiskInfo;
	temperature: number | null;
	uptime: string;
}

export interface ServerMessage {
	type: ServerMessageType;
	// Bluetooth fields
	device?: BluetoothDevice;
	devices?: BluetoothDevice[];
	mac?: string;
	bluetooth_connected?: boolean;
	bluetooth_powered?: boolean;
	powered?: boolean;
	devices_count?: number;
	connected_device?: BluetoothDevice | null;
	is_scanning?: boolean;
	data?: string;
	// Download fields
	isRunning?: boolean;
	isPaused?: boolean;
	currentDownload?: {
		queueId: number;
		episodeId: number;
		title: string;
		subscriptionName: string;
	} | null;
	queue?: DownloadQueueStatus;
	counts?: DownloadQueueCounts;
	activeItems?: DownloadQueueItem[];
	isActive?: boolean;
	// Download event fields
	queueId?: number;
	episodeId?: number;
	title?: string;
	subscriptionName?: string;
	totalBytes?: number;
	downloadedBytes?: number;
	percent?: number;
	filePath?: string;
	fileSize?: number;
	error?: string;
	retryCount?: number;
	maxRetries?: number;
	// Media player fields
	isPlaying?: boolean;
	position?: number;
	duration?: number;
	volume?: number;
	currentEpisode?: MediaCurrentEpisode | null;
	mpvConnected?: boolean;
	episode?: MediaCurrentEpisode;
	queuePosition?: number;
	queueLength?: number;
	// Media queue fields
	items?: MediaQueueItem[];
	currentIndex?: number;
	length?: number;
	// System stats fields
	os?: string;
	timestamp?: number;
	cpu?: CpuInfo;
	memory?: MemoryInfo;
	disk?: DiskInfo;
	temperature?: number | null;
	uptime?: string;
}

export type MessageHandler = (message: ServerMessage) => void;

export interface WebSocketServiceConfig {
	url?: string;
	reconnectInterval?: number; // milliseconds
	maxReconnectAttempts?: number;
	heartbeatInterval?: number; // milliseconds
}

/**
 * WebSocket Service
 * Manages connection, reconnection, and message handling
 */
export class WebSocketService {
	private ws: WebSocket | null = null;
	private url: string;
	private reconnectInterval: number;
	private maxReconnectAttempts: number;
	private heartbeatInterval: number;
	private reconnectAttempts: number = 0;
	private messageHandlers: Set<MessageHandler> = new Set();
	private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private isIntentionallyClosed: boolean = false;

	constructor(config: WebSocketServiceConfig = {}) {
		// Use environment variable if set, otherwise derive from current page location
		const wsUrl = import.meta.env.VITE_WS_URL;

		if (wsUrl) {
			this.url = wsUrl;
		} else {
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const host = window.location.host;
			this.url = `${protocol}//${host}`;
		}

		if (config.url) {
			this.url = config.url;
		}

		this.reconnectInterval = config.reconnectInterval || 3000;
		this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
		this.heartbeatInterval = config.heartbeatInterval || 30000;
	}

	/**
	 * Connect to WebSocket server
	 */
	public connect(): Promise<void> {
		// If already connected, resolve immediately
		if (this.isConnected()) {
			console.log('[WebSocketService] Already connected');
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			try {
				console.log('[WebSocketService] Connecting to', this.url);
				this.ws = new WebSocket(this.url);
				this.isIntentionallyClosed = false;

				this.ws.onopen = () => {
					console.log('[WebSocketService] Connected');
					this.reconnectAttempts = 0;
					this.startHeartbeat();
					resolve();
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data);
				};

				this.ws.onerror = (event) => {
					console.error('[WebSocketService] Error:', event);
					reject(new Error('WebSocket connection error'));
				};

				this.ws.onclose = () => {
					console.log('[WebSocketService] Closed');
					this.stopHeartbeat();

					if (!this.isIntentionallyClosed) {
						this.attemptReconnect();
					}
				};
			} catch (error) {
				console.error('[WebSocketService] Connection failed:', error);
				reject(error);
			}
		});
	}

	/**
	 * Disconnect from WebSocket server
	 */
	public disconnect(): void {
		console.log('[WebSocketService] Disconnecting');
		this.isIntentionallyClosed = true;
		this.stopHeartbeat();

		if (this.reconnectTimeoutId) {
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	/**
	 * Check if connected
	 */
	public isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Subscribe to messages
	 */
	public on(handler: MessageHandler): () => void {
		this.messageHandlers.add(handler);

		// Return unsubscribe function
		return () => {
			this.messageHandlers.delete(handler);
		};
	}

	/**
	 * Send message to server
	 */
	public send(message: Record<string, unknown>): void {
		if (!this.isConnected()) {
			console.warn('[WebSocketService] Not connected, cannot send message');
			return;
		}

		try {
			this.ws?.send(JSON.stringify(message));
		} catch (error) {
			console.error('[WebSocketService] Failed to send message:', error);
		}
	}

	/**
	 * Handle incoming messages
	 */
	private handleMessage(data: string): void {
		try {
			const message: ServerMessage = JSON.parse(data);
			// Only log non-stats messages to avoid console spam
			if (message.type !== 'system:stats') {
				console.log('[WebSocketService] Message received:', message.type);
			}

			// Notify all subscribers
			this.messageHandlers.forEach((handler) => {
				try {
					handler(message);
				} catch (error) {
					console.error('[WebSocketService] Handler error:', error);
				}
			});
		} catch (error) {
			console.error('[WebSocketService] Failed to parse message:', error);
		}
	}

	/**
	 * Attempt to reconnect
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error(
				`[WebSocketService] Max reconnection attempts (${this.maxReconnectAttempts}) reached`
			);
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectInterval * this.reconnectAttempts;

		console.log(
			`[WebSocketService] Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
		);

		this.reconnectTimeoutId = setTimeout(() => {
			this.connect().catch((error) => {
				console.error('[WebSocketService] Reconnection failed:', error);
			});
		}, delay);
	}

	/**
	 * Start heartbeat (ping-pong)
	 */
	private startHeartbeat(): void {
		this.stopHeartbeat();

		this.heartbeatTimeoutId = setInterval(() => {
			if (this.isConnected()) {
				this.send({ type: 'ping' });
			}
		}, this.heartbeatInterval);
	}

	/**
	 * Stop heartbeat
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatTimeoutId) {
			clearInterval(this.heartbeatTimeoutId);
			this.heartbeatTimeoutId = null;
		}
	}
}

// Singleton instance
let instance: WebSocketService | null = null;

/**
 * Get or create WebSocket service singleton
 */
export function getWebSocketService(config?: WebSocketServiceConfig): WebSocketService {
	if (!instance) {
		instance = new WebSocketService(config);
	}
	return instance;
}

// Re-export BluetoothDevice for convenience
export type { BluetoothDevice };
