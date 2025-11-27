/**
 * Hook for managing Bluetooth power state
 * Syncs with WebSocket updates when available
 */

import { useState, useCallback, useEffect } from 'react';
import { setBluetoothPower } from '../services';

export interface UseBluetoothPowerReturn {
	isPowered: boolean;
	isTogglingPower: boolean;
	error: string | null;
	togglePower: () => Promise<void>;
	setPower: (state: boolean) => Promise<void>;
	syncPower: (state: boolean) => void;
}

export function useBluetoothPower(): UseBluetoothPowerReturn {
	const [isPowered, setIsPowered] = useState(false); // Start false until we know the real state
	const [isTogglingPower, setIsTogglingPower] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync power state from external source (WebSocket)
	const syncPower = useCallback((state: boolean) => {
		setIsPowered(state);
	}, []);

	const setPower = useCallback(async (state: boolean) => {
		setIsTogglingPower(true);
		setError(null);

		try {
			await setBluetoothPower(state);
			setIsPowered(state);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to set Bluetooth power';
			setError(message);
		} finally {
			setIsTogglingPower(false);
		}
	}, []);

	const togglePower = useCallback(async () => {
		await setPower(!isPowered);
	}, [isPowered, setPower]);

	return {
		isPowered,
		isTogglingPower,
		error,
		togglePower,
		setPower,
		syncPower,
	};
}
