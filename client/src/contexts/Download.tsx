/**
 * Download Context
 * Provides download state and controls to the entire app
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { getWebSocketService, type ServerMessage, type DownloadQueueItem, type DownloadQueueCounts } from '../services/websocket';
import * as downloadsApi from '../services/downloads';

export interface CurrentDownload {
	queueId: number;
	episodeId: number;
	title: string;
	subscriptionName: string;
	downloadedBytes: number;
	totalBytes: number;
	percent: number;
}

export interface DownloadContextValue {
	// State
	isRunning: boolean;
	isPaused: boolean;
	isLoading: boolean;
	currentDownload: CurrentDownload | null;
	activeItems: DownloadQueueItem[];
	counts: DownloadQueueCounts;
	isActive: boolean;
	error: string | null;

	// Actions
	start: () => Promise<void>;
	stop: () => Promise<void>;
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	cancelCurrent: () => Promise<void>;
	addToQueue: (episodeId: number, priority?: number) => Promise<void>;
	addBatchToQueue: (episodeIds: number[], priority?: number) => Promise<void>;
	queueSubscription: (subscriptionId: number, priority?: number) => Promise<void>;
	syncAndQueue: (subscriptionId: number, priority?: number) => Promise<void>;
	removeFromQueue: (queueId: number) => Promise<void>;
	cancelAll: () => Promise<void>;
	clearFinished: () => Promise<void>;
	retryDownload: (queueId: number) => Promise<void>;
	refreshStatus: () => Promise<void>;
}

const defaultCounts: DownloadQueueCounts = {
	total: 0,
	pending: 0,
	downloading: 0,
	completed: 0,
	failed: 0,
	cancelled: 0
};

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadProvider({ children }: { children: ReactNode }) {
	const [isRunning, setIsRunning] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [currentDownload, setCurrentDownload] = useState<CurrentDownload | null>(null);
	const [activeItems, setActiveItems] = useState<DownloadQueueItem[]>([]);
	const [counts, setCounts] = useState<DownloadQueueCounts>(defaultCounts);
	const [error, setError] = useState<string | null>(null);
	
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const serviceRef = useRef(getWebSocketService());
	const initializedRef = useRef(false);

	const isActive = counts.pending > 0 || counts.downloading > 0;

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
				case 'download:queue-status':
					setIsRunning(message.isRunning ?? false);
					setIsPaused(message.isPaused ?? false);
					if (message.queue) {
						setCounts(message.queue.counts);
						setActiveItems(message.queue.activeItems);
					} else if (message.counts) {
						setCounts(message.counts);
					}
					if (message.activeItems) {
						setActiveItems(message.activeItems);
					}
					// Only update currentDownload from queue-status if we don't have one
					// or if the queueId changed. Don't overwrite progress data!
					if (message.currentDownload) {
						setCurrentDownload(prev => {
							// If same download, keep progress data
							if (prev && prev.queueId === message.currentDownload!.queueId) {
								return prev;
							}
							// New download, initialize with zero progress
							return {
								queueId: message.currentDownload!.queueId,
								episodeId: message.currentDownload!.episodeId,
								title: message.currentDownload!.title,
								subscriptionName: message.currentDownload!.subscriptionName || '',
								downloadedBytes: 0,
								totalBytes: 0,
								percent: 0
							};
						});
					} else {
						// No current download in status - but only clear if we're not downloading
						setCurrentDownload(prev => {
							// Don't clear if we have an active download with progress
							if (prev && prev.percent > 0 && prev.percent < 100) {
								return prev;
							}
							return null;
						});
					}
					setIsLoading(false);
					break;

				case 'download:processor-started':
					setIsRunning(true);
					setIsPaused(false);
					break;

				case 'download:processor-stopped':
					setIsRunning(false);
					setCurrentDownload(null);
					break;

				case 'download:processor-paused':
					setIsPaused(true);
					break;

				case 'download:processor-resumed':
					setIsPaused(false);
					break;

				case 'download:started':
					setCurrentDownload({
						queueId: message.queueId!,
						episodeId: message.episodeId!,
						title: message.title!,
						subscriptionName: message.subscriptionName || '',
						downloadedBytes: 0,
						totalBytes: message.totalBytes || 0,
						percent: 0
					});
					break;

				case 'download:progress':
					setCurrentDownload(prev => {
						if (!prev || prev.queueId !== message.queueId) {
							// Create new if we somehow missed the started event
							return {
								queueId: message.queueId!,
								episodeId: message.episodeId!,
								title: message.title!,
								subscriptionName: '',
								downloadedBytes: message.downloadedBytes || 0,
								totalBytes: message.totalBytes || 0,
								percent: message.percent || 0
							};
						}
						return {
							...prev,
							downloadedBytes: message.downloadedBytes || 0,
							totalBytes: message.totalBytes || prev.totalBytes,
							percent: message.percent || 0
						};
					});
					break;

				case 'download:completed':
					setCurrentDownload(prev => {
						if (prev?.queueId === message.queueId) {
							return null;
						}
						return prev;
					});
					// Update counts to reflect completion
					setCounts(prev => ({
						...prev,
						downloading: Math.max(0, prev.downloading - 1),
						completed: prev.completed + 1
					}));
					break;

				case 'download:failed':
					setCurrentDownload(prev => {
						if (prev?.queueId === message.queueId) {
							return null;
						}
						return prev;
					});
					// Update counts to reflect failure
					setCounts(prev => ({
						...prev,
						downloading: Math.max(0, prev.downloading - 1),
						failed: prev.failed + 1
					}));
					break;

				case 'download:queue-empty':
					// Queue is empty, clear current download
					setCurrentDownload(null);
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

				// Request download status
				if (mounted) {
					service.send({ type: 'request-download-status' });
				}

				// Also fetch via API as backup after a delay
				setTimeout(async () => {
					if (mounted) {
						try {
							const status = await downloadsApi.getDownloadStatus();
							if (mounted) {
								setIsRunning(status.isRunning);
								setIsPaused(status.isPaused);
								setCounts(status.queue.counts);
								setActiveItems(status.queue.activeItems);
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
			const status = await downloadsApi.getDownloadStatus();
			setIsRunning(status.isRunning);
			setIsPaused(status.isPaused);
			setCounts(status.queue.counts);
			setActiveItems(status.queue.activeItems);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh');
		}
	}, []);

	// Actions
	const start = useCallback(async () => {
		try {
			await downloadsApi.startDownloads();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start');
		}
	}, []);

	const stop = useCallback(async () => {
		try {
			await downloadsApi.stopDownloads();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stop');
		}
	}, []);

	const pause = useCallback(async () => {
		try {
			await downloadsApi.pauseDownloads();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to pause');
		}
	}, []);

	const resume = useCallback(async () => {
		try {
			await downloadsApi.resumeDownloads();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to resume');
		}
	}, []);

	const cancelCurrent = useCallback(async () => {
		try {
			await downloadsApi.cancelCurrentDownload();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to cancel');
		}
	}, []);

	const addToQueue = useCallback(async (episodeId: number, priority = 0) => {
		try {
			await downloadsApi.addToQueue(episodeId, priority);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add to queue');
		}
	}, [fetchAndUpdateStatus]);

	const addBatchToQueue = useCallback(async (episodeIds: number[], priority = 0) => {
		try {
			await downloadsApi.addBatchToQueue(episodeIds, priority);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add to queue');
		}
	}, [fetchAndUpdateStatus]);

	const queueSubscription = useCallback(async (subscriptionId: number, priority = 0) => {
		try {
			await downloadsApi.queueSubscription(subscriptionId, priority);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to queue subscription');
		}
	}, [fetchAndUpdateStatus]);

	const syncAndQueue = useCallback(async (subscriptionId: number, priority = 0) => {
		try {
			await downloadsApi.syncAndQueueSubscription(subscriptionId, priority);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to sync and queue');
		}
	}, [fetchAndUpdateStatus]);

	const removeFromQueue = useCallback(async (queueId: number) => {
		try {
			await downloadsApi.removeFromQueue(queueId);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to remove from queue');
		}
	}, [fetchAndUpdateStatus]);

	const cancelAll = useCallback(async () => {
		try {
			await downloadsApi.cancelAllPending();
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to cancel all');
		}
	}, [fetchAndUpdateStatus]);

	const clearFinished = useCallback(async () => {
		try {
			await downloadsApi.clearFinishedQueue();
			// Refresh status to get updated counts
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear finished');
		}
	}, [fetchAndUpdateStatus]);

	const retryDownload = useCallback(async (queueId: number) => {
		try {
			await downloadsApi.retryDownload(queueId);
			// Refresh status to get updated activeItems
			await fetchAndUpdateStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry');
		}
	}, [fetchAndUpdateStatus]);

	const refreshStatus = useCallback(async () => {
		await fetchAndUpdateStatus();
	}, [fetchAndUpdateStatus]);

	const value: DownloadContextValue = {
		isRunning,
		isPaused,
		isLoading,
		currentDownload,
		activeItems,
		counts,
		isActive,
		error,
		start,
		stop,
		pause,
		resume,
		cancelCurrent,
		addToQueue,
		addBatchToQueue,
		queueSubscription,
		syncAndQueue,
		removeFromQueue,
		cancelAll,
		clearFinished,
		retryDownload,
		refreshStatus
	};

	return (
		<DownloadContext.Provider value={value}>
			{children}
		</DownloadContext.Provider>
	);
}

export function useDownloadContext(): DownloadContextValue {
	const context = useContext(DownloadContext);
	if (!context) {
		throw new Error('useDownloadContext must be used within a DownloadProvider');
	}
	return context;
}
