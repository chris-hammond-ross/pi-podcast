import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
	Modal,
	Text,
	Stack,
	Badge,
	Button,
	Group,
	Skeleton,
	Alert,
	Card,
	ActionIcon,
	ScrollArea,
	Loader,
	ThemeIcon
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Download, CheckCircle, ArrowLeft, Ellipsis, X, Clock, LoaderCircle, ListPlus } from 'lucide-react';
import type { Subscription } from '../services';
import { getEpisodes, getEpisodeCounts, syncEpisodes, type EpisodeRecord } from '../services';
import { useDownloadContext } from '../contexts';
import { useMediaPlayer } from '../contexts';
import EpisodeDetailModal from './EpisodeDetailModal';

interface PodcastDetailModalProps {
	subscription: Subscription | null;
	opened: boolean;
	onClose: () => void;
	onSubscriptionUpdate?: (subscription: Subscription) => void;
	// Episode modal support
	initialEpisodeId?: number | null;
	onEpisodeOpen?: (episodeId: number) => void;
	onEpisodeClose?: () => void;
}

function formatDate(dateString: string | null): string {
	if (!dateString) return '';
	try {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	} catch {
		return dateString;
	}
}

function formatDuration(duration: string | null): string {
	if (!duration) return '';
	// Handle HH:MM:SS or seconds format
	if (duration.includes(':')) return duration;
	const seconds = parseInt(duration);
	if (isNaN(seconds)) return duration;
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function PodcastDetailModal({
	subscription,
	opened,
	onClose,
	onSubscriptionUpdate,
	initialEpisodeId,
	onEpisodeOpen,
	onEpisodeClose
}: PodcastDetailModalProps) {
	const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedEpisode, setSelectedEpisode] = useState<EpisodeRecord | null>(null);
	const [episodeModalOpened, setEpisodeModalOpened] = useState(false);

	const { addToQueue: addMediaToQueue, removeFromQueue } = useMediaPlayer();

	// Track previous initialEpisodeId to detect changes (for back navigation)
	const prevInitialEpisodeIdRef = useRef<number | null | undefined>(undefined);

	const { addToQueue, addBatchToQueue, currentDownload, activeItems } = useDownloadContext();

	// Create a Set of episode IDs that are currently queued (pending)
	const queuedEpisodeIds = useMemo(() => {
		return new Set(
			activeItems
				.filter(item => item.status === 'pending')
				.map(item => item.episode_id)
		);
	}, [activeItems]);

	// Get the episode ID currently being downloaded
	const downloadingEpisodeId = currentDownload?.episodeId ?? null;

	const loadEpisodes = useCallback(async (subscriptionId: number) => {
		setIsLoading(true);
		setError(null);

		try {
			const [episodesRes] = await Promise.all([
				getEpisodes(subscriptionId, { limit: 5000 }),
				getEpisodeCounts(subscriptionId)
			]);
			setEpisodes(episodesRes.episodes);
			return episodesRes.episodes;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load episodes');
			return [];
		}
	}, []);

	// Handle initialEpisodeId changes (for back navigation and direct URL)
	useEffect(() => {
		// Skip if not opened
		if (!opened) return;

		const prevId = prevInitialEpisodeIdRef.current;
		const currentId = initialEpisodeId;

		// If episodeId was set and now is null/undefined -> close episode modal (back navigation)
		if (prevId != null && currentId == null) {
			setEpisodeModalOpened(false);
			setSelectedEpisode(null);
		}
		// If episodeId changed to a new value -> open that episode
		else if (currentId != null && currentId !== prevId && episodes.length > 0) {
			const episode = episodes.find(e => e.id === currentId);
			if (episode) {
				setSelectedEpisode(episode);
				setEpisodeModalOpened(true);
			}
		}

		prevInitialEpisodeIdRef.current = currentId;
	}, [initialEpisodeId, opened, episodes]);

	// Load episodes when modal opens
	useEffect(() => {
		if (opened && subscription?.id) {
			handleSync();
			loadEpisodes(subscription.id).then((loadedEpisodes) => {
				// If there's an initial episode ID, open that episode
				if (initialEpisodeId && loadedEpisodes.length > 0) {
					const episode = loadedEpisodes.find(e => e.id === initialEpisodeId);
					if (episode) {
						setSelectedEpisode(episode);
						setEpisodeModalOpened(true);
					}
				}
				// Set the ref after initial load
				prevInitialEpisodeIdRef.current = initialEpisodeId;
			});
		}
	}, [opened, subscription?.id]);

	// Reset state when modal closes
	useEffect(() => {
		if (!opened) {
			setEpisodes([]);
			setIsLoading(false);
			setError(null);
			setSelectedEpisode(null);
			setEpisodeModalOpened(false);
			prevInitialEpisodeIdRef.current = undefined;
		}
	}, [opened]);

	const sortedEpisodes = [...episodes].sort((a, b) =>
		new Date(b.pub_date || 0).getTime() - new Date(a.pub_date || 0).getTime()
	);

	const handleSync = async () => {
		if (!subscription?.id) return;

		try {
			const result = await syncEpisodes(subscription.id);
			if (result.added > 0) {
				notifications.show({
					color: 'teal',
					message: `Synced ${result.added} new episodes`,
					position: 'top-right',
					autoClose: 1500
				});
			}

			await loadEpisodes(subscription.id);
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to sync',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleDownloadEpisode = async (episode: EpisodeRecord, e: React.MouseEvent) => {
		e.stopPropagation();
		await addToQueue(episode.id);
		notifications.show({
			color: 'teal',
			message: `Added "${episode.title}" to download queue`,
			position: 'top-right',
			autoClose: 1500
		});
	};

	const handleDownloadAll = async () => {
		if (!subscription?.id) return;

		const notDownloaded = episodes.filter(e => !e.downloaded_at);
		if (notDownloaded.length === 0) {
			notifications.show({
				color: 'blue',
				message: 'All episodes already downloaded',
				position: 'top-right',
				autoClose: 1500
			});
			return;
		}

		await addBatchToQueue(notDownloaded.map(e => e.id));
		notifications.show({
			color: 'teal',
			message: `Added ${notDownloaded.length} episodes to download queue`,
			position: 'top-right',
			autoClose: 1500
		});
	};

	const handleEpisodeClick = (episode: EpisodeRecord) => {
		setSelectedEpisode(episode);
		setEpisodeModalOpened(true);
		onEpisodeOpen?.(episode.id);
	};

	const handleEpisodeClose = () => {
		setEpisodeModalOpened(false);
		setSelectedEpisode(null);
		onEpisodeClose?.();
	};

	const handlePodcastClose = () => {
		// Close episode modal first if open
		if (episodeModalOpened) {
			setEpisodeModalOpened(false);
			setSelectedEpisode(null);
		}
		onClose();
	};

	const handleEpisodeUpdate = (updatedEpisode: EpisodeRecord) => {
		setEpisodes(prev =>
			prev.map(e => e.id === updatedEpisode.id ? updatedEpisode : e)
		);
	};

	const handleAddToQueue = async (episode: EpisodeRecord, e: React.MouseEvent) => {
		e.stopPropagation();
		await addMediaToQueue(episode.id);
		notifications.show({
			color: 'cyan',
			message: `Added ${episode.title} to queue`,
			position: 'top-right',
			autoClose: 1500
		});
	};

	const renderEpisodeStatus = (episode: EpisodeRecord) => {
		if (episode.downloaded_at) {
			return (
				<Stack gap="xs">
					<ThemeIcon variant="light" color="teal" title="Downloaded">
						<CheckCircle size={16} />
					</ThemeIcon>
					<ActionIcon
						variant="light"
						color="cyan"
						onClick={(e) => handleAddToQueue(episode, e)}
						title="Add to Queue"
					>
						<ListPlus size={16} />
					</ActionIcon>
				</Stack>
			);
		}

		if (downloadingEpisodeId === episode.id) {
			return (
				<ThemeIcon variant="light" color="orange" title="Downloading...">
					<LoaderCircle size={16} className="spin" />
				</ThemeIcon>
			);
		}

		if (queuedEpisodeIds.has(episode.id)) {
			return (
				<ThemeIcon variant="light" color="grape" title="Queued for download">
					<Clock size={16} />
				</ThemeIcon>
			);
		}

		return (
			<ActionIcon
				variant="light"
				color="blue"
				onClick={(e) => handleDownloadEpisode(episode, e)}
				title="Download episode"
			>
				<Download size={16} />
			</ActionIcon>
		);
	};

	if (!subscription) return null;

	return (
		<>
			<Modal
				className="podcast-details"
				opened={opened}
				onClose={handlePodcastClose}
				withCloseButton={false}
				size="lg"
				centered
				overlayProps={{
					blur: 5,
				}}
				styles={{
					content: {
						display: 'flex',
						flexDirection: 'column',
						maxHeight: 'calc(100svh - 2rem)',
					},
					body: {
						display: 'flex',
						flexDirection: 'column',
						flex: 1,
						overflow: 'hidden',
						padding: 0,
					}
				}}
			>
				<Stack gap="0" style={{ flex: 1, overflow: 'hidden' }}>
					{/* Artwork - Episode Count - Close Button */}
					<Group
						className='bg-cover-image'
						px="md"
						pt="md"
						pb="xl"
						justify='space-between'
						style={{
							backgroundImage: `url(${subscription.artworkUrl600 || subscription.artworkUrl || 'https://placehold.co/300x300?text=No+Image'})`,
							position: 'relative'
						}}
					>
						<div className="bg-blury-overlay"></div>
						<Badge
							variant="filled"
							color="teal"
							style={{
								position: 'relative',
								zIndex: 1
							}}
						>
							{isLoading ? (
								<Loader size="xs" color="white" type="dots" />
							) : (
								<>{episodes.length} episodes</>
							)}
						</Badge>
						<ActionIcon
							radius="xl"
							size="lg"
							variant="white"
							c='var(--mantine-color-default-border)'
							onClick={handlePodcastClose}
							title="Close"
							style={{
								position: 'relative',
								zIndex: 1,
								borderColor: 'var(--mantine-color-default-border)'
							}}
						>
							<X size={18} />
						</ActionIcon>
					</Group>

					{/* Actions */}
					<Stack
						p="md"
						style={{
							flex: 1,
							overflow: 'hidden',
							minHeight: 0
						}}
					>
						<Group wrap="nowrap" gap="sm">
							<Button
								size="sm"
								variant="light"
								leftSection={<Download size={16} />}
								onClick={handleDownloadAll}
								disabled={isLoading || episodes.length === 0}
								style={{
									flex: '1 0 auto',
									maxWidth: '50%'
								}}
							>
								Download All
							</Button>
							<Button
								color="red"
								size="sm"
								variant="light"
								leftSection={<ArrowLeft size={16} />}
								onClick={handlePodcastClose}
								style={{
									flex: '1 1 0',
									minWidth: 0
								}}
							>
								Back
							</Button>
							<ActionIcon
								size="lg"
								variant="light"
								color="blue"
								title="Settings Menu"
								style={{ flex: '0 0 auto' }}
							>
								<Ellipsis size={16} />
							</ActionIcon>
						</Group>

						{/* Episodes list */}
						{error && (
							<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
								{error}
							</Alert>
						)}

						{isLoading ? (
							<ScrollArea style={{ flex: 1 }} scrollbars="y" scrollbarSize={4}>
								<Stack gap="xs">
									{[...Array(20).keys()].map(i => (
										<Skeleton key={i} height={60} radius="sm" />
									))}
								</Stack>
							</ScrollArea>
						) : episodes.length === 0 ? (
							<Text c="dimmed" ta="center" py="md">
								No episodes found. Try syncing to fetch episodes.
							</Text>
						) : (
							<ScrollArea style={{ flex: 1 }} scrollbars="y" scrollbarSize={4}>
								<Stack gap="xs">
									{sortedEpisodes.map((episode) => (
										<Card
											key={episode.id}
											p="sm"
											onClick={() => handleEpisodeClick(episode)}
											style={{ cursor: 'pointer' }}
										>
											<Group justify="space-between" align="flex-start" wrap="nowrap">
												<Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
													<Text size="sm" fw={500} lineClamp={2}>
														{episode.title}
													</Text>
													<Group gap="xs">
														<Text size="xs" c="dimmed">
															{formatDate(episode.pub_date)}
														</Text>
														{episode.duration && (
															<>
																<Text size="xs" c="dimmed">•</Text>
																<Text size="xs" c="dimmed">
																	{formatDuration(episode.duration)}
																</Text>
															</>
														)}
													</Group>
												</Stack>
												{renderEpisodeStatus(episode)}
											</Group>
										</Card>
									))}
								</Stack>
							</ScrollArea>
						)}
					</Stack>
				</Stack>
			</Modal>

			<EpisodeDetailModal
				episode={selectedEpisode}
				subscriptionName={subscription.name}
				opened={episodeModalOpened}
				onClose={handleEpisodeClose}
				onEpisodeUpdate={handleEpisodeUpdate}
			/>
		</>
	);
}

export default PodcastDetailModal;
