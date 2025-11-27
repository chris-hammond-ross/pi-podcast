/**
 * Hook for managing Bluetooth device connections
 * Now supports full connection sequence (pair -> trust -> connect)
 */

import { useState, useCallback } from 'react';
import { connectDevice, disconnectDevice } from '../services';
import type { BluetoothDevice } from '../services';

export type ConnectionStatus = 'idle' | 'pairing' | 'trusting' | 'connecting' | 'connected' | 'disconnecting' | 'error';

export interface UseBluetoothConnectionReturn {
	connectedDevice: BluetoothDevice | null;
	isConnecting: boolean;
	isDisconnecting: boolean;
	connectionStatus: ConnectionStatus;
	error: string | null;
	connect: (deviceAddress: string, deviceName?: string) => Promise<void>;
	disconnect: (deviceAddress: string) => Promise<void>;
}

export function useBluetoothConnection(): UseBluetoothConnectionReturn {
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(async (deviceAddress: string, deviceName?: string) => {
		setIsConnecting(true);
		setError(null);
		setConnectionStatus('connecting');

		try {
			// The backend now handles the full sequence (pair -> trust -> connect)
			// with fullSequence: true by default
			const response = await connectDevice(deviceAddress);
			
			if (response.success) {
				setConnectedDevice({
					mac: deviceAddress,
					name: deviceName || 'Connected Device'
				});
				setConnectionStatus('connected');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to connect';
			setError(message);
			setConnectedDevice(null);
			setConnectionStatus('error');
			throw err;
		} finally {
			setIsConnecting(false);
		}
	}, []);

	const disconnect = useCallback(async (deviceAddress: string) => {
		setIsDisconnecting(true);
		setError(null);
		setConnectionStatus('disconnecting');

		try {
			const response = await disconnectDevice(deviceAddress);
			if (response.success) {
				setConnectedDevice(null);
				setConnectionStatus('idle');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to disconnect';
			setError(message);
			setConnectionStatus('error');
			throw err;
		} finally {
			setIsDisconnecting(false);
		}
	}, []);

	return {
		connectedDevice,
		isConnecting,
		isDisconnecting,
		connectionStatus,
		error,
		connect,
		disconnect,
	};
}
