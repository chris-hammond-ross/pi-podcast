/**
 * Hook for checking Bluetooth connection status
 * Polls the API at regular intervals
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BluetoothDevice } from '../services';

export interface StatusResponse {
	success: boolean;
	is_connected: boolean;
	device: BluetoothDevice | null;
}

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

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function getBluetoothStatus(): Promise<StatusResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/status`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error('Failed to get status');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Status check failed: ${error.message}`);
		}
		throw new Error('Status check failed: Unknown error');
	}
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
