/**
 * Podcast service for communicating with the Pi Podcast API
 * Handles podcast search and retrieval using iTunes API
 */

// Types for API responses - aligned with Node.js backend
export interface Podcast {
	id: number;
	name: string;
	artist: string;
	feedUrl: string;
	artworkUrl: string;
	artworkUrl100: string;
	artworkUrl600: string;
	genres: string[];
	primaryGenre: string;
	trackCount: number;
	releaseDate: string;
	country: string;
	description?: string | null;
}

export interface PodcastSearchResponse {
	success: boolean;
	resultCount: number;
	results: Podcast[];
}

export interface PodcastDetailsResponse {
	success: boolean;
	podcast: Podcast;
}

export interface PodcastError {
	success: boolean;
	error: string;
}

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Search for podcasts using iTunes API
 * @param searchTerm - The search term
 * @param limit - Maximum number of results (default: 20)
 */
export async function searchPodcasts(searchTerm: string, limit: number = 20): Promise<PodcastSearchResponse> {
	try {
		const params = new URLSearchParams({
			term: searchTerm,
			limit: limit.toString()
		});

		const response = await fetch(`${API_BASE_URL}/api/podcasts/search?${params}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as PodcastError;
			throw new Error(error.error || 'Failed to search podcasts');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Podcast search failed: ${error.message}`);
		}
		throw new Error('Podcast search failed: Unknown error');
	}
}

/**
 * Get podcast details by iTunes ID
 * @param podcastId - The iTunes podcast ID
 */
export async function getPodcastById(podcastId: number): Promise<PodcastDetailsResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/podcasts/${podcastId}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as PodcastError;
			throw new Error(error.error || 'Failed to get podcast details');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Podcast retrieval failed: ${error.message}`);
		}
		throw new Error('Podcast retrieval failed: Unknown error');
	}
}