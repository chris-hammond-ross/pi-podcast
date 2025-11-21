/**
 * Hook for checking Bluetooth connection status
 * Polls the API at regular intervals
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getBluetoothStatus } from '../services';
import type { BluetoothDevice, StatusResponse } from '../services';

export interface UseBluetoothStatusReturn {
	isConnected: boolean;
	device: BluetoothDevice | null;
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

interface UseBluetoothStatusOptions {
	pollInterval?: number; // in milliseconds, set to 0 to disable polling
	enabled?: boolean; // whether to enable polling on mount
}

export function useBluetoothStatus(options: UseBluetoothStatusOptions = {}): UseBluetoothStatusReturn {
	const { pollInterval = 5000, enabled = true } = options;
	const [isConnected, setIsConnected] = useState(false);
	const [device, setDevice] = useState<BluetoothDevice | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fetchStatus = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response: StatusResponse = await getBluetoothStatus();
			setIsConnected(response.is_connected);
			setDevice(response.device);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to get status';
			setError(message);
			setIsConnected(false);
			setDevice(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const refetch = useCallback(async () => {
		await fetchStatus();
	}, [fetchStatus]);

	// Set up polling
	useEffect(() => {
		if (!enabled) return;

		// Initial fetch
		fetchStatus();

		// Set up polling if interval is greater than 0
		if (pollInterval > 0) {
			const poll = () => {
				pollTimeoutRef.current = setTimeout(async () => {
					await fetchStatus();
					poll();
				}, pollInterval);
			};

			poll();
		}

		return () => {
			if (pollTimeoutRef.current) {
				clearTimeout(pollTimeoutRef.current);
			}
		};
	}, [enabled, pollInterval, fetchStatus]);

	return {
		isConnected,
		device,
		isLoading,
		error,
		refetch,
	};
}
