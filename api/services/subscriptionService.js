const { getDatabase } = require('../config/database');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

/**
 * Subscription Service
 * Handles podcast subscription operations
 * 
 * Subscription schema is aligned with Podcast schema from iTunes API:
 * - id, name, artist, feedUrl, artworkUrl, artworkUrl100, artworkUrl600
 * - genres (JSON string), primaryGenre, trackCount, releaseDate, country
 * - description (optional, from RSS feed)
 * - lastFetched, createdAt (subscription-specific)
 */
class SubscriptionService {
	/**
	 * Parse genres from JSON string or return empty array
	 * @param {string|null} genresJson - JSON string of genres
	 * @returns {string[]} Array of genres
	 */
	_parseGenres(genresJson) {
		if (!genresJson) return [];
		try {
			return JSON.parse(genresJson);
		} catch {
			return [];
		}
	}

	/**
	 * Transform database row to subscription object
	 * @param {Object} row - Database row
	 * @returns {Object} Subscription object with parsed genres
	 */
	_transformRow(row) {
		if (!row) return null;
		return {
			...row,
			genres: this._parseGenres(row.genres)
		};
	}

	/**
	 * Get all subscriptions
	 * @returns {Array} List of subscriptions
	 */
	getAllSubscriptions() {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions ORDER BY createdAt DESC');
		const rows = stmt.all();
		return rows.map(row => this._transformRow(row));
	}

	/**
	 * Get a subscription by feed URL
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {Object|undefined} The subscription if found
	 */
	getSubscriptionByFeedUrl(feedUrl) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions WHERE feedUrl = ?');
		return this._transformRow(stmt.get(feedUrl));
	}

	/**
	 * Get a subscription by ID
	 * @param {number} id - The subscription ID
	 * @returns {Object|undefined} The subscription if found
	 */
	getSubscriptionById(id) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
		return this._transformRow(stmt.get(id));
	}

	/**
	 * Check if a podcast is subscribed
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {boolean} True if subscribed
	 */
	isSubscribed(feedUrl) {
		return !!this.getSubscriptionByFeedUrl(feedUrl);
	}

	/**
	 * Subscribe to a podcast
	 * @param {Object} podcast - The podcast details (aligned with Podcast schema)
	 * @param {string} podcast.feedUrl - The podcast feed URL
	 * @param {string} podcast.name - The podcast name
	 * @param {string} [podcast.artist] - The podcast artist/author
	 * @param {string} [podcast.description] - The podcast description
	 * @param {string} [podcast.artworkUrl] - The main artwork URL
	 * @param {string} [podcast.artworkUrl100] - Small artwork URL
	 * @param {string} [podcast.artworkUrl600] - Large artwork URL
	 * @param {string[]} [podcast.genres] - Array of genre strings
	 * @param {string} [podcast.primaryGenre] - Primary genre
	 * @param {number} [podcast.trackCount] - Number of episodes
	 * @param {string} [podcast.releaseDate] - Release date
	 * @param {string} [podcast.country] - Country code
	 * @returns {Object} The created subscription
	 */
	subscribe(podcast) {
		const db = getDatabase();
		
		// Check if already subscribed
		const existing = this.getSubscriptionByFeedUrl(podcast.feedUrl);
		if (existing) {
			throw new Error('Already subscribed to this podcast');
		}

		const now = Math.floor(Date.now() / 1000);
		const genresJson = podcast.genres ? JSON.stringify(podcast.genres) : null;

		const stmt = db.prepare(`
			INSERT INTO subscriptions (
				feedUrl, name, artist, description, 
				artworkUrl, artworkUrl100, artworkUrl600,
				genres, primaryGenre, trackCount, releaseDate, country,
				lastFetched, createdAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const result = stmt.run(
			podcast.feedUrl,
			podcast.name,
			podcast.artist || null,
			podcast.description || null,
			podcast.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100 || null,
			podcast.artworkUrl100 || null,
			podcast.artworkUrl600 || null,
			genresJson,
			podcast.primaryGenre || null,
			podcast.trackCount || null,
			podcast.releaseDate || null,
			podcast.country || null,
			now,
			now
		);

		console.log('[subscription] Subscribed to:', podcast.name);

		return {
			id: result.lastInsertRowid,
			feedUrl: podcast.feedUrl,
			name: podcast.name,
			artist: podcast.artist || null,
			description: podcast.description || null,
			artworkUrl: podcast.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100 || null,
			artworkUrl100: podcast.artworkUrl100 || null,
			artworkUrl600: podcast.artworkUrl600 || null,
			genres: podcast.genres || [],
			primaryGenre: podcast.primaryGenre || null,
			trackCount: podcast.trackCount || null,
			releaseDate: podcast.releaseDate || null,
			country: podcast.country || null,
			lastFetched: now,
			createdAt: now
		};
	}

	/**
	 * Unsubscribe from a podcast
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {boolean} True if unsubscribed successfully
	 */
	unsubscribe(feedUrl) {
		const db = getDatabase();
		const stmt = db.prepare('DELETE FROM subscriptions WHERE feedUrl = ?');
		const result = stmt.run(feedUrl);
		
		console.log('[subscription] Unsubscribed from feed:', feedUrl);
		
		return result.changes > 0;
	}

	/**
	 * Fetch and parse RSS feed for a podcast
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {Promise<Object>} Parsed feed data with description and episodes
	 */
	async fetchFeed(feedUrl) {
		try {
			console.log('[subscription] Fetching RSS feed:', feedUrl);

			const response = await axios.get(feedUrl, {
				headers: {
					'User-Agent': 'PiPodcast/1.0'
				},
				timeout: 10000
			});

			const parsed = await parseStringPromise(response.data, {
				explicitArray: false,
				mergeAttrs: true
			});

			const channel = parsed.rss?.channel;
			if (!channel) {
				throw new Error('Invalid RSS feed format');
			}

			// Extract description
			const description = channel.description || channel['itunes:summary'] || '';

			// Extract episodes
			const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
			const episodes = items.map((item, index) => ({
				guid: item.guid?._ || item.guid || `${feedUrl}-${index}`,
				title: item.title || 'Untitled Episode',
				description: item.description || item['itunes:summary'] || '',
				pubDate: item.pubDate || null,
				duration: item['itunes:duration'] || null,
				audioUrl: item.enclosure?.url || null,
				audioType: item.enclosure?.type || 'audio/mpeg',
				audioLength: item.enclosure?.length || null,
				image: item['itunes:image']?.href || channel['itunes:image']?.href || null
			}));

			return {
				title: channel.title || '',
				description,
				link: channel.link || '',
				image: channel['itunes:image']?.href || channel.image?.url || null,
				author: channel['itunes:author'] || channel.author || '',
				episodes,
				episodeCount: episodes.length
			};
		} catch (error) {
			console.error('[subscription] Feed fetch error:', error.message);
			throw new Error(`Failed to fetch feed: ${error.message}`);
		}
	}

	/**
	 * Update subscription with latest feed data
	 * @param {string} feedUrl - The podcast feed URL
	 */
	async updateSubscription(feedUrl) {
		const db = getDatabase();
		const feedData = await this.fetchFeed(feedUrl);

		const stmt = db.prepare(`
			UPDATE subscriptions 
			SET description = ?, lastFetched = ?
			WHERE feedUrl = ?
		`);

		stmt.run(
			feedData.description,
			Math.floor(Date.now() / 1000),
			feedUrl
		);

		console.log('[subscription] Updated subscription:', feedUrl);
	}
}

// Create singleton instance
const subscriptionService = new SubscriptionService();

module.exports = subscriptionService;
