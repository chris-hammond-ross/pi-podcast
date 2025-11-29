import { useCallback } from 'react';
import { Container, Title, Text, SimpleGrid, Card, Stack, Skeleton, Alert } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { useSubscriptions } from '../hooks';
import { PodcastResults } from '../components';
import type { Podcast } from '../services';

function Podcasts() {
	const { subscriptions, isLoading, error } = useSubscriptions();

	const handlePodcastClick = useCallback((podcast: Podcast) => {
		console.log(podcast);
	}, []);

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
		</Container>
	);
}

export default Podcasts;
