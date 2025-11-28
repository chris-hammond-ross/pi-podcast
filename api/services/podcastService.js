const axios = require('axios');

/**
 * Podcast Service
 * Handles podcast search and directory operations using iTunes API
 */
class PodcastService {
	constructor() {
		this.iTunesApiUrl = 'https://itunes.apple.com/search';
	}

	/**
	 * Search for podcasts using iTunes API
	 * @param {string} searchTerm - The search term
	 * @param {number} limit - Maximum number of results (default: 20)
	 * @returns {Promise<Object>} Search results from iTunes API
	 */
	async searchPodcasts(searchTerm, limit = 20) {
		try {
			if (!searchTerm || searchTerm.trim().length === 0) {
				throw new Error('Search term is required');
			}

			console.log('[podcast] Searching iTunes for:', searchTerm);

			const response = await axios.get(this.iTunesApiUrl, {
				params: {
					term: searchTerm,
					entity: 'podcast',
					limit: limit
				}
			});

			console.log(`[podcast] Found ${response.data.resultCount} results`);

			return {
				resultCount: response.data.resultCount,
				results: response.data.results.map(podcast => ({
					id: podcast.collectionId,
					name: podcast.collectionName,
					artist: podcast.artistName,
					feedUrl: podcast.feedUrl,
					artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
					artworkUrl100: podcast.artworkUrl100,
					artworkUrl600: podcast.artworkUrl600,
					genres: podcast.genres,
					primaryGenre: podcast.primaryGenreName,
					trackCount: podcast.trackCount,
					releaseDate: podcast.releaseDate,
					country: podcast.country
				}))
			};
		} catch (error) {
			console.error('[podcast] Search error:', error.message);
			throw new Error(`Failed to search podcasts: ${error.message}`);
		}
	}

	/**
	 * Get podcast details by iTunes ID
	 * @param {number} podcastId - The iTunes podcast ID
	 * @returns {Promise<Object>} Podcast details
	 */
	async getPodcastById(podcastId) {
		try {
			console.log('[podcast] Fetching podcast details for ID:', podcastId);

			const response = await axios.get(this.iTunesApiUrl, {
				params: {
					id: podcastId,
					entity: 'podcast'
				}
			});

			if (response.data.resultCount === 0) {
				throw new Error('Podcast not found');
			}

			const podcast = response.data.results[0];

			return {
				id: podcast.collectionId,
				name: podcast.collectionName,
				artist: podcast.artistName,
				feedUrl: podcast.feedUrl,
				artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100,
				artworkUrl100: podcast.artworkUrl100,
				artworkUrl600: podcast.artworkUrl600,
				genres: podcast.genres,
				primaryGenre: podcast.primaryGenreName,
				trackCount: podcast.trackCount,
				releaseDate: podcast.releaseDate,
				country: podcast.country
			};
		} catch (error) {
			console.error('[podcast] Get by ID error:', error.message);
			throw new Error(`Failed to get podcast details: ${error.message}`);
		}
	}
}

// Create singleton instance
const podcastService = new PodcastService();

module.exports = podcastService;
