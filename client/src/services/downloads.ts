/**
 * Downloads API Service
 * Handles download queue and processor API calls
 */

import type { DownloadQueueItem, DownloadQueueStatus, DownloadQueueCounts } from './websocket';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface DownloadStatusResponse {
	success: boolean;
	isRunning: boolean;
	isPaused: boolean;
	currentDownload: {
		queueId: number;
		episodeId: number;
		title: string;
		subscriptionName: string;
	} | null;
	queue: DownloadQueueStatus;
}

export interface QueueResponse {
	success: boolean;
	counts: DownloadQueueCounts;
	activeItems: DownloadQueueItem[];
	isActive: boolean;
}

export interface QueueItemsResponse {
	success: boolean;
	items: DownloadQueueItem[];
	count: number;
}

export interface AddToQueueResponse {
	success: boolean;
	item?: DownloadQueueItem;
	added?: number;
	skipped?: number;
	total?: number;
}

export interface SyncResponse {
	success: boolean;
	sync: {
		subscriptionId: number;
		subscriptionName: string;
		added: number;
		updated: number;
		skipped: number;
		total: number;
	};
	queue: {
		added: number;
		skipped: number;
		total: number;
	};
}

async function apiGet<T>(endpoint: string): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${endpoint}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

async function apiDelete<T>(endpoint: string): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${endpoint}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Get download processor and queue status
 */
export async function getDownloadStatus(): Promise<DownloadStatusResponse> {
	return apiGet('/api/downloads/status');
}

/**
 * Start the download processor
 */
export async function startDownloads(): Promise<{ success: boolean; message: string }> {
	return apiPost('/api/downloads/start');
}

/**
 * Stop the download processor
 */
export async function stopDownloads(): Promise<{ success: boolean; message: string }> {
	return apiPost('/api/downloads/stop');
}

/**
 * Pause the download processor
 */
export async function pauseDownloads(): Promise<{ success: boolean; message: string }> {
	return apiPost('/api/downloads/pause');
}

/**
 * Resume the download processor
 */
export async function resumeDownloads(): Promise<{ success: boolean; message: string }> {
	return apiPost('/api/downloads/resume');
}

/**
 * Cancel the current download
 */
export async function cancelCurrentDownload(): Promise<{ success: boolean; message: string }> {
	return apiPost('/api/downloads/cancel-current');
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<QueueResponse> {
	return apiGet('/api/downloads/queue');
}

/**
 * Get queue items with optional status filter
 */
export async function getQueueItems(status?: string, limit?: number): Promise<QueueItemsResponse> {
	const params = new URLSearchParams();
	if (status) params.append('status', status);
	if (limit) params.append('limit', limit.toString());
	
	const query = params.toString();
	return apiGet(`/api/downloads/queue/items${query ? `?${query}` : ''}`);
}

/**
 * Add episode to download queue
 */
export async function addToQueue(episodeId: number, priority = 0): Promise<AddToQueueResponse> {
	return apiPost('/api/downloads/queue', { episodeId, priority });
}

/**
 * Add multiple episodes to download queue
 */
export async function addBatchToQueue(episodeIds: number[], priority = 0): Promise<AddToQueueResponse> {
	return apiPost('/api/downloads/queue', { episodeIds, priority });
}

/**
 * Queue all episodes for a subscription
 */
export async function queueSubscription(subscriptionId: number, priority = 0): Promise<AddToQueueResponse> {
	return apiPost(`/api/downloads/queue/subscription/${subscriptionId}`, { priority });
}

/**
 * Sync episodes from feed and queue for download
 */
export async function syncAndQueueSubscription(subscriptionId: number, priority = 0): Promise<SyncResponse> {
	return apiPost(`/api/downloads/sync/subscription/${subscriptionId}`, { priority });
}

/**
 * Remove item from queue
 */
export async function removeFromQueue(queueId: number): Promise<{ success: boolean }> {
	return apiDelete(`/api/downloads/queue/${queueId}`);
}

/**
 * Clear completed/failed items from queue
 */
export async function clearFinishedQueue(): Promise<{ success: boolean; cleared: number }> {
	return apiPost('/api/downloads/queue/clear');
}

/**
 * Cancel all pending downloads
 */
export async function cancelAllPending(): Promise<{ success: boolean; cancelled: number }> {
	return apiPost('/api/downloads/queue/cancel-all');
}

/**
 * Retry a failed download
 */
export async function retryDownload(queueId: number): Promise<{ success: boolean; message: string }> {
	return apiPost(`/api/downloads/queue/${queueId}/retry`);
}
