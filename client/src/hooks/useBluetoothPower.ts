/**
 * Hook for managing Bluetooth power state
 */

import { useState, useCallback } from 'react';
import { setBluetoothPower } from '../services';

export interface UseBluetoothPowerReturn {
	isPowered: boolean;
	isTogglingPower: boolean;
	error: string | null;
	togglePower: () => Promise<void>;
	setPower: (state: boolean) => Promise<void>;
}

export function useBluetoothPower(): UseBluetoothPowerReturn {
	const [isPowered, setIsPowered] = useState(true); // Assume on by default
	const [isTogglingPower, setIsTogglingPower] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
	};
}
