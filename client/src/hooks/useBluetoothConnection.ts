/**
 * Hook for managing Bluetooth device connections
 */

import { useState, useCallback } from 'react';
import { connectDevice, disconnectDevice } from '../services';
import type { BluetoothDevice } from '../services';

export interface UseBluetoothConnectionReturn {
	connectedDevice: BluetoothDevice | null;
	isConnecting: boolean;
	isDisconnecting: boolean;
	error: string | null;
	connect: (deviceAddress: string, deviceName?: string) => Promise<void>;
	disconnect: (deviceAddress: string) => Promise<void>;
}

export function useBluetoothConnection(): UseBluetoothConnectionReturn {
	const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(async (deviceAddress: string) => {
		setIsConnecting(true);
		setError(null);

		try {
			const response = await connectDevice(deviceAddress);
			if (response.success) {
				setConnectedDevice({
					mac: deviceAddress,
					name: 'Connected Device'
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to connect';
			setError(message);
			setConnectedDevice(null);
			throw err;
		} finally {
			setIsConnecting(false);
		}
	}, []);

	const disconnect = useCallback(async (deviceAddress: string) => {
		setIsDisconnecting(true);
		setError(null);

		try {
			const response = await disconnectDevice(deviceAddress);
			if (response.success) {
				setConnectedDevice(null);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to disconnect';
			setError(message);
			throw err;
		} finally {
			setIsDisconnecting(false);
		}
	}, []);

	return {
		connectedDevice,
		isConnecting,
		isDisconnecting,
		error,
		connect,
		disconnect,
	};
}
