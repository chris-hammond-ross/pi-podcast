import {
	Text,
	SimpleGrid,
	Card,
	Stack,
	Skeleton,
	Loader,
	Group,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PodcastResults } from '../../components';
import type { Subscription } from '../../services';

interface PodcastsTabProps {
	subscriptions: Subscription[];
	isLoading: boolean;
	isLoadingSubscription: boolean;
	selectedSubscription: Subscription | null;
	onPodcastClick: (podcast: Subscription) => void;
}

function Podcasts({
	subscriptions,
	isLoading,
	isLoadingSubscription,
	selectedSubscription,
	onPodcastClick,
}: PodcastsTabProps) {
	const isMobile = useMediaQuery('(max-width: 768px)');

	if (isLoading) {
		return (
			<SimpleGrid cols={{ base: 3, sm: 3 }} spacing="sm" style={{ overflow: 'hidden' }}>
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
		);
	}

	if (subscriptions.length === 0) {
		return (
			<Card
				mb="-1rem"
				style={{
					flex: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<Text c="dimmed">No podcast subscriptions</Text>
			</Card>
		);
	}

	return (
		<>
			<PodcastResults
				podcasts={subscriptions}
				onPodcastClick={onPodcastClick}
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
		</>
	);
}

export default Podcasts;