import { useState, useEffect, useCallback } from 'react';
import {
	Modal,
	Image,
	Text,
	Stack,
	Badge,
	Button,
	Group,
	Skeleton,
	Alert,
	Card,
	ActionIcon,
	ScrollArea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
//import { useMediaQuery } from '@mantine/hooks';
import { AlertCircle, Download, CheckCircle, ArrowLeft, Settings } from 'lucide-react';
import type { Subscription } from '../services';
import { getEpisodes, getEpisodeCounts, syncEpisodes, type EpisodeRecord, type EpisodeCounts } from '../services';
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
	const [counts, setCounts] = useState<EpisodeCounts | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Auto-download state
	const [autoDownload, setAutoDownload] = useState(false);
	const [autoDownloadLimit, setAutoDownloadLimit] = useState<number>(5);

	//const isMobile = useMediaQuery('(max-width: 768px)');
	const { addToQueue, addBatchToQueue } = useDownloadContext();

	const loadEpisodes = useCallback(async (subscriptionId: number) => {
		setIsLoading(true);
		setError(null);

		try {
			const [episodesRes, countsRes] = await Promise.all([
				getEpisodes(subscriptionId, { limit: 5000 }),
				getEpisodeCounts(subscriptionId)
			]);
			setEpisodes(episodesRes.episodes);
			setCounts(countsRes.counts);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load episodes');
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Load episodes and set auto-download state when modal opens
	useEffect(() => {
		if (opened && subscription?.id) {
			handleSync();
			loadEpisodes(subscription.id);
			setAutoDownload(!!subscription.auto_download);
			setAutoDownloadLimit(subscription.auto_download_limit || 5000);
		}
	}, [opened, subscription?.id, subscription?.auto_download, subscription?.auto_download_limit, loadEpisodes]);

	// Reset state when modal closes
	useEffect(() => {
		if (!opened) {
			setEpisodes([]);
			setCounts(null);
			setIsLoading(false);
			setIsSyncing(false);
			setError(null);
		}
	}, [opened]);

	const sortedEpisodes = [...episodes].sort((a, b) =>
		new Date(b.pub_date || 0).getTime() - new Date(a.pub_date || 0).getTime()
	);

	const handleSync = async () => {
		if (!subscription?.id) return;

		setIsSyncing(true);
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
			setIsSyncing(false);
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
					maxHeight: 'calc(100svh - 2rem)',  // or whatever max you want
				},
				body: {
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					overflow: 'hidden',
					padding: 0,  // we'll handle padding in children
				}
			}}
		>
			<Stack gap="0" style={{ flex: 1, overflow: 'hidden' }}>
				{/* Artwork */}
				{!isLoading && (
					<Badge
						variant="filled"
						color="teal"
						style={{
							position: 'absolute',
							right: '1rem',
							top: '1rem'
						}}
					>
						{episodes.length} episodes
					</Badge>
				)}
				<Image
					src={subscription.artworkUrl600 || subscription.artworkUrl}
					alt={subscription.name}
					mah="100%"
					maw="100%"
					height="auto"
					w="auto"
					fit="contain"
					fallbackSrc="https://placehold.co/300x300?text=No+Image"
				/>

				{/* Actions */}
				<Stack
					p="md"
					style={{
						flex: 1,
						overflow: 'hidden',
						minHeight: 0  // important for flex children to shrink
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
								minWidth: 0         // allow shrinking below content size
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
							style={{ flex: '0 0 auto' }}  // don't grow or shrink
						>
							<Settings size={16} />
						</ActionIcon>
					</Group>


					{/* Episodes list */}
					{error && (
						<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
							{error}
						</Alert>
					)}

					{isLoading ? (
						<Stack gap="xs">
							{[1, 2, 3].map(i => (
								<Skeleton key={i} height={60} radius="sm" />
							))}
						</Stack>
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
									<Card key={episode.id} withBorder p="sm">
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
											{episode.downloaded_at ? (
												<Badge
													color="green"
													variant="light"
													size="sm"
													leftSection={<CheckCircle size={12} />}
												>
													Downloaded
												</Badge>
											) : (
												<ActionIcon
													variant="light"
													color="blue"
													onClick={() => handleDownloadEpisode(episode)}
													title="Download episode"
												>
													<Download size={16} />
												</ActionIcon>
											)}
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
