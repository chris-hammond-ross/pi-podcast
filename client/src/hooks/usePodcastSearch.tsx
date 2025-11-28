/**
 * Hook for searching podcasts using iTunes API
 * Provides search functionality with loading and error states
 */
import { useState, useCallback } from 'react';
import { searchPodcasts } from '../services';
import type { Podcast } from '../services';

export interface UsePodcastSearchReturn {
	results: Podcast[];
	isSearching: boolean;
	error: string | null;
	resultCount: number;
	hasSearched: boolean;
	search: (searchTerm: string, limit?: number) => Promise<void>;
	clearResults: () => void;
}

export function usePodcastSearch(): UsePodcastSearchReturn {
	const [results, setResults] = useState<Podcast[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resultCount, setResultCount] = useState(0);
	const [hasSearched, setHasSearched] = useState(false);

	const search = useCallback(async (searchTerm: string, limit: number = 20) => {
		if (!searchTerm || searchTerm.trim().length === 0) {
			setError('Search term is required');
			return;
		}

		setIsSearching(true);
		setError(null);
		setHasSearched(true);

		try {
			const response = await searchPodcasts(searchTerm, limit);
			setResults(response.results);
			setResultCount(response.resultCount);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to search podcasts';
			setError(message);
			setResults([]);
			setResultCount(0);
		} finally {
			setIsSearching(false);
		}
	}, []);

	const clearResults = useCallback(() => {
		setResults([]);
		setResultCount(0);
		setError(null);
		setHasSearched(false);
	}, []);

	return {
		results,
		isSearching,
		error,
		resultCount,
		hasSearched,
		search,
		clearResults,
	};
}