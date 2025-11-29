/**
 * Subscription service for managing podcast subscriptions
 */

// Types for subscription responses
export interface Subscription {
	id: number;
	feed_url: string;
	title: string;
	description: string | null;
	image_url: string | null;
	last_fetched: number;
	created_at: number;
}

export interface Episode {
	guid: string;
	title: string;
	description: string;
	pubDate: string | null;
	duration: string | null;
	audioUrl: string | null;
	audioType: string;
	audioLength: string | null;
	image: string | null;
}

export interface FeedData {
	title: string;
	description: string;
	link: string;
	image: string | null;
	author: string;
	episodes: Episode[];
	episodeCount: number;
}

export interface SubscriptionsResponse {
	success: boolean;
	subscriptions: Subscription[];
}

export interface SubscriptionResponse {
	success: boolean;
	subscription: Subscription;
}

export interface CheckSubscriptionResponse {
	success: boolean;
	isSubscribed: boolean;
}

export interface FeedResponse {
	success: boolean;
	feed: FeedData;
}

export interface SubscriptionError {
	success: boolean;
	error: string;
}

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Get all subscriptions
 */
export async function getSubscriptions(): Promise<SubscriptionsResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/subscriptions`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as SubscriptionError;
			throw new Error(error.error || 'Failed to get subscriptions');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to get subscriptions: ${error.message}`);
		}
		throw new Error('Failed to get subscriptions: Unknown error');
	}
}

/**
 * Check if a podcast is subscribed
 * @param feedUrl - The podcast feed URL
 */
export async function checkSubscription(feedUrl: string): Promise<CheckSubscriptionResponse> {
	try {
		const params = new URLSearchParams({ feedUrl });
		const response = await fetch(`${API_BASE_URL}/api/subscriptions/check?${params}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as SubscriptionError;
			throw new Error(error.error || 'Failed to check subscription');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to check subscription: ${error.message}`);
		}
		throw new Error('Failed to check subscription: Unknown error');
	}
}

/**
 * Fetch RSS feed data
 * @param feedUrl - The podcast feed URL
 */
export async function fetchFeed(feedUrl: string): Promise<FeedResponse> {
	try {
		const params = new URLSearchParams({ feedUrl });
		const response = await fetch(`${API_BASE_URL}/api/subscriptions/feed?${params}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as SubscriptionError;
			throw new Error(error.error || 'Failed to fetch feed');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to fetch feed: ${error.message}`);
		}
		throw new Error('Failed to fetch feed: Unknown error');
	}
}

/**
 * Subscribe to a podcast
 * @param podcast - The podcast details
 */
export async function subscribe(podcast: {
	feedUrl: string;
	title: string;
	description?: string;
	imageUrl?: string;
}): Promise<SubscriptionResponse> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/subscriptions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(podcast),
		});

		if (!response.ok) {
			const error = (await response.json()) as SubscriptionError;
			throw new Error(error.error || 'Failed to subscribe');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to subscribe: ${error.message}`);
		}
		throw new Error('Failed to subscribe: Unknown error');
	}
}

/**
 * Unsubscribe from a podcast
 * @param feedUrl - The podcast feed URL
 */
export async function unsubscribe(feedUrl: string): Promise<{ success: boolean; message?: string }> {
	try {
		const params = new URLSearchParams({ feedUrl });
		const response = await fetch(`${API_BASE_URL}/api/subscriptions?${params}`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = (await response.json()) as SubscriptionError;
			throw new Error(error.error || 'Failed to unsubscribe');
		}

		return await response.json();
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to unsubscribe: ${error.message}`);
		}
		throw new Error('Failed to unsubscribe: Unknown error');
	}
}
