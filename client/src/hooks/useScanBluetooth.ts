/**
 * Hook for managing Bluetooth device scanning
 */

import { useState, useCallback } from 'react';
import { scanBluetoothDevices } from '../services';
import type { BluetoothDevice, ScanResponse } from '../services';

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
			const response: ScanResponse = await scanBluetoothDevices();
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
