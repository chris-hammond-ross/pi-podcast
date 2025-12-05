import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
	Container,
	Text,
	SimpleGrid,
	Card,
	Stack,
	Skeleton,
	Alert,
	Loader,
	Group,
	Tabs,
	ScrollArea
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AlertCircle } from 'lucide-react';
import { useMediaPlayer } from '../contexts';
import { useSubscriptions } from '../hooks';
import { PodcastResults, PodcastDetailModal, EpisodeRow } from '../components';
import { getSubscriptionById, getAllDownloadedEpisodes } from '../services';
import { secondsToHms, formatDate } from '../utilities';
import type { Subscription, DownloadedEpisodeRecord } from '../services';

function Podcasts() {
	const { subscriptions, isLoading, error, refresh, getSubscriptionById: getSubscriptionByIdHook } = useSubscriptions();
	const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
	const [modalOpened, setModalOpened] = useState(false);
	const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
	const [currentEpisodeId, setCurrentEpisodeId] = useState<number | null>(null);
	const isMobile = useMediaQuery('(max-width: 768px)');

	// Downloaded episodes state
	const [downloadedEpisodes, setDownloadedEpisodes] = useState<DownloadedEpisodeRecord[]>([]);
	const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
	const [episodesError, setEpisodesError] = useState<string | null>(null);
	const [episodesLoaded, setEpisodesLoaded] = useState(false);

	const { subscriptionId, episodeId } = useParams<{ subscriptionId: string; episodeId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();

	const { queue, currentEpisode } = useMediaPlayer();

	// Track if we're navigating programmatically
	const isNavigatingRef = useRef(false);

	// Fetch downloaded episodes
	const fetchDownloadedEpisodes = useCallback(async () => {
		setIsLoadingEpisodes(true);
		setEpisodesError(null);
		try {
			const response = await getAllDownloadedEpisodes({
				orderBy: 'pub_date',
				order: 'DESC'
			});
			setDownloadedEpisodes(response.episodes);
			setEpisodesLoaded(true);
		} catch (err) {
			setEpisodesError(err instanceof Error ? err.message : 'Failed to load episodes');
		} finally {
			setIsLoadingEpisodes(false);
		}
	}, []);

	// Load downloaded episodes on mount
	useEffect(() => {
		if (!episodesLoaded) {
			fetchDownloadedEpisodes();
		}
	}, [episodesLoaded, fetchDownloadedEpisodes]);

	// Handle URL changes
	useEffect(() => {
		// If we triggered this navigation, skip processing
		if (isNavigatingRef.current) {
			isNavigatingRef.current = false;
			return;
		}

		if (subscriptionId) {
			const id = parseInt(subscriptionId);
			const newEpisodeId = episodeId ? parseInt(episodeId) : null;

			// Update episode ID state
			setCurrentEpisodeId(newEpisodeId);

			// Check if subscription is already loaded
			if (selectedSubscription?.id === id) {
				// Subscription already loaded, just ensure modal is open
				if (!modalOpened) {
					setModalOpened(true);
				}
				return;
			}

			// Check if subscription is in the list
			const subscriptionFromList = subscriptions.find(s => s.id === id);

			if (subscriptionFromList) {
				setSelectedSubscription(subscriptionFromList);
				setModalOpened(true);
				setIsLoadingSubscription(false);
			} else {
				// Fetch subscription
				setIsLoadingSubscription(true);
				getSubscriptionById(id)
					.then(response => {
						setSelectedSubscription(response.subscription);
						setModalOpened(true);
					})
					.catch(err => {
						console.error('Failed to load subscription:', err);
						navigate('/podcasts', { replace: true });
					})
					.finally(() => {
						setIsLoadingSubscription(false);
					});
			}
		} else {
			// No subscriptionId in URL - close everything
			setModalOpened(false);
			setSelectedSubscription(null);
			setCurrentEpisodeId(null);
		}
	}, [subscriptionId, episodeId, location.pathname, subscriptions]);

	const handlePodcastClick = useCallback((podcast: Subscription) => {
		setSelectedSubscription(podcast);
		setCurrentEpisodeId(null);
		setModalOpened(true);
		isNavigatingRef.current = true;
		navigate(`/podcasts/${podcast.id}`, { replace: false });
	}, [navigate]);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedSubscription(null);
		setCurrentEpisodeId(null);
		isNavigatingRef.current = true;
		navigate('/podcasts', { replace: false });
		// Refresh downloaded episodes when modal closes in case something changed
		fetchDownloadedEpisodes();
	}, [navigate, fetchDownloadedEpisodes]);

	const handleSubscriptionUpdate = useCallback((updated: Subscription) => {
		setSelectedSubscription(updated);
		refresh();
	}, [refresh]);

	const handleEpisodeOpen = useCallback((epId: number) => {
		if (selectedSubscription) {
			setCurrentEpisodeId(epId);
			isNavigatingRef.current = true;
			navigate(`/podcasts/${selectedSubscription.id}/episode/${epId}`, { replace: false });
		}
	}, [navigate, selectedSubscription]);

	const handleEpisodeClose = useCallback(() => {
		if (selectedSubscription) {
			setCurrentEpisodeId(null);
			isNavigatingRef.current = true;
			navigate(`/podcasts/${selectedSubscription.id}`, { replace: false });
		}
	}, [navigate, selectedSubscription]);

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
				<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
					{error}
				</Alert>
			</Container>
		);
	}

	return (
		<Tabs
			defaultValue="podcasts"
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
					<Tabs.Tab size="xl" value="podcasts">
						Podcasts
					</Tabs.Tab>
					<Tabs.Tab value="queue">
						Playing
					</Tabs.Tab>
					<Tabs.Tab value="episodes">
						Episodes
					</Tabs.Tab>
				</Tabs.List>
				<div
					style={{
						position: "absolute",
						left: "0",
						marginTop: "-1px",
						zIndex: "-1",
						height: "1px",
						width: "100vw",
						backgroundColor: "var(--tab-border-color)"
					}}
				>
					&nbsp;
				</div>
			</Container>

			<ScrollArea
				style={{ flex: 1 }}
				scrollbars="y"
				scrollbarSize={4}
			>
				<Container
					size="sm"
					py="md"
					style={{
						display: 'flex',
						flexDirection: 'column',
						height: 'var(--main-content-with-tabs-height)'
					}}
				>
					<Tabs.Panel
						value="podcasts"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{subscriptions.length === 0 ? (
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No podcast subscriptions</Text>
							</Card>
						) : (
							<>
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
							</>
						)}
					</Tabs.Panel>
					<Tabs.Panel
						value="queue"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						<Stack
							gap="xs"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							{queue.length === 0 ? (
								<Card
									withBorder
									style={{
										flex: 1,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center'
									}}
								>
									<Text c="dimmed">No episodes in the queue</Text>
								</Card>
							) : (
								<>
									{queue.map((item, index) => {
										const isCurrentEpisode = currentEpisode?.id === item.episodeId;

										return (
											<Card
												withBorder
												p="sm"
												style={{ cursor: 'pointer' }}
												key={index}
												bg={isCurrentEpisode ? "var(--mantine-color-teal-light)" : undefined}
											>
												<Group justify="space-between" align="center" wrap="nowrap">
													<div style={{ flex: 1, minWidth: 0 }}>
														<Group gap="xs" wrap="nowrap">
															<Text
																size="sm"
																c={isCurrentEpisode ? "var(--mantine-color-teal-light-color)" : undefined}
																truncate
																style={{ flex: 1 }}
															>
																{item.title} <Text span c="dimmed" size='xs'>{item.duration && ` - ${secondsToHms(Number(item.duration))}`}</Text>
															</Text>
														</Group>
														<Text size="xs" c="dimmed" truncate>
															{getSubscriptionByIdHook(item.subscription_id)?.name}
															{item.pub_date && ` • ${formatDate(item.pub_date)}`}
														</Text>
													</div>
												</Group>
											</Card>
										);
									})}
								</>
							)}
						</Stack>
					</Tabs.Panel>
					<Tabs.Panel
						value="episodes"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{isLoadingEpisodes ? (
							<Stack gap="sm">
								{[...Array(6).keys()].map(i => (
									<Card key={i} withBorder p="sm">
										<Group justify="space-between" align="center" wrap="nowrap">
											<div style={{ flex: 1, minWidth: 0 }}>
												<Skeleton height={16} width="70%" mb={8} />
												<Skeleton height={12} width="50%" />
											</div>
											<Skeleton height={28} width={28} circle />
										</Group>
									</Card>
								))}
							</Stack>
						) : episodesError ? (
							<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
								{episodesError}
							</Alert>
						) : downloadedEpisodes.length === 0 ? (
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No episodes have been downloaded</Text>
							</Card>
						) : (
							<Stack gap="xs">
								{downloadedEpisodes.map(episode => (
									<EpisodeRow
										key={episode.id}
										episodeId={episode.id}
										subscriptionName={episode.subscription_name}
										showDownloadStatus={false}
									/>
								))}
							</Stack>
						)}
					</Tabs.Panel>
					<PodcastDetailModal
						subscription={selectedSubscription}
						opened={modalOpened}
						onClose={handleModalClose}
						onSubscriptionUpdate={handleSubscriptionUpdate}
						initialEpisodeId={currentEpisodeId}
						onEpisodeOpen={handleEpisodeOpen}
						onEpisodeClose={handleEpisodeClose}
					/>
				</Container>
			</ScrollArea>
		</Tabs>
	);
}

export default Podcasts;
