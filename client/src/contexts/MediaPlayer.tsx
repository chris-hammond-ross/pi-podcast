/**
 * Media Player Context
 * Provides media playback state and controls to the entire app
 * with real-time WebSocket updates
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { getWebSocketService, type ServerMessage, type MediaCurrentEpisode } from '../services/websocket';
import * as mediaApi from '../services/mediaPlayer';

export interface MediaPlayerContextValue {
	// State
	isPlaying: boolean;
	isPaused: boolean;
	isLoading: boolean;
	position: number;
	duration: number;
	volume: number;
	currentEpisode: MediaCurrentEpisode | null;
	mpvConnected: boolean;
	error: string | null;

	// Computed
	progress: number; // 0-100

	// Actions
	play: (episodeId: number) => Promise<void>;
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	togglePlayPause: () => Promise<void>;
	stop: () => Promise<void>;
	seekTo: (position: number) => Promise<void>;
	seekRelative: (offset: number) => Promise<void>;
	setVolume: (volume: number) => Promise<void>;
	refreshStatus: () => Promise<void>;
}

const MediaPlayerContext = createContext<MediaPlayerContextValue | null>(null);

export function MediaPlayerProvider({ children }: { children: ReactNode; }) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(100);
	const [currentEpisode, setCurrentEpisode] = useState<MediaCurrentEpisode | null>(null);
	const [mpvConnected, setMpvConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const unsubscribeRef = useRef<(() => void) | null>(null);
	const serviceRef = useRef(getWebSocketService());
	const initializedRef = useRef(false);

	// Computed progress percentage
	const progress = duration > 0 ? (position / duration) * 100 : 0;

	// Connect to WebSocket and subscribe - only once on mount
	useEffect(() => {
		// Prevent double initialization in React strict mode
		if (initializedRef.current) {
			return;
		}
		initializedRef.current = true;

		const service = serviceRef.current;
		let mounted = true;

		// Handle WebSocket messages
		const handleMessage = (message: ServerMessage) => {
			if (!mounted) return;

			switch (message.type) {
				case 'media:status':
					setIsPlaying(message.isPlaying ?? false);
					setIsPaused(message.isPaused ?? false);
					setPosition(message.position ?? 0);
					setDuration(message.duration ?? 0);
					setVolumeState(message.volume ?? 100);
					setCurrentEpisode(message.currentEpisode ?? null);
					setMpvConnected(message.mpvConnected ?? false);
					setIsLoading(false);
					break;

				case 'media:time-update':
					setPosition(message.position ?? 0);
					if (message.duration !== undefined) {
						setDuration(message.duration);
					}
					break;

				case 'media:volume-change':
					setVolumeState(message.volume ?? 100);
					break;

				case 'media:track-changed':
					if (message.episode) {
						setCurrentEpisode(message.episode);
						setIsPlaying(true);
						setIsPaused(false);
						if (message.episode.duration) {
							setDuration(message.episode.duration);
						}
					}
					break;

				case 'media:completed':
					setCurrentEpisode(null);
					setIsPlaying(false);
					setIsPaused(false);
					setPosition(0);
					setDuration(0);
					break;

				case 'media:error':
					setError(message.error ?? 'An error occurred');
					setIsPlaying(false);
					setIsPaused(false);
					break;

				case 'media:disconnected':
					setMpvConnected(false);
					setIsPlaying(false);
					setIsPaused(false);
					setCurrentEpisode(null);
					break;
			}
		};

		const setup = async () => {
			try {
				// Subscribe to messages
				const unsubscribe = service.on(handleMessage);
				unsubscribeRef.current = unsubscribe;

				// Connect if not already
				if (!service.isConnected()) {
					await service.connect();
				}

				// Request media status - the server will broadcast it
				if (mounted) {
					service.send({ type: 'request-media-status' });
				}

				// Also fetch via API as backup after a delay
				setTimeout(async () => {
					if (mounted) {
						try {
							const status = await mediaApi.getMediaStatus();
							if (mounted) {
								setIsPlaying(status.isPlaying);
								setIsPaused(status.isPaused);
								setPosition(status.position);
								setDuration(status.duration);
								setVolumeState(status.volume);
								setCurrentEpisode(status.currentEpisode);
								setMpvConnected(status.mpvConnected);
								setIsLoading(false);
							}
						} catch {
							if (mounted) {
								setIsLoading(false);
							}
						}
					}
				}, 2000);
			} catch (err) {
				if (mounted) {
					setError(err instanceof Error ? err.message : 'Failed to connect');
					setIsLoading(false);
				}
			}
		};

		setup();

		return () => {
			mounted = false;
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
				unsubscribeRef.current = null;
			}
		};
	}, []); // Empty dependency array - only run once

	// Helper to refresh status from API
	const fetchAndUpdateStatus = useCallback(async () => {
		try {
			const status = await mediaApi.getMediaStatus();
			setIsPlaying(status.isPlaying);
			setIsPaused(status.isPaused);
			setPosition(status.position);
			setDuration(status.duration);
			setVolumeState(status.volume);
			setCurrentEpisode(status.currentEpisode);
			setMpvConnected(status.mpvConnected);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh status');
		}
	}, []);

	// Actions
	const play = useCallback(async (episodeId: number) => {
		setError(null);
		try {
			await mediaApi.playEpisode(episodeId);
			// Status will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to play episode';
			setError(message);
			throw err;
		}
	}, []);

	const pause = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.togglePause();
			// Status will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to pause';
			setError(message);
			throw err;
		}
	}, []);

	const resume = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.resumePlayback();
			// Status will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to resume';
			setError(message);
			throw err;
		}
	}, []);

	const togglePlayPause = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.togglePause();
			// Status will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to toggle playback';
			setError(message);
			throw err;
		}
	}, []);

	const stop = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.stopPlayback();
			// Status will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to stop';
			setError(message);
			throw err;
		}
	}, []);

	const seekTo = useCallback(async (pos: number) => {
		setError(null);
		try {
			await mediaApi.seekTo(pos);
			// Position will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to seek';
			setError(message);
			throw err;
		}
	}, []);

	const seekRelative = useCallback(async (offset: number) => {
		setError(null);
		try {
			await mediaApi.seekRelative(offset);
			// Position will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to seek';
			setError(message);
			throw err;
		}
	}, []);

	const setVolume = useCallback(async (vol: number) => {
		setError(null);
		try {
			await mediaApi.setVolume(vol);
			// Volume will be updated via WebSocket
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to set volume';
			setError(message);
			throw err;
		}
	}, []);

	const refreshStatus = useCallback(async () => {
		await fetchAndUpdateStatus();
	}, [fetchAndUpdateStatus]);

	const value: MediaPlayerContextValue = {
		// State
		isPlaying,
		isPaused,
		isLoading,
		position,
		duration,
		volume,
		currentEpisode,
		mpvConnected,
		error,
		// Computed
		progress,
		// Actions
		play,
		pause,
		resume,
		togglePlayPause,
		stop,
		seekTo,
		seekRelative,
		setVolume,
		refreshStatus
	};

	return (
		<MediaPlayerContext.Provider value={value}>
			{children}
		</MediaPlayerContext.Provider>
	);
}

export function useMediaPlayer(): MediaPlayerContextValue {
	const context = useContext(MediaPlayerContext);
	if (!context) {
		throw new Error('useMediaPlayer must be used within a MediaPlayerProvider');
	}
	return context;
}
