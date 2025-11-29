import { useState, useEffect, useCallback } from 'react';
import {
	getSubscriptions,
	checkSubscription,
	subscribe,
	unsubscribe,
	type Subscription
} from '../services';
import type { Podcast } from '../services';

export interface UseSubscriptionsReturn {
	/** List of all subscriptions */
	subscriptions: Subscription[];
	/** Whether subscriptions are currently loading */
	isLoading: boolean;
	/** Error message if fetch failed */
	error: string | null;
	/** Refresh the subscriptions list */
	refresh: () => Promise<void>;
	/** Check if a feed URL is subscribed */
	isSubscribed: (feedUrl: string) => boolean;
	/** Subscribe to a podcast */
	subscribeToPodcast: (podcast: Podcast) => Promise<Subscription>;
	/** Unsubscribe from a podcast */
	unsubscribeFromPodcast: (feedUrl: string) => Promise<boolean>;
	/** Check subscription status from the server (for when local state might be stale) */
	checkSubscriptionStatus: (feedUrl: string) => Promise<boolean>;
}

/**
 * Hook for managing podcast subscriptions
 * Provides subscription list, subscribe/unsubscribe actions, and status checking
 */
export function useSubscriptions(): UseSubscriptionsReturn {
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch all subscriptions
	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await getSubscriptions();
			setSubscriptions(response.subscriptions);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load subscriptions';
			setError(message);
			console.error('[useSubscriptions] Failed to load subscriptions:', err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Load subscriptions on mount
	useEffect(() => {
		refresh();
	}, [refresh]);

	// Check if a feed URL is subscribed (local check)
	const isSubscribedLocal = useCallback((feedUrl: string): boolean => {
		return subscriptions.some(sub => sub.feedUrl === feedUrl);
	}, [subscriptions]);

	// Check subscription status from server
	const checkSubscriptionStatus = useCallback(async (feedUrl: string): Promise<boolean> => {
		try {
			const response = await checkSubscription(feedUrl);
			return response.isSubscribed;
		} catch (err) {
			console.error('[useSubscriptions] Failed to check subscription:', err);
			// Fall back to local check
			return isSubscribedLocal(feedUrl);
		}
	}, [isSubscribedLocal]);

	// Subscribe to a podcast
	const subscribeToPodcast = useCallback(async (podcast: Podcast): Promise<Subscription> => {
		try {
			const response = await subscribe(podcast);

			// Update local state
			setSubscriptions(prev => [response.subscription, ...prev]);

			return response.subscription;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to subscribe';
			console.error('[useSubscriptions] Failed to subscribe:', err);
			throw new Error(message);
		}
	}, []);

	// Unsubscribe from a podcast
	const unsubscribeFromPodcast = useCallback(async (feedUrl: string): Promise<boolean> => {
		try {
			await unsubscribe(feedUrl);

			// Update local state
			setSubscriptions(prev => prev.filter(sub => sub.feedUrl !== feedUrl));

			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to unsubscribe';
			console.error('[useSubscriptions] Failed to unsubscribe:', err);
			throw new Error(message);
		}
	}, []);

	return {
		subscriptions,
		isLoading,
		error,
		refresh,
		isSubscribed: isSubscribedLocal,
		subscribeToPodcast,
		unsubscribeFromPodcast,
		checkSubscriptionStatus
	};
}
