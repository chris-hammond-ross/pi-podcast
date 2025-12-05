/**
 * Playlists API Service
 * Handles playlist-related API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface AutoPlaylist {
	id: number;
	name: string;
	description: string | null;
	type: 'auto';
	subscription_id: number;
	file_path: string;
	created_at: number;
	updated_at: number;
	subscription_name: string;
	subscription_artwork: string | null;
	episode_count: number;
}

export interface UserPlaylist {
	id: number;
	name: string;
	description: string | null;
	type: 'user';
	subscription_id: null;
	file_path: string;
	created_at: number;
	updated_at: number;
	episode_count: number;
}

export type Playlist = AutoPlaylist | UserPlaylist;

export interface AutoPlaylistsResponse {
	success: boolean;
	playlists: AutoPlaylist[];
}

export interface UserPlaylistsResponse {
	success: boolean;
	playlists: UserPlaylist[];
}

export interface AllPlaylistsResponse {
	success: boolean;
	playlists: {
		auto: AutoPlaylist[];
		user: UserPlaylist[];
	};
}

export interface PlaylistResponse {
	success: boolean;
	playlist: Playlist;
}

export interface RegeneratePlaylistResponse {
	success: boolean;
	playlist: AutoPlaylist;
	episodeCount: number;
}

/**
 * Get all auto-generated playlists
 */
export async function getAutoPlaylists(): Promise<AutoPlaylistsResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/auto`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get auto playlists');
	}

	return response.json();
}

/**
 * Get all user-created playlists
 */
export async function getUserPlaylists(): Promise<UserPlaylistsResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/user`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get user playlists');
	}

	return response.json();
}

/**
 * Get all playlists (both auto and user)
 */
export async function getAllPlaylists(): Promise<AllPlaylistsResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get playlists');
	}

	return response.json();
}

/**
 * Get a playlist by ID
 */
export async function getPlaylistById(id: number): Promise<PlaylistResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/${id}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get playlist');
	}

	return response.json();
}

/**
 * Get auto playlist for a specific subscription
 */
export async function getAutoPlaylistBySubscription(subscriptionId: number): Promise<PlaylistResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/auto/subscription/${subscriptionId}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get auto playlist');
	}

	return response.json();
}

/**
 * Manually regenerate an auto playlist
 */
export async function regenerateAutoPlaylist(subscriptionId: number): Promise<RegeneratePlaylistResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/auto/subscription/${subscriptionId}/regenerate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to regenerate playlist');
	}

	return response.json();
}

/**
 * Create a new user playlist
 */
export async function createUserPlaylist(name: string, description?: string): Promise<PlaylistResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/user`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, description })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to create playlist');
	}

	return response.json();
}

/**
 * Update a user playlist
 */
export async function updateUserPlaylist(
	id: number,
	updates: { name?: string; description?: string }
): Promise<PlaylistResponse> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(updates)
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to update playlist');
	}

	return response.json();
}

/**
 * Delete a user playlist
 */
export async function deleteUserPlaylist(id: number): Promise<{ success: boolean; message: string }> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/${id}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to delete playlist');
	}

	return response.json();
}

/**
 * Add an episode to a user playlist
 */
export async function addEpisodeToPlaylist(
	playlistId: number,
	episodeId: number
): Promise<{ success: boolean; playlistId: number; episodeId: number; position: number }> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}/episodes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ episodeId })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to add episode to playlist');
	}

	return response.json();
}

/**
 * Remove an episode from a user playlist
 */
export async function removeEpisodeFromPlaylist(
	playlistId: number,
	episodeId: number
): Promise<{ success: boolean; message: string }> {
	const response = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}/episodes/${episodeId}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to remove episode from playlist');
	}

	return response.json();
}
