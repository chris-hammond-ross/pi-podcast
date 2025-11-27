/**
 * WebSocket Service for real-time Bluetooth updates
 * Manages WebSocket connection lifecycle and message handling
 */

import type { BluetoothDevice } from './bluetooth';

// Message types from server
export type ServerMessageType = 
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
  | 'pong';

export interface ServerMessage {
	type: ServerMessageType;
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
		// Determine WebSocket URL based on current page location
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		this.url = config.url || `${protocol}//${host}`;
		
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
			console.log('[WebSocketService] Message received:', message.type);
			
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
