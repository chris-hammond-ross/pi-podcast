/**
 * Media Player API Service
 * Handles media playback-related API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface MediaStatus {
	isPlaying: boolean;
	isPaused: boolean;
	position: number;
	duration: number;
	volume: number;
	currentEpisode: {
		id: number;
		title: string;
		subscription_id: number;
	} | null;
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
 * Play an episode by ID
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
export async function togglePause(): Promise<{ paused: boolean; }> {
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
export async function resumePlayback(): Promise<{ success: boolean; paused: boolean; }> {
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
 * Stop playback completely
 */
export async function stopPlayback(): Promise<{ success: boolean; }> {
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
export async function seekTo(position: number): Promise<{ success: boolean; position: number; }> {
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
export async function seekRelative(offset: number): Promise<{ success: boolean; position: number; }> {
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
export async function setVolume(volume: number): Promise<{ success: boolean; volume: number; }> {
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
export async function resetEpisodeProgress(episodeId: number): Promise<{ success: boolean; }> {
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
export async function markEpisodeComplete(episodeId: number): Promise<{ success: boolean; }> {
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
