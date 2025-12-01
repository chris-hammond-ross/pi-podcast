import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Title, Text, SimpleGrid, Card, Stack, Skeleton, Alert, Loader, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AlertCircle } from 'lucide-react';
import { useSubscriptions } from '../hooks';
import { PodcastResults, PodcastDetailModal } from '../components';
import { getSubscriptionById } from '../services';
import type { Subscription } from '../services';

function Podcasts() {
	const { subscriptions, isLoading, error, refresh } = useSubscriptions();
	const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
	const [modalOpened, setModalOpened] = useState(false);
	const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
	const isMobile = useMediaQuery('(max-width: 768px)');

	const { subscriptionId } = useParams<{ subscriptionId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();

	// Track if we're navigating programmatically to avoid closing modal on our own navigation
	const isNavigatingRef = useRef(false);

	// Handle URL-based subscription selection (e.g., /podcasts/123)
	useEffect(() => {
		if (subscriptionId) {
			const id = parseInt(subscriptionId);

			// First check if the subscription is in the current list
			const subscriptionFromList = subscriptions.find(s => s.id === id);

			if (subscriptionFromList) {
				setSelectedSubscription(subscriptionFromList);
				setModalOpened(true);
				setIsLoadingSubscription(false);
			} else if (!selectedSubscription || selectedSubscription.id !== id) {
				// Only fetch if we don't already have this subscription loaded
				setIsLoadingSubscription(true);
				getSubscriptionById(id)
					.then(response => {
						setSelectedSubscription(response.subscription);
						setModalOpened(true);
					})
					.catch(err => {
						console.error('Failed to load subscription:', err);
						// Navigate back to podcasts if subscription not found
						navigate('/podcasts', { replace: true });
					})
					.finally(() => {
						setIsLoadingSubscription(false);
					});
			}
		} else {
			// No subscriptionId in URL - close modal if open (handles back navigation)
			if (modalOpened && !isNavigatingRef.current) {
				setModalOpened(false);
				setSelectedSubscription(null);
			}
		}

		// Reset the navigation flag
		isNavigatingRef.current = false;
	}, [subscriptionId, location.pathname, subscriptions]);

	const handlePodcastClick = useCallback((podcast: Subscription) => {
		setSelectedSubscription(podcast);
		setModalOpened(true);
		isNavigatingRef.current = true;
		// Update URL without full navigation
		navigate(`/podcasts/${podcast.id}`, { replace: false });
	}, [navigate]);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedSubscription(null);
		isNavigatingRef.current = true;
		// Navigate back to podcasts
		navigate('/podcasts', { replace: false });
	}, [navigate]);

	const handleSubscriptionUpdate = useCallback((updated: Subscription) => {
		// Update the selected subscription with new data
		setSelectedSubscription(updated);
		// Refetch all subscriptions to sync the list
		refresh();
	}, [refresh]);

	// Loading state
	if (isLoading) {
		return (
			<Container size="sm" py="md">
				<SimpleGrid cols={{ base: 3, sm: 3 }} spacing="sm">
					{[...Array(36).keys()].map(i => (
						<Card key={i} p="0">
							<Skeleton height={isMobile ? 80 : 190} />
							<Stack p="xs" gap="xs">
								<Skeleton height={12} width="80%" />
								<Skeleton height={10} width="60%" />
							</Stack>
						</Card>
					))}
				</SimpleGrid>
			</Container>
		);
	}

	// Error state
	if (error) {
		return (
			<Container size="sm" py="md">
				<Title order={1} mb="md">
					Podcasts
				</Title>
				<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
					{error}
				</Alert>
			</Container>
		);
	}

	// Empty state
	if (subscriptions.length === 0) {
		return (
			<Container size="sm" py="md">
				<Title order={1} mb="md">
					Podcasts
				</Title>
				<Text c="dimmed">
					No subscriptions yet. Search for podcasts to subscribe!
				</Text>
			</Container>
		);
	}

	return (
		<Container size="sm" py="md">
			<PodcastResults
				podcasts={subscriptions}
				onPodcastClick={handlePodcastClick}
			/>

			{/* Loading state when fetching subscription directly from URL */}
			{isLoadingSubscription && !selectedSubscription && (
				<Group
					justify="center"
					align="center"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						zIndex: 1000
					}}
				>
					<Loader size="lg" />
				</Group>
			)}

			<PodcastDetailModal
				subscription={selectedSubscription}
				opened={modalOpened}
				onClose={handleModalClose}
				onSubscriptionUpdate={handleSubscriptionUpdate}
			/>
		</Container>
	);
}

export default Podcasts;
