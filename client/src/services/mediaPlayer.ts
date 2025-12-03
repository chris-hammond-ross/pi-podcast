/**
 * Media Player API Service
 * Handles media playback and queue-related API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface MediaCurrentEpisode {
	id: number;
	title: string;
	subscription_id: number;
}

export interface MediaStatus {
	isPlaying: boolean;
	isPaused: boolean;
	position: number;
	duration: number;
	volume: number;
	currentEpisode: MediaCurrentEpisode | null;
	queuePosition: number;
	queueLength: number;
	mpvConnected: boolean;
}

export interface PlayEpisodeResult {
	success: boolean;
	episode: {
		id: number;
		title: string;
		duration: number;
		resumedFrom: number;
	};
}

export interface QueueItem {
	index: number;
	episodeId: number;
	title: string;
	subscription_id: number;
	duration: string;
	isPlaying: boolean;
}

export interface QueueInfo {
	items: QueueItem[];
	currentIndex: number;
	length: number;
}

export interface AddToQueueResult {
	success: boolean;
	queuePosition?: number;
	queueLength: number;
	added?: number;
	errors?: Array<{ episodeId: number; error: string }>;
}

export interface RecentlyPlayedEpisode {
	id: number;
	subscription_id: number;
	title: string;
	description: string;
	pub_date: string;
	duration: string;
	audio_url: string;
	image_url: string | null;
	file_path: string | null;
	downloaded_at: number | null;
	playback_position: number;
	playback_completed: boolean;
	last_played_at: number;
}

export interface InProgressEpisode extends RecentlyPlayedEpisode {}

/**
 * Get current playback status
 */
export async function getMediaStatus(): Promise<MediaStatus> {
	const response = await fetch(`${API_BASE_URL}/api/media/status`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get media status');
	}

	return response.json();
}

/**
 * Play an episode by ID (replaces queue)
 */
export async function playEpisode(episodeId: number): Promise<PlayEpisodeResult> {
	const response = await fetch(`${API_BASE_URL}/api/media/play/${episodeId}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to play episode');
	}

	return response.json();
}

/**
 * Toggle pause/resume playback
 */
export async function togglePause(): Promise<{ paused: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/pause`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to toggle pause');
	}

	return response.json();
}

/**
 * Resume playback
 */
export async function resumePlayback(): Promise<{ success: boolean; paused: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/resume`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to resume');
	}

	return response.json();
}

/**
 * Stop playback (keeps queue)
 */
export async function stopPlayback(): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/stop`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to stop');
	}

	return response.json();
}

/**
 * Seek to a specific position (absolute, in seconds)
 */
export async function seekTo(position: number): Promise<{ success: boolean; position: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/seek`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ position })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to seek');
	}

	return response.json();
}

/**
 * Seek relative to current position (in seconds, positive or negative)
 */
export async function seekRelative(offset: number): Promise<{ success: boolean; position: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/seek-relative`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ offset })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to seek');
	}

	return response.json();
}

/**
 * Set volume level (0-100)
 */
export async function setVolume(volume: number): Promise<{ success: boolean; volume: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/volume`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ volume })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to set volume');
	}

	return response.json();
}

// ===== Queue Management =====

/**
 * Get current queue
 */
export async function getQueue(): Promise<QueueInfo> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get queue');
	}

	return response.json();
}

/**
 * Add a single episode to queue
 */
export async function addToQueue(episodeId: number): Promise<AddToQueueResult> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ episodeId })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to add to queue');
	}

	return response.json();
}

/**
 * Add multiple episodes to queue
 */
export async function addMultipleToQueue(episodeIds: number[]): Promise<AddToQueueResult> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ episodeIds })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to add to queue');
	}

	return response.json();
}

/**
 * Remove episode from queue by index
 */
export async function removeFromQueue(index: number): Promise<{ success: boolean; removed: number; queueLength: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/${index}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to remove from queue');
	}

	return response.json();
}

/**
 * Clear the entire queue
 */
export async function clearQueue(): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to clear queue');
	}

	return response.json();
}

/**
 * Move item in queue
 */
export async function moveInQueue(from: number, to: number): Promise<{ success: boolean; queueLength: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/move`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to move in queue');
	}

	return response.json();
}

/**
 * Jump to specific position in queue
 */
export async function playQueueIndex(index: number): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/play/${index}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to play queue index');
	}

	return response.json();
}

/**
 * Play next episode in queue
 */
export async function playNext(): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/next`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to play next');
	}

	return response.json();
}

/**
 * Play previous episode in queue
 */
export async function playPrevious(): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/previous`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to play previous');
	}

	return response.json();
}

// ===== Episode Progress =====

/**
 * Get recently played episodes
 */
export async function getRecentlyPlayed(limit = 10): Promise<RecentlyPlayedEpisode[]> {
	const response = await fetch(`${API_BASE_URL}/api/media/recently-played?limit=${limit}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get recently played');
	}

	return response.json();
}

/**
 * Get episodes in progress (started but not completed)
 */
export async function getInProgress(limit = 10): Promise<InProgressEpisode[]> {
	const response = await fetch(`${API_BASE_URL}/api/media/in-progress?limit=${limit}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get in progress');
	}

	return response.json();
}

/**
 * Reset playback progress for an episode
 */
export async function resetEpisodeProgress(episodeId: number): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/episodes/${episodeId}/reset-progress`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to reset progress');
	}

	return response.json();
}

/**
 * Mark an episode as completed
 */
export async function markEpisodeComplete(episodeId: number): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/episodes/${episodeId}/mark-complete`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to mark complete');
	}

	return response.json();
}
