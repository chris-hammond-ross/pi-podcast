import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useMediaQuery } from '@mantine/hooks';
import { AlertCircle, Download, CheckCircle, ArrowLeft, Ellipsis, X, Clock, LoaderCircle } from 'lucide-react';
import type { Subscription } from '../services';
import { getEpisodes, getEpisodeCounts, syncEpisodes, type EpisodeRecord } from '../services';
import { useDownloadContext } from '../contexts';

interface PodcastDetailModalProps {
	subscription: Subscription | null;
	opened: boolean;
	onClose: () => void;
	onSubscriptionUpdate?: (subscription: Subscription) => void;
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

function PodcastDetailModal({ subscription, opened, onClose }: PodcastDetailModalProps) {
	const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Auto-download state
	// const [autoDownload, setAutoDownload] = useState(false);
	// const [autoDownloadLimit, setAutoDownloadLimit] = useState<number>(5);

	const isMobile = useMediaQuery('(max-width: 768px)');
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
		// Start loading
		setIsLoading(true);
		setError(null);

		try {
			const [episodesRes, countsRes] = await Promise.all([
				getEpisodes(subscriptionId, { limit: 5000 }),
				getEpisodeCounts(subscriptionId)
			]);
			setEpisodes(episodesRes.episodes);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load episodes');
		}
	}, []);

	// Load episodes and set auto-download state when modal opens
	useEffect(() => {
		if (opened && subscription?.id) {
			handleSync();
			loadEpisodes(subscription.id);
			// setAutoDownload(!!subscription.auto_download);
			// setAutoDownloadLimit(subscription.auto_download_limit || 5000);
		}
	}, [opened, subscription?.id, subscription?.auto_download, subscription?.auto_download_limit, loadEpisodes]);

	// Reset state when modal closes
	useEffect(() => {
		if (!opened) {
			setEpisodes([]);
			setIsLoading(false);
			setError(null);
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
					message: `Synced ${result.added} new episodes`
				});
			}

			// Reload episodes
			await loadEpisodes(subscription.id);
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to sync'
			});
		} finally {
			// Finish loading
			setIsLoading(false);
		}
	};

	const handleDownloadEpisode = async (episode: EpisodeRecord) => {
		await addToQueue(episode.id);
		notifications.show({
			color: 'teal',
			message: `Added "${episode.title}" to download queue`
		});
	};

	const handleDownloadAll = async () => {
		if (!subscription?.id) return;

		const notDownloaded = episodes.filter(e => !e.downloaded_at);
		if (notDownloaded.length === 0) {
			notifications.show({
				color: 'blue',
				message: 'All episodes already downloaded'
			});
			return;
		}

		await addBatchToQueue(notDownloaded.map(e => e.id));
		notifications.show({
			color: 'teal',
			message: `Added ${notDownloaded.length} episodes to download queue`
		});
	};

	// TODO: keep commented out functions until I figure out what to do
	/*const handleAutoDownloadChange = async (enabled: boolean) => {
		if (!subscription?.id) return;

		setIsUpdatingAutoDownload(true);
		try {
			const result = await updateAutoDownload(subscription.id, enabled, autoDownloadLimit);
			setAutoDownload(enabled);
			onSubscriptionUpdate?.(result.subscription);
			notifications.show({
				color: 'teal',
				message: enabled ? 'Auto-download enabled' : 'Auto-download disabled'
			});
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to update'
			});
		} finally {
			setIsUpdatingAutoDownload(false);
		}
	};*/

	/*const handleAutoDownloadLimitChange = async (value: number | string) => {
		const limit = typeof value === 'string' ? parseInt(value) : value;
		if (isNaN(limit) || limit < 1) return;

		setAutoDownloadLimit(limit);

		if (!subscription?.id || !autoDownload) return;

		// Debounce the API call
		setIsUpdatingAutoDownload(true);
		try {
			const result = await updateAutoDownload(subscription.id, autoDownload, limit);
			onSubscriptionUpdate?.(result.subscription);
		} catch (err) {
			// Silent fail for limit updates
		} finally {
			setIsUpdatingAutoDownload(false);
		}
	};*/

	// Render the appropriate status icon/button for an episode
	const renderEpisodeStatus = (episode: EpisodeRecord) => {
		// Already downloaded
		if (episode.downloaded_at) {
			return (
				<ThemeIcon
					variant="light"
					color="green"
					title="Downloaded"
				>
					<CheckCircle size={16} />
				</ThemeIcon>
			);
		}

		// Currently downloading
		if (downloadingEpisodeId === episode.id) {
			return (
				<ThemeIcon
					variant="light"
					color="orange"
					title="Downloading..."
				>
					<LoaderCircle size={16} className="spin" />
				</ThemeIcon>
			);
		}

		// Queued for download
		if (queuedEpisodeIds.has(episode.id)) {
			return (
				<ThemeIcon
					variant="light"
					color="grape"
					title="Queued for download"
				>
					<Clock size={16} />
				</ThemeIcon>
			);
		}

		// Not downloaded, not queued - show download button
		return (
			<ActionIcon
				variant="light"
				color="blue"
				onClick={() => handleDownloadEpisode(episode)}
				title="Download episode"
			>
				<Download size={16} />
			</ActionIcon>
		);
	};

	if (!subscription) return null;

	return (
		<Modal
			className="podcast-details"
			opened={opened}
			onClose={onClose}
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
						onClick={onClose}
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
							onClick={onClose}
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
							//onClick={() => handleDownloadEpisode(episode)}
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
						<ScrollArea
							style={{ flex: 1 }}
							scrollbars="y"
							scrollbarSize={4}
						>
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
						<ScrollArea
							style={{ flex: 1 }}
							scrollbars="y"
							scrollbarSize={4}
						>
							<Stack gap="xs">
								{sortedEpisodes.map((episode) => (
									<Card key={episode.id} p="sm">
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
															<Text size="xs" c="dimmed">
																•
															</Text>
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
	);
}

export default PodcastDetailModal;
