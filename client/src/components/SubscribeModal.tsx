import { useState, useEffect } from 'react';
import {
	Modal,
	Image,
	Text,
	Stack,
	Badge,
	Button,
	Group,
	Skeleton,
	Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle } from 'lucide-react';
import type { Podcast, FeedData } from '../services';
import { fetchFeed, checkSubscription, subscribe } from '../services';

interface SubscribeModalProps {
	podcast: Podcast | null;
	opened: boolean;
	onClose: () => void;
	onSubscribed?: (podcast: Podcast) => void;
}

function SubscribeModal({ podcast, opened, onClose, onSubscribed }: SubscribeModalProps) {
	const [feedData, setFeedData] = useState<FeedData | null>(null);
	const [isSubscribed, setIsSubscribed] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isSubscribing, setIsSubscribing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch feed data and subscription status when modal opens
	useEffect(() => {
		if (opened && podcast?.feedUrl) {
			setIsLoading(true);
			setError(null);
			setFeedData(null);

			Promise.all([
				fetchFeed(podcast.feedUrl),
				checkSubscription(podcast.feedUrl)
			])
				.then(([feedResponse, subscriptionResponse]) => {
					setFeedData(feedResponse.feed);
					setIsSubscribed(subscriptionResponse.isSubscribed);
				})
				.catch((err) => {
					console.error('Failed to load podcast details:', err);
					setError(err.message || 'Failed to load podcast details');
				})
				.finally(() => {
					setIsLoading(false);
				});
		}
	}, [opened, podcast?.feedUrl]);

	// Reset state when modal closes
	useEffect(() => {
		if (!opened) {
			setFeedData(null);
			setIsSubscribed(false);
			setIsLoading(false);
			setIsSubscribing(false);
			setError(null);
		}
	}, [opened]);

	const handleSubscribe = async () => {
		if (!podcast || !feedData) return;

		setIsSubscribing(true);
		setError(null);

		try {
			await subscribe({
				feedUrl: podcast.feedUrl,
				title: podcast.name,
				description: feedData.description,
				imageUrl: podcast.artworkUrl600
			});

			setIsSubscribed(true);

			// TODO: Download the latest episode
			// For now, just log to console
			if (feedData.episodes.length > 0) {
				const latestEpisode = feedData.episodes[0];
				console.log('[SubscribeModal] Would download latest episode:', {
					title: latestEpisode.title,
					audioUrl: latestEpisode.audioUrl,
					pubDate: latestEpisode.pubDate
				});
			}

			onSubscribed?.(podcast);
			notifications.show({
				color: 'teal',
				//title: 'Success',
				message: <Text size='xs' c="dimmed" lineClamp={2}>
					You subscribed to <Text span c="var(--mantine-color-text)">{podcast.name}</Text>
				</Text>,
			});
			onClose();
		} catch (err) {
			console.error('Failed to subscribe:', err);
			setError(err instanceof Error ? err.message : 'Failed to subscribe');
		} finally {
			setIsSubscribing(false);
		}
	};

	if (!podcast) return null;

	return (
		<Modal
			className="podcast-details"
			opened={opened}
			onClose={onClose}
			withCloseButton={false}
			size="md"
			centered
			overlayProps={{
				blur: 5,
			}}
		>
			<Stack gap="0">
				{/* Podcast Image */}
				<Image
					src={podcast.artworkUrl600}
					alt={podcast.name}
					mah="100%"
					maw="100%"
					height="auto"
					w="auto"
					fit="contain"
				/>

				<Stack p="md">
					{/* Podcast Info */}
					<Stack gap="xs">
						<Text fw={600} size="lg">
							{podcast.name}
						</Text>
						<Group justify='flex-start'>
							{/* Episode Count */}
							<Badge variant="light" color="teal">
								{podcast.trackCount} episodes
							</Badge>
							{/* Genre Badge */}
							{podcast.primaryGenre && (
								<Group>
									<Badge variant="light" color="cyan">
										{podcast.primaryGenre}
									</Badge>
								</Group>
							)}
						</Group>
					</Stack>

					{/* Description from RSS Feed */}
					{isLoading ? (
						<Stack gap="xs">
							<Skeleton height={12} radius="xl" />
							<Skeleton height={12} radius="xl" />
							<Skeleton height={12} radius="xl" width="70%" />
						</Stack>
					) : error ? (
						<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
							{error}
						</Alert>
					) : feedData?.description ? (
						<Text size="sm" lineClamp={5} style={{ whiteSpace: 'pre-wrap' }}>
							{feedData.description.replace(/<[^>]*>/g, '')}
						</Text>
					) : null}

					{/* Subscribe Button */}
					<Button
						fullWidth
						size="md"
						disabled={isSubscribed || isLoading}
						loading={isSubscribing}
						onClick={handleSubscribe}
						color={isSubscribed ? 'gray' : 'blue'}
					>
						{isSubscribed ? 'Already Subscribed' : 'Subscribe'}
					</Button>
				</Stack>

			</Stack>
		</Modal>
	);
}

export default SubscribeModal;
