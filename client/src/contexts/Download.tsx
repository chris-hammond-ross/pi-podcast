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

	const isActive = counts.pending > 0 || counts.downloading > 0;

	// Handle WebSocket messages
	const handleMessage = useCallback((message: ServerMessage) => {
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
				if (message.currentDownload) {
					setCurrentDownload({
						...message.currentDownload,
						downloadedBytes: 0,
						totalBytes: 0,
						percent: 0
					});
				} else if (!message.currentDownload && currentDownload) {
					// Clear current download if not in progress
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
						return prev;
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
			case 'download:failed':
				if (currentDownload?.queueId === message.queueId) {
					setCurrentDownload(null);
				}
				break;

			case 'download:queue-empty':
				setCurrentDownload(null);
				break;
		}
	}, [currentDownload]);

	// Connect to WebSocket and subscribe
	useEffect(() => {
		const service = serviceRef.current;
		let mounted = true;

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

				// Also fetch via API as backup
				setTimeout(async () => {
					if (mounted && isLoading) {
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
	}, [handleMessage, isLoading]);

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
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add to queue');
		}
	}, []);

	const addBatchToQueue = useCallback(async (episodeIds: number[], priority = 0) => {
		try {
			await downloadsApi.addBatchToQueue(episodeIds, priority);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add to queue');
		}
	}, []);

	const queueSubscription = useCallback(async (subscriptionId: number, priority = 0) => {
		try {
			await downloadsApi.queueSubscription(subscriptionId, priority);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to queue subscription');
		}
	}, []);

	const syncAndQueue = useCallback(async (subscriptionId: number, priority = 0) => {
		try {
			await downloadsApi.syncAndQueueSubscription(subscriptionId, priority);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to sync and queue');
		}
	}, []);

	const removeFromQueue = useCallback(async (queueId: number) => {
		try {
			await downloadsApi.removeFromQueue(queueId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to remove from queue');
		}
	}, []);

	const cancelAll = useCallback(async () => {
		try {
			await downloadsApi.cancelAllPending();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to cancel all');
		}
	}, []);

	const clearFinished = useCallback(async () => {
		try {
			await downloadsApi.clearFinishedQueue();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear finished');
		}
	}, []);

	const retryDownload = useCallback(async (queueId: number) => {
		try {
			await downloadsApi.retryDownload(queueId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry');
		}
	}, []);

	const refreshStatus = useCallback(async () => {
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
