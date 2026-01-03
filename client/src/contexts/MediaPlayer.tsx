/**
 * Media Player Context
 * Provides media playback state, queue management, and controls to the entire app
 * with real-time WebSocket updates
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { getWebSocketService, type ServerMessage, type MediaCurrentEpisode, type MediaQueueItem } from '../services/websocket';
import * as mediaApi from '../services/mediaPlayer';
import type { SortField, SortOrder } from '../services/mediaPlayer';

export interface MediaPlayerContextValue {
	// Playback State
	isPlaying: boolean;
	isPaused: boolean;
	isLoading: boolean;
	position: number;
	duration: number;
	volume: number;
	currentEpisode: MediaCurrentEpisode | null;
	mpvConnected: boolean;
	error: string | null;

	// Queue State
	queue: MediaQueueItem[];
	queuePosition: number;
	queueLength: number;

	// Computed
	progress: number; // 0-100
	hasNext: boolean;
	hasPrevious: boolean;

	// Playback Actions
	play: (episodeId: number) => Promise<void>;
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	togglePlayPause: () => Promise<void>;
	stop: () => Promise<void>;
	seekTo: (position: number) => Promise<void>;
	seekRelative: (offset: number) => Promise<void>;
	setVolume: (volume: number) => Promise<void>;

	// Queue Actions
	addToQueue: (episodeId: number) => Promise<void>;
	addMultipleToQueue: (episodeIds: number[]) => Promise<void>;
	removeFromQueue: (index: number) => Promise<void>;
	removeEpisodeFromQueue: (episodeId: number) => Promise<{ removed: boolean; wasPlaying: boolean }>;
	clearQueue: () => Promise<void>;
	moveInQueue: (from: number, to: number) => Promise<void>;
	playQueueIndex: (index: number) => Promise<void>;
	playNext: () => Promise<void>;
	playPrevious: () => Promise<void>;
	shuffleQueue: () => Promise<void>;
	sortQueue: (sortBy: SortField, order: SortOrder) => Promise<void>;

	// Utility
	refreshStatus: () => Promise<void>;
	refreshQueue: () => Promise<void>;
}

const MediaPlayerContext = createContext<MediaPlayerContextValue | null>(null);

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
	// Playback state
	const [isPlaying, setIsPlaying] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [position, setPosition] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(100);
	const [currentEpisode, setCurrentEpisode] = useState<MediaCurrentEpisode | null>(null);
	const [mpvConnected, setMpvConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Queue state
	const [queue, setQueue] = useState<MediaQueueItem[]>([]);
	const [queuePosition, setQueuePosition] = useState(-1);
	const [queueLength, setQueueLength] = useState(0);

	const unsubscribeRef = useRef<(() => void) | null>(null);
	const serviceRef = useRef(getWebSocketService());
	const initializedRef = useRef(false);

	// Computed values
	const progress = duration > 0 ? (position / duration) * 100 : 0;
	const hasNext = queuePosition < queueLength - 1;
	const hasPrevious = queuePosition > 0;

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
					setQueuePosition(message.queuePosition ?? -1);
					setQueueLength(message.queueLength ?? 0);
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
					if (message.queuePosition !== undefined) {
						setQueuePosition(message.queuePosition);
					}
					if (message.queueLength !== undefined) {
						setQueueLength(message.queueLength);
					}
					break;

				case 'media:episode-completed':
					// Episode finished, status will be updated via other messages
					break;

				case 'media:queue-finished':
					setCurrentEpisode(null);
					setIsPlaying(false);
					setIsPaused(false);
					setPosition(0);
					setDuration(0);
					setQueuePosition(-1);
					break;

				case 'media:queue-update':
					if (message.items) {
						setQueue(message.items);
					}
					if (message.currentIndex !== undefined) {
						setQueuePosition(message.currentIndex);
					}
					if (message.length !== undefined) {
						setQueueLength(message.length);
					}
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
					setQueue([]);
					setQueuePosition(-1);
					setQueueLength(0);
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

				// Request media status
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
								setQueuePosition(status.queuePosition);
								setQueueLength(status.queueLength);
								setMpvConnected(status.mpvConnected);
								setIsLoading(false);
							}

							// Also fetch queue
							const queueInfo = await mediaApi.getQueue();
							if (mounted) {
								setQueue(queueInfo.items);
								setQueuePosition(queueInfo.currentIndex);
								setQueueLength(queueInfo.length);
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
	const refreshStatus = useCallback(async () => {
		try {
			const status = await mediaApi.getMediaStatus();
			setIsPlaying(status.isPlaying);
			setIsPaused(status.isPaused);
			setPosition(status.position);
			setDuration(status.duration);
			setVolumeState(status.volume);
			setCurrentEpisode(status.currentEpisode);
			setQueuePosition(status.queuePosition);
			setQueueLength(status.queueLength);
			setMpvConnected(status.mpvConnected);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh status');
		}
	}, []);

	// Helper to refresh queue from API
	const refreshQueue = useCallback(async () => {
		try {
			const queueInfo = await mediaApi.getQueue();
			setQueue(queueInfo.items);
			setQueuePosition(queueInfo.currentIndex);
			setQueueLength(queueInfo.length);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh queue');
		}
	}, []);

	// Playback Actions
	const play = useCallback(async (episodeId: number) => {
		setError(null);
		try {
			await mediaApi.playEpisode(episodeId);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to play episode';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const pause = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.togglePause();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to pause';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const resume = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.resumePlayback();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to resume';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const togglePlayPause = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.togglePause();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to toggle playback';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const stop = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.stopPlayback();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to stop';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const seekTo = useCallback(async (pos: number) => {
		setError(null);
		try {
			await mediaApi.seekTo(pos);
			setPosition(pos);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to seek';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const seekRelative = useCallback(async (offset: number) => {
		setError(null);
		try {
			const result = await mediaApi.seekRelative(offset);
			setPosition(result.position);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to seek';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	const setVolume = useCallback(async (vol: number) => {
		setError(null);
		try {
			await mediaApi.setVolume(vol);
			setVolumeState(vol);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to set volume';
			setError(message);
			await refreshStatus();
			throw err;
		}
	}, [refreshStatus]);

	// Queue Actions
	const addToQueue = useCallback(async (episodeId: number) => {
		setError(null);
		try {
			await mediaApi.addToQueue(episodeId);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to add to queue';
			setError(message);
			await refreshQueue();
			throw err;
		}
	}, [refreshQueue]);

	const addMultipleToQueue = useCallback(async (episodeIds: number[]) => {
		setError(null);
		try {
			await mediaApi.addMultipleToQueue(episodeIds);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to add to queue';
			setError(message);
			await refreshQueue();
			throw err;
		}
	}, [refreshQueue]);

	const removeFromQueue = useCallback(async (index: number) => {
		setError(null);

		// Store previous state for rollback
		const previousQueue = queue;
		const previousLength = queueLength;
		const previousPosition = queuePosition;

		// Optimistically update state immediately
		setQueue(prev => prev.filter((_, i) => i !== index));
		setQueueLength(prev => prev - 1);

		// Adjust queue position if needed
		if (index < queuePosition) {
			setQueuePosition(prev => prev - 1);
		} else if (index === queuePosition && queuePosition >= queueLength - 1) {
			setQueuePosition(prev => Math.max(-1, prev - 1));
		}

		try {
			await mediaApi.removeFromQueue(index);
		} catch (err) {
			// Rollback on error
			setQueue(previousQueue);
			setQueueLength(previousLength);
			setQueuePosition(previousPosition);

			const message = err instanceof Error ? err.message : 'Failed to remove from queue';
			setError(message);
			throw err;
		}
	}, [queue, queueLength, queuePosition]);

	const removeEpisodeFromQueue = useCallback(async (episodeId: number): Promise<{ removed: boolean; wasPlaying: boolean }> => {
		setError(null);
		try {
			const result = await mediaApi.removeEpisodeFromQueue(episodeId);
			return { removed: result.removed, wasPlaying: result.wasPlaying };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to remove episode from queue';
			setError(message);
			await refreshQueue();
			await refreshStatus();
			throw err;
		}
	}, [refreshQueue, refreshStatus]);

	const clearQueue = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.clearQueue();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to clear queue';
			setError(message);
			await refreshStatus();
			await refreshQueue();
			throw err;
		}
	}, [refreshStatus, refreshQueue]);

	const moveInQueue = useCallback(async (from: number, to: number) => {
		setError(null);

		// Store previous state for rollback
		const previousQueue = queue;

		// Optimistically update state immediately
		setQueue(prev => {
			const newQueue = [...prev];
			const [removed] = newQueue.splice(from, 1);
			newQueue.splice(to, 0, removed);
			return newQueue;
		});

		try {
			await mediaApi.moveInQueue(from, to);
		} catch (err) {
			// Rollback on error
			setQueue(previousQueue);

			const message = err instanceof Error ? err.message : 'Failed to reorder queue';
			setError(message);
			throw err;
		}
	}, [queue]);

	const playQueueIndex = useCallback(async (index: number) => {
		setError(null);
		try {
			await mediaApi.playQueueIndex(index);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to play queue item';
			setError(message);
			await refreshStatus();
			await refreshQueue();
			throw err;
		}
	}, [refreshStatus, refreshQueue]);

	const playNext = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.playNext();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to play next';
			setError(message);
			await refreshStatus();
			await refreshQueue();
			throw err;
		}
	}, [refreshStatus, refreshQueue]);

	const playPrevious = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.playPrevious();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to play previous';
			setError(message);
			await refreshStatus();
			await refreshQueue();
			throw err;
		}
	}, [refreshStatus, refreshQueue]);

	const shuffleQueue = useCallback(async () => {
		setError(null);
		try {
			await mediaApi.shuffleQueue();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to shuffle queue';
			setError(message);
			await refreshQueue();
			throw err;
		}
	}, [refreshQueue]);

	const sortQueue = useCallback(async (sortBy: SortField, order: SortOrder) => {
		setError(null);
		try {
			await mediaApi.sortQueue(sortBy, order);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to sort queue';
			setError(message);
			await refreshQueue();
			throw err;
		}
	}, [refreshQueue]);

	const value: MediaPlayerContextValue = {
		// Playback State
		isPlaying,
		isPaused,
		isLoading,
		position,
		duration,
		volume,
		currentEpisode,
		mpvConnected,
		error,

		// Queue State
		queue,
		queuePosition,
		queueLength,

		// Computed
		progress,
		hasNext,
		hasPrevious,

		// Playback Actions
		play,
		pause,
		resume,
		togglePlayPause,
		stop,
		seekTo,
		seekRelative,
		setVolume,

		// Queue Actions
		addToQueue,
		addMultipleToQueue,
		removeFromQueue,
		removeEpisodeFromQueue,
		clearQueue,
		moveInQueue,
		playQueueIndex,
		playNext,
		playPrevious,
		shuffleQueue,
		sortQueue,

		// Utility
		refreshStatus,
		refreshQueue,
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
