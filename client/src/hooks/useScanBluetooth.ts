/**
 * Hook for managing Bluetooth device scanning
 */

import { useState, useCallback } from 'react';
import { setScan, getBluetoothDevices } from '../services';
import type { BluetoothDevice, DevicesResponse } from '../services';

export interface UseScanBluetoothReturn {
	devices: BluetoothDevice[];
	isScanning: boolean;
	error: string | null;
	scan: () => Promise<void>;
}

export function useScanBluetooth(): UseScanBluetoothReturn {
	const [devices, setDevices] = useState<BluetoothDevice[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const scan = useCallback(async () => {
		setIsScanning(true);
		setError(null);

		try {
			// Start the scan on the backend
			await setScan(true);
			
			// Get the current list of discovered devices
			const response: DevicesResponse = await getBluetoothDevices();
			setDevices(response.devices);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to scan devices';
			setError(message);
			setDevices([]);
		} finally {
			setIsScanning(false);
		}
	}, []);

	return {
		devices,
		isScanning,
		error,
		scan,
	};
}
