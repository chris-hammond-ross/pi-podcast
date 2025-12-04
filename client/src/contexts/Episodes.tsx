/**
 * Episodes Context
 * Provides episode caching and retrieval to the entire app
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getEpisode, type EpisodeRecord } from '../services/episodes';

export interface EpisodesContextValue {
	// State
	episodes: Map<number, EpisodeRecord>;
	isLoading: (episodeId: number) => boolean;
	error: string | null;

	// Actions
	getEpisodeById: (episodeId: number) => Promise<EpisodeRecord | null>;
	setEpisode: (episode: EpisodeRecord) => void;
	updateEpisode: (episodeId: number, updates: Partial<EpisodeRecord>) => void;
	removeEpisode: (episodeId: number) => void;
	clearCache: () => void;
}

const EpisodesContext = createContext<EpisodesContextValue | null>(null);

export function EpisodesProvider({ children }: { children: ReactNode }) {
	const [episodes, setEpisodes] = useState<Map<number, EpisodeRecord>>(new Map());
	const [loadingEpisodes, setLoadingEpisodes] = useState<Set<number>>(new Set());
	const [error, setError] = useState<string | null>(null);

	const isLoading = useCallback((episodeId: number) => {
		return loadingEpisodes.has(episodeId);
	}, [loadingEpisodes]);

	const getEpisodeById = useCallback(async (episodeId: number): Promise<EpisodeRecord | null> => {
		// Check cache first
		const cached = episodes.get(episodeId);
		if (cached) {
			return cached;
		}

		// Check if already loading
		if (loadingEpisodes.has(episodeId)) {
			// Wait for existing request
			return new Promise((resolve) => {
				const checkInterval = setInterval(() => {
					const ep = episodes.get(episodeId);
					if (ep || !loadingEpisodes.has(episodeId)) {
						clearInterval(checkInterval);
						resolve(episodes.get(episodeId) || null);
					}
				}, 100);
			});
		}

		// Mark as loading
		setLoadingEpisodes(prev => new Set(prev).add(episodeId));

		try {
			const response = await getEpisode(episodeId);
			const episode = response.episode;

			// Cache the episode
			setEpisodes(prev => {
				const newMap = new Map(prev);
				newMap.set(episodeId, episode);
				return newMap;
			});

			setError(null);
			return episode;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to fetch episode';
			setError(errorMessage);
			return null;
		} finally {
			// Remove from loading
			setLoadingEpisodes(prev => {
				const newSet = new Set(prev);
				newSet.delete(episodeId);
				return newSet;
			});
		}
	}, [episodes, loadingEpisodes]);

	const setEpisode = useCallback((episode: EpisodeRecord) => {
		setEpisodes(prev => {
			const newMap = new Map(prev);
			newMap.set(episode.id, episode);
			return newMap;
		});
	}, []);

	const updateEpisode = useCallback((episodeId: number, updates: Partial<EpisodeRecord>) => {
		setEpisodes(prev => {
			const episode = prev.get(episodeId);
			if (!episode) return prev;

			const newMap = new Map(prev);
			newMap.set(episodeId, { ...episode, ...updates });
			return newMap;
		});
	}, []);

	const removeEpisode = useCallback((episodeId: number) => {
		setEpisodes(prev => {
			const newMap = new Map(prev);
			newMap.delete(episodeId);
			return newMap;
		});
	}, []);

	const clearCache = useCallback(() => {
		setEpisodes(new Map());
		setError(null);
	}, []);

	const value: EpisodesContextValue = {
		episodes,
		isLoading,
		error,
		getEpisodeById,
		setEpisode,
		updateEpisode,
		removeEpisode,
		clearCache
	};

	return (
		<EpisodesContext.Provider value={value}>
			{children}
		</EpisodesContext.Provider>
	);
}

export function useEpisodesContext(): EpisodesContextValue {
	const context = useContext(EpisodesContext);
	if (!context) {
		throw new Error('useEpisodesContext must be used within an EpisodesProvider');
	}
	return context;
}
