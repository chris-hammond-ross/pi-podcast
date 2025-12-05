import { useState, useEffect, useCallback } from 'react';
import {
	getAutoPlaylists,
	type AutoPlaylist
} from '../services';

export interface UseAutoPlaylistsReturn {
	/** List of all auto playlists */
	playlists: AutoPlaylist[];
	/** Whether playlists are currently loading */
	isLoading: boolean;
	/** Error message if fetch failed */
	error: string | null;
	/** Refresh the playlists list */
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching and managing auto-generated playlists
 */
export function useAutoPlaylists(): UseAutoPlaylistsReturn {
	const [playlists, setPlaylists] = useState<AutoPlaylist[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await getAutoPlaylists();
			setPlaylists(response.playlists);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load playlists';
			setError(message);
			console.error('[useAutoPlaylists] Failed to load playlists:', err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Load playlists on mount
	useEffect(() => {
		refresh();
	}, [refresh]);

	return {
		playlists,
		isLoading,
		error,
		refresh
	};
}
