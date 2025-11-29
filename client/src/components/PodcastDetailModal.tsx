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
	ScrollArea,
	Divider,
	Switch,
	NumberInput
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AlertCircle, Download, CheckCircle, RefreshCw, DownloadCloud } from 'lucide-react';
import type { Subscription } from '../services';
import { getEpisodes, getEpisodeCounts, syncEpisodes, updateAutoDownload, type EpisodeRecord, type EpisodeCounts } from '../services';
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

function PodcastDetailModal({ subscription, opened, onClose, onSubscriptionUpdate }: PodcastDetailModalProps) {
	const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
	const [counts, setCounts] = useState<EpisodeCounts | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	
	// Auto-download state
	const [autoDownload, setAutoDownload] = useState(false);
	const [autoDownloadLimit, setAutoDownloadLimit] = useState<number>(5);
	const [isUpdatingAutoDownload, setIsUpdatingAutoDownload] = useState(false);

	const { addToQueue, addBatchToQueue, syncAndQueue } = useDownloadContext();

	const loadEpisodes = useCallback(async (subscriptionId: number) => {
		setIsLoading(true);
		setError(null);

		try {
			const [episodesRes, countsRes] = await Promise.all([
				getEpisodes(subscriptionId, { limit: 50 }),
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
			loadEpisodes(subscription.id);
			setAutoDownload(!!subscription.auto_download);
			setAutoDownloadLimit(subscription.auto_download_limit || 5);
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

	const handleSync = async () => {
		if (!subscription?.id) return;

		setIsSyncing(true);
		try {
			const result = await syncEpisodes(subscription.id);
			notifications.show({
				color: 'teal',
				message: `Synced ${result.added} new episodes`
			});
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

	const handleSyncAndDownload = async () => {
		if (!subscription?.id) return;

		setIsSyncing(true);
		try {
			await syncAndQueue(subscription.id);
			notifications.show({
				color: 'teal',
				message: 'Synced and queued new episodes for download'
			});
			// Reload episodes
			await loadEpisodes(subscription.id);
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to sync and download'
			});
		} finally {
			setIsSyncing(false);
		}
	};

	const handleAutoDownloadChange = async (enabled: boolean) => {
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
	};

	const handleAutoDownloadLimitChange = async (value: number | string) => {
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
	};

	if (!subscription) return null;

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			size="lg"
			title={subscription.name}
			centered
			overlayProps={{
				blur: 5,
			}}
		>
			<Stack gap="md">
				{/* Header with artwork and actions */}
				<Group align="flex-start" wrap="nowrap">
					<Image
						src={subscription.artworkUrl600 || subscription.artworkUrl}
						alt={subscription.name}
						w={100}
						h={100}
						radius="md"
					/>
					<Stack gap="xs" style={{ flex: 1 }}>
						<Text size="sm" c="dimmed">{subscription.artist}</Text>
						{counts && (
							<Group gap="xs">
								<Badge color="blue" variant="light" size="sm">
									{counts.total} episodes
								</Badge>
								<Badge color="green" variant="light" size="sm">
									{counts.downloaded} downloaded
								</Badge>
							</Group>
						)}
						<Group gap="xs">
							<Button
								size="xs"
								variant="light"
								leftSection={<RefreshCw size={14} />}
								onClick={handleSync}
								loading={isSyncing}
							>
								Sync
							</Button>
							<Button
								size="xs"
								variant="light"
								leftSection={<DownloadCloud size={14} />}
								onClick={handleSyncAndDownload}
								loading={isSyncing}
							>
								Sync & Download
							</Button>
							<Button
								size="xs"
								variant="filled"
								leftSection={<Download size={14} />}
								onClick={handleDownloadAll}
								disabled={isLoading || episodes.length === 0}
							>
								Download All
							</Button>
						</Group>
					</Stack>
				</Group>

				{/* Auto-download settings */}
				<Card withBorder p="sm">
					<Group justify="space-between" align="center">
						<div>
							<Text size="sm" fw={500}>Auto-download</Text>
							<Text size="xs" c="dimmed">Automatically download new episodes</Text>
						</div>
						<Group gap="sm">
							{autoDownload && (
								<NumberInput
									size="xs"
									w={70}
									min={1}
									max={100}
									value={autoDownloadLimit}
									onChange={handleAutoDownloadLimitChange}
									disabled={isUpdatingAutoDownload}
								/>
							)}
							<Switch
								checked={autoDownload}
								onChange={(e) => handleAutoDownloadChange(e.currentTarget.checked)}
								disabled={isUpdatingAutoDownload}
							/>
						</Group>
					</Group>
				</Card>

				<Divider />

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
					<ScrollArea h={350}>
						<Stack gap="xs">
							{episodes.map((episode) => (
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
													<Text size="xs" c="dimmed">
														• {formatDuration(episode.duration)}
													</Text>
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
		</Modal>
	);
}

export default PodcastDetailModal;
