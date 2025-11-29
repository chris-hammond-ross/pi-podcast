const { getDatabase } = require('../config/database');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

/**
 * Subscription Service
 * Handles podcast subscription operations
 */
class SubscriptionService {
	/**
	 * Get all subscriptions
	 * @returns {Array} List of subscriptions
	 */
	getAllSubscriptions() {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC');
		return stmt.all();
	}

	/**
	 * Get a subscription by feed URL
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {Object|undefined} The subscription if found
	 */
	getSubscriptionByFeedUrl(feedUrl) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions WHERE feed_url = ?');
		return stmt.get(feedUrl);
	}

	/**
	 * Get a subscription by ID
	 * @param {number} id - The subscription ID
	 * @returns {Object|undefined} The subscription if found
	 */
	getSubscriptionById(id) {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
		return stmt.get(id);
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
	 * @param {Object} podcast - The podcast details
	 * @param {string} podcast.feedUrl - The podcast feed URL
	 * @param {string} podcast.title - The podcast title
	 * @param {string} [podcast.description] - The podcast description
	 * @param {string} [podcast.imageUrl] - The podcast image URL
	 * @returns {Object} The created subscription
	 */
	subscribe(podcast) {
		const db = getDatabase();
		
		// Check if already subscribed
		const existing = this.getSubscriptionByFeedUrl(podcast.feedUrl);
		if (existing) {
			throw new Error('Already subscribed to this podcast');
		}

		const stmt = db.prepare(`
			INSERT INTO subscriptions (feed_url, title, description, image_url, last_fetched)
			VALUES (?, ?, ?, ?, ?)
		`);

		const result = stmt.run(
			podcast.feedUrl,
			podcast.title,
			podcast.description || null,
			podcast.imageUrl || null,
			Math.floor(Date.now() / 1000)
		);

		console.log('[subscription] Subscribed to:', podcast.title);

		return {
			id: result.lastInsertRowid,
			feed_url: podcast.feedUrl,
			title: podcast.title,
			description: podcast.description,
			image_url: podcast.imageUrl,
			last_fetched: Math.floor(Date.now() / 1000),
			created_at: Math.floor(Date.now() / 1000)
		};
	}

	/**
	 * Unsubscribe from a podcast
	 * @param {string} feedUrl - The podcast feed URL
	 * @returns {boolean} True if unsubscribed successfully
	 */
	unsubscribe(feedUrl) {
		const db = getDatabase();
		const stmt = db.prepare('DELETE FROM subscriptions WHERE feed_url = ?');
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
			SET description = ?, last_fetched = ?
			WHERE feed_url = ?
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
