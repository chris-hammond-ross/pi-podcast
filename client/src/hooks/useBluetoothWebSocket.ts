/**
 * Hook for managing Bluetooth WebSocket real-time updates
 * Replaces polling with real-time event-driven updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getWebSocketService } from '../services/websocket';
import type { BluetoothDevice, ServerMessage } from '../services/websocket';

export interface UseBluetoothWebSocketReturn {
	// Connection state
	isConnected: boolean;
	connectionError: string | null;

	// Device data
	devices: BluetoothDevice[];
	connectedDevice: BluetoothDevice | null;

	// Scanning state
	isScanning: boolean;

	// System state
	bluetoothConnected: boolean;
	bluetoothPowered: boolean;

	// Loading state - true until we receive initial system-status
	isLoading: boolean;

	// Error handling
	error: string | null;
}

/**
 * Hook for real-time Bluetooth updates via WebSocket
 * Automatically connects on mount and disconnects on unmount
 */
export function useBluetoothWebSocket(): UseBluetoothWebSocketReturn {
	const [isConnected, setIsConnected] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [bluetoothConnected, setBluetoothConnected] = useState(false);
	const [bluetoothPowered, setBluetoothPowered] = useState(true); // Optimistic default
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const serviceRef = useRef(getWebSocketService());

	// Handle incoming messages
	const handleMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case 'device-found':
				if (message.device) {
					const newDevice = message.device;
					setDevices((prev) => {
						const exists = prev.find((d) => d.mac === newDevice.mac);
						if (!exists) {
							return [...prev, newDevice];
						}
						// Update existing device
						return prev.map((d) => d.mac === newDevice.mac ? { ...d, ...newDevice } : d);
					});
				}
				break;

			case 'device-connected':
				if (message.device) {
					const connectedDev = message.device;
					setConnectedDevice(connectedDev);
					setDevices((prev) =>
						prev.map((d) =>
							d.mac === connectedDev.mac
								? { ...d, is_connected: true, is_online: true }
								: d
						)
					);
				}
				break;

			case 'device-disconnected':
				if (message.device) {
					const disconnectedDev = message.device;
					setConnectedDevice(null);
					setDevices((prev) =>
						prev.map((d) =>
							d.mac === disconnectedDev.mac
								? { ...d, is_connected: false }
								: d
						)
					);
				}
				break;

			case 'device-removed':
				if (message.mac) {
					setDevices((prev) => prev.filter((d) => d.mac !== message.mac));
					if (connectedDevice?.mac === message.mac) {
						setConnectedDevice(null);
					}
				}
				break;

			case 'device-updated':
				if (message.device) {
					const updatedDev = message.device;
					setDevices((prev) =>
						prev.map((d) =>
							d.mac === updatedDev.mac ? { ...d, ...updatedDev } : d
						)
					);
					// If the updated device was connected and is now offline, clear connected device
					if (connectedDevice?.mac === updatedDev.mac && !updatedDev.is_connected) {
						setConnectedDevice(null);
					}
				}
				break;

			case 'devices-list':
				if (message.devices) {
					setDevices(message.devices);
					// Find connected device from list
					const connected = message.devices.find((d) => d.is_connected);
					setConnectedDevice(connected || null);
				}
				break;

			case 'system-status':
				setBluetoothConnected(message.bluetooth_connected ?? false);
				setBluetoothPowered(message.bluetooth_powered ?? true);
				setConnectedDevice(message.connected_device || null);
				setIsScanning(message.is_scanning ?? false);
				setIsLoading(false); // We've received initial state
				break;

			case 'bluetooth-power-changed':
				setBluetoothPowered(message.powered ?? false);
				setIsScanning(message.is_scanning ?? false);
				if (!message.powered) {
					// Clear devices when Bluetooth is turned off
					setDevices([]);
					setConnectedDevice(null);
				}
				break;

			case 'scan-started':
				setIsScanning(true);
				break;

			case 'scan-stopped':
				setIsScanning(false);
				break;

			case 'output':
				// Raw command output - can be logged or ignored
				// console.log('[BluetoothOutput]', message.data);
				break;

			case 'pong':
				// Heartbeat response - no action needed
				break;

			default:
				console.warn('[useBluetoothWebSocket] Unknown message type:', message.type);
		}
	}, [connectedDevice]);

	// Connect to WebSocket on mount
	useEffect(() => {
		const service = serviceRef.current;
		let connecting = true;

		const connect = async () => {
			try {
				setConnectionError(null);
				setIsLoading(true);
				await service.connect();
				if (connecting) {
					setIsConnected(true);
					setError(null);

					// Subscribe to messages
					const unsubscribe = service.on(handleMessage);
					unsubscribeRef.current = unsubscribe;
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to connect to WebSocket';
				if (connecting) {
					setConnectionError(message);
					setIsConnected(false);
					setError(message);
					setIsLoading(false);
				}
			}
		};

		connect();

		return () => {
			connecting = false;
			// Unsubscribe from messages
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
				unsubscribeRef.current = null;
			}
			// Note: Don't disconnect service here - it may be used elsewhere
			// The service will handle reconnection automatically
		};
	}, [handleMessage]);

	return {
		isConnected,
		connectionError,
		devices,
		connectedDevice,
		isScanning,
		bluetoothConnected,
		bluetoothPowered,
		isLoading,
		error,
	};
}
