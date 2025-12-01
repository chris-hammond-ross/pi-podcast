/**
 * Episodes API Service
 * Handles episode-related API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface EpisodeRecord {
	id: number;
	subscription_id: number;
	guid: string;
	title: string;
	description: string;
	pub_date: string;
	duration: string;
	audio_url: string;
	audio_type: string;
	audio_length: number | null;
	image_url: string | null;
	file_path: string | null;
	file_size: number | null;
	downloaded_at: number | null;
	created_at: number;
}

export interface EpisodeCounts {
	total: number;
	downloaded: number;
	notDownloaded: number;
}

export interface EpisodesResponse {
	success: boolean;
	episodes: EpisodeRecord[];
	count: number;
}

export interface EpisodeCountsResponse {
	success: boolean;
	counts: EpisodeCounts;
}

export interface SyncEpisodesResponse {
	success: boolean;
	subscriptionId: number;
	subscriptionName: string;
	added: number;
	updated: number;
	skipped: number;
	total: number;
}

export interface GetEpisodesOptions {
	downloaded?: boolean;
	limit?: number;
	offset?: number;
	orderBy?: string;
	order?: 'ASC' | 'DESC';
}

/**
 * Get episodes for a subscription
 */
export async function getEpisodes(
	subscriptionId: number,
	options: GetEpisodesOptions = {}
): Promise<EpisodesResponse> {
	const params = new URLSearchParams();
	
	if (options.downloaded !== undefined) {
		params.append('downloaded', String(options.downloaded));
	}
	if (options.limit) params.append('limit', String(options.limit));
	if (options.offset) params.append('offset', String(options.offset));
	if (options.orderBy) params.append('orderBy', options.orderBy);
	if (options.order) params.append('order', options.order);

	const query = params.toString();
	const response = await fetch(
		`${API_BASE_URL}/api/episodes/subscription/${subscriptionId}${query ? `?${query}` : ''}`,
		{
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get episodes');
	}

	return response.json();
}

/**
 * Get episode counts for a subscription
 */
export async function getEpisodeCounts(subscriptionId: number): Promise<EpisodeCountsResponse> {
	const response = await fetch(
		`${API_BASE_URL}/api/episodes/subscription/${subscriptionId}/counts`,
		{
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get episode counts');
	}

	return response.json();
}

/**
 * Sync episodes from RSS feed
 */
export async function syncEpisodes(subscriptionId: number): Promise<SyncEpisodesResponse> {
	const response = await fetch(
		`${API_BASE_URL}/api/episodes/subscription/${subscriptionId}/sync`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to sync episodes');
	}

	return response.json();
}

/**
 * Get a single episode by ID
 */
export async function getEpisode(episodeId: number): Promise<{ success: boolean; episode: EpisodeRecord }> {
	const response = await fetch(
		`${API_BASE_URL}/api/episodes/${episodeId}`,
		{
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get episode');
	}

	return response.json();
}

/**
 * Delete a downloaded episode file and clear download info
 */
export async function deleteEpisodeDownload(episodeId: number): Promise<{ success: boolean; message: string }> {
	const response = await fetch(
		`${API_BASE_URL}/api/episodes/${episodeId}/download`,
		{
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' }
		}
	);

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to delete download');
	}

	return response.json();
}
