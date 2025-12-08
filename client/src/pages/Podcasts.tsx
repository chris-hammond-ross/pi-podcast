import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
	ScrollArea,
	Button,
	Modal,
	TextInput
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { AlertCircle, X, Save, GripHorizontal } from 'lucide-react';
import { useMediaPlayer } from '../contexts';
import { useSubscriptions } from '../hooks';
import { PodcastResults, PodcastDetailModal, EpisodeRow } from '../components';
import { getSubscriptionById, getAllDownloadedEpisodes, createUserPlaylist, addEpisodeToPlaylist } from '../services';
import { formatDuration } from '../utilities';
import type { Subscription, DownloadedEpisodeRecord } from '../services';

interface SortableQueueItemProps {
	item: typeof queue[number];
	isCurrentEpisode: boolean;
}

function SortableQueueItem({ item, isCurrentEpisode }: SortableQueueItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.episodeId });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		cursor: 'default',
	};

	return (
		<Card
			ref={setNodeRef}
			style={style}
			p="sm"
			bg={isCurrentEpisode ? "var(--mantine-color-teal-light)" : undefined}
		>
			<Group justify="space-between" align="center" wrap="nowrap">
				<div style={{ flex: 1, minWidth: 0 }}>
					<Group gap={4} wrap="nowrap">
						<Text
							size="sm"
							c={isCurrentEpisode ? "var(--mantine-color-teal-light-color)" : undefined}
							truncate
							style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
						>
							{item.title}
						</Text>
						{item.duration && (
							<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
								• {formatDuration(item.duration)}
							</Text>
						)}
					</Group>
				</div>
				<div
					{...attributes}
					{...listeners}
					style={{
						display: "flex",
						alignItems: "center",
						cursor: "grab",
						touchAction: "none"
					}}
				>
					<GripHorizontal size={20} />
				</div>
			</Group>
		</Card>
	);
}

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

	// Save Playlist modal state
	const [savePlaylistModalOpened, setSavePlaylistModalOpened] = useState(false);
	const [playlistName, setPlaylistName] = useState('');
	const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
	const [savePlaylistError, setSavePlaylistError] = useState<string | null>(null);

	const { subscriptionId, episodeId } = useParams<{ subscriptionId: string; episodeId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();

	const { queue, currentEpisode, clearQueue, moveInQueue } = useMediaPlayer();

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

	const openSavePlaylistModal = () => {
		setPlaylistName('');
		setSavePlaylistError(null);
		setSavePlaylistModalOpened(true);
	};

	const closeSavePlaylistModal = () => {
		setSavePlaylistModalOpened(false);
		setPlaylistName('');
		setSavePlaylistError(null);
	};

	const handleSavePlaylist = async () => {
		const trimmedName = playlistName.trim();

		if (!trimmedName) {
			setSavePlaylistError('Please enter a playlist name');
			return;
		}

		if (queue.length === 0) {
			setSavePlaylistError('No episodes in queue to save');
			return;
		}

		setIsSavingPlaylist(true);
		setSavePlaylistError(null);

		try {
			// Create the playlist
			const { playlist } = await createUserPlaylist(trimmedName);

			// Add all episodes from the queue to the playlist
			for (const item of queue) {
				await addEpisodeToPlaylist(playlist.id, item.episodeId);
			}

			// Show success notification
			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed" lineClamp={2}>
						Playlist <Text span c="var(--mantine-color-text)">{trimmedName}</Text> saved with {queue.length} episode{queue.length !== 1 ? 's' : ''}
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});

			// Close the modal
			closeSavePlaylistModal();
		} catch (err) {
			console.error('Failed to save playlist:', err);
			setSavePlaylistError(err instanceof Error ? err.message : 'Failed to save playlist');
		} finally {
			setIsSavingPlaylist(false);
		}
	};

	const handleClearQueue = async () => {
		try {
			await clearQueue();
		} catch (err) {
			console.error('Failed to clear queue:', err);
		}
	};

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = queue.findIndex(item => item.episodeId === active.id);
			const newIndex = queue.findIndex(item => item.episodeId === over.id);

			if (oldIndex !== -1 && newIndex !== -1) {
				try {
					await moveInQueue(oldIndex, newIndex);
				} catch (err) {
					notifications.show({
						color: 'red',
						message: err instanceof Error ? err.message : 'Failed to shuffle queue',
						position: 'top-right',
						autoClose: 3000
					});
				}
			}
		}
	};

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
						pb="md"
						value="podcasts"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{subscriptions.length === 0 ? (
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
						pb="md"
						value="queue"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{queue.length > 0 && (
							<Group grow pb="md" gap="sm">
								<Button
									variant='light'
									color='cyan'
									leftSection={<Save size={16} />}
									onClick={openSavePlaylistModal}
								>
									Save Playlist
								</Button>
								<Button
									variant='light'
									color='pink'
									leftSection={<X size={16} />}
									onClick={handleClearQueue}
								>
									Clear Queue
								</Button>
							</Group>
						)}

						<Stack
							gap="xs"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							<DndContext
								sensors={sensors}
								collisionDetection={closestCenter}
								onDragEnd={handleDragEnd}
							>
								<SortableContext
									items={queue.map(item => item.episodeId)}
									strategy={verticalListSortingStrategy}
								>
									{queue.map((item) => (
										<SortableQueueItem
											key={item.episodeId}
											item={item}
											isCurrentEpisode={currentEpisode?.id === item.episodeId}
										/>
									))}
								</SortableContext>
							</DndContext>
						</Stack>
					</Tabs.Panel>
					<Tabs.Panel
						value="episodes"
						pb="md"
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
								mb="-1rem"
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

					{/* Save Playlist Modal */}
					<Modal
						opened={savePlaylistModalOpened}
						onClose={closeSavePlaylistModal}
						title="Save Playlist"
						withCloseButton={false}
						centered
						overlayProps={{
							blur: 5,
						}}
					>
						<Stack gap="sm">
							<TextInput
								placeholder="Enter a name for your playlist"
								value={playlistName}
								onChange={(e) => setPlaylistName(e.currentTarget.value)}
								error={savePlaylistError}
								disabled={isSavingPlaylist}
								data-autofocus
							/>

							<Text size="xs" c="dimmed">
								{queue.length} episode{queue.length !== 1 ? 's' : ''} will be added to this playlist
							</Text>

							<Group justify="flex-end" gap="sm" mt="sm" grow>
								<Button
									variant="light"
									color='red'
									onClick={closeSavePlaylistModal}
									disabled={isSavingPlaylist}
									leftSection={<X size={16} />}
								>
									Cancel
								</Button>
								<Button
									variant='light'
									color="cyan"
									onClick={handleSavePlaylist}
									loading={isSavingPlaylist}
									leftSection={<Save size={16} />}
								>
									Save
								</Button>
							</Group>
						</Stack>
					</Modal>
				</Container>
			</ScrollArea>
		</Tabs>
	);
}

export default Podcasts;
