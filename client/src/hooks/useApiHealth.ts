/**
 * Hook for checking API availability and health
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseApiHealthReturn {
	isHealthy: boolean;
	isChecking: boolean;
	error: string | null;
	check: () => Promise<void>;
}

interface UseApiHealthOptions {
	pollInterval?: number; // in milliseconds, set to 0 to disable polling
	enabled?: boolean; // whether to enable polling on mount
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function checkApiHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${API_BASE_URL}/health`, {
			method: 'GET',
		});
		return response.ok;
	} catch {
		return false;
	}
}

export function useApiHealth(options: UseApiHealthOptions = {}): UseApiHealthReturn {
	const { pollInterval = 10000, enabled = true } = options;
	const [isHealthy, setIsHealthy] = useState(false);
	const [isChecking, setIsChecking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const check = useCallback(async () => {
		setIsChecking(true);
		setError(null);

		try {
			const healthy = await checkApiHealth();
			setIsHealthy(healthy);
			if (!healthy) {
				setError('API is not responding');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to check API health';
			setError(message);
			setIsHealthy(false);
		} finally {
			setIsChecking(false);
		}
	}, []);

	// Set up polling
	useEffect(() => {
		if (!enabled) return;

		// Initial check
		check();

		// Set up polling if interval is greater than 0
		if (pollInterval > 0) {
			const poll = () => {
				pollTimeoutRef.current = setTimeout(async () => {
					await check();
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
	}, [enabled, pollInterval, check]);

	return {
		isHealthy,
		isChecking,
		error,
		check,
	};
}
