import { useState, useCallback } from 'react';
import { Container, Title, Text, SimpleGrid, Card, Stack, Skeleton, Alert } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { useSubscriptions } from '../hooks';
import { PodcastResults, PodcastDetailModal } from '../components';
import type { Subscription } from '../services';

function Podcasts() {
	const { subscriptions, isLoading, error, refresh } = useSubscriptions();
	const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
	const [modalOpened, setModalOpened] = useState(false);

	const handlePodcastClick = useCallback((podcast: Subscription) => {
		setSelectedSubscription(podcast);
		setModalOpened(true);
	}, []);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedSubscription(null);
	}, []);

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
				<Title order={1} mb="md">
					Podcasts
				</Title>
				<SimpleGrid cols={{ base: 3, sm: 3 }} spacing="sm">
					{[1, 2, 3].map((i) => (
						<Card key={i} p="0">
							<Skeleton height={120} />
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
