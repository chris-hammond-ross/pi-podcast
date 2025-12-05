import { useState, useMemo } from 'react';
import {
	Modal,
	Text,
	Stack,
	Button,
	Group,
	ScrollArea,
	ActionIcon,
	Badge
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Download, Trash2, X, Clock, Loader, Play, Pause } from 'lucide-react';
import { useDownloadContext, useMediaPlayer } from '../contexts';
import { deleteEpisodeDownload } from '../services';
import type { EpisodeRecord } from '../services';

interface EpisodeDetailModalProps {
	episode: EpisodeRecord | null;
	subscriptionName?: string;
	opened: boolean;
	onClose: () => void;
	onEpisodeUpdate?: (episode: EpisodeRecord) => void;
}

function formatDate(dateString: string | null): string {
	if (!dateString) return '';
	try {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	} catch {
		return dateString;
	}
}

function formatDuration(duration: string | null): string {
	if (!duration) return '';
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

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}

function EpisodeDetailModal({
	episode,
	subscriptionName,
	opened,
	onClose,
	onEpisodeUpdate
}: EpisodeDetailModalProps) {
	const [isDeleting, setIsDeleting] = useState(false);
	const [isMediaLoading, setIsMediaLoading] = useState(false);
	const { addToQueue, currentDownload, activeItems } = useDownloadContext();
	const {
		play,
		pause,
		currentEpisode,
		isPlaying,
		isPaused,
		error: mediaError
	} = useMediaPlayer();

	// Check if this episode is currently downloading
	const isDownloading = currentDownload?.episodeId === episode?.id;

	// Check if this episode is queued (pending)
	const isQueued = useMemo(() => {
		if (!episode) return false;
		return activeItems.some(
			item => item.episode_id === episode.id && item.status === 'pending'
		);
	}, [activeItems, episode]);

	// Check if this episode is currently playing
	const isCurrentlyPlaying = currentEpisode?.id === episode?.id && isPlaying && !isPaused;
	const isCurrentlyPaused = currentEpisode?.id === episode?.id && isPaused;

	const isDownloaded = !!episode?.downloaded_at;

	const handleDownload = async () => {
		if (!episode) return;

		await addToQueue(episode.id);
		notifications.show({
			color: 'teal',
			message: `Added "${episode.title}" to download queue`,
			position: 'top-right',
			autoClose: 1200
		});
		onClose();
	};

	const handleDelete = async () => {
		if (!episode) return;

		setIsDeleting(true);
		try {
			await deleteEpisodeDownload(episode.id);
			notifications.show({
				color: 'teal',
				message: `Deleted "${episode.title}"`,
				position: 'top-right',
				autoClose: 1200
			});
			if (onEpisodeUpdate) {
				onEpisodeUpdate({
					...episode,
					downloaded_at: null,
					file_path: null,
					file_size: null
				});
			}
			onClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to delete',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const handlePlay = async () => {
		if (!episode) return;

		setIsMediaLoading(true);
		try {
			await play(episode.id);
			notifications.show({
				color: 'teal',
				message: `Now playing "${episode.title}"`,
				position: 'top-right',
				autoClose: 1200
			});
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to play episode',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsMediaLoading(false);
		}
	};

	const handlePause = async () => {
		setIsMediaLoading(true);
		try {
			await pause();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to pause',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsMediaLoading(false);
		}
	};

	if (!episode) return null;

	const description = episode.description ? stripHtml(episode.description) : '';

	const renderActionButton = () => {
		if (isDownloaded) {
			return (
				<Group gap="sm" grow w="100%">
					<Button
						variant="light"
						color="red"
						leftSection={<Trash2 size={16} />}
						onClick={handleDelete}
						loading={isDeleting}
					>
						Delete
					</Button>
					{isCurrentlyPlaying ? (
						<Button
							variant="light"
							color="orange"
							leftSection={<Pause size={16} />}
							onClick={handlePause}
							loading={isMediaLoading}
						>
							Pause
						</Button>
					) : (
						<Button
							variant="light"
							color="teal"
							leftSection={<Play size={16} />}
							onClick={handlePlay}
							loading={isMediaLoading}
						>
							{isCurrentlyPaused ? 'Resume' : 'Play'}
						</Button>
					)}
				</Group>
			);
		}

		if (isDownloading) {
			return (
				<Button
					fullWidth
					variant="light"
					color="orange"
					leftSection={<Loader size={16} className="spin" />}
					disabled
				>
					Downloading...
				</Button>
			);
		}

		if (isQueued) {
			return (
				<Button
					fullWidth
					variant="light"
					color="grape"
					leftSection={<Clock size={16} />}
					disabled
				>
					Queued
				</Button>
			);
		}

		return (
			<Button
				fullWidth
				variant="light"
				leftSection={<Download size={16} />}
				onClick={handleDownload}
			>
				Download Episode
			</Button>
		);
	};

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			withCloseButton={false}
			size="md"
			centered
			overlayProps={{
				blur: 5
			}}
			styles={{
				content: {
					display: 'flex',
					flexDirection: 'column',
					maxHeight: 'calc(100svh - 2rem)'
				},
				body: {
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					overflow: 'hidden',
					padding: 0
				}
			}}
		>
			<Stack gap="0" style={{ flex: 1, overflow: 'hidden' }}>
				{/* Header */}
				<Group
					p="md"
					justify="space-between"
					align="flex-start"
					style={{
						borderBottom: '1px solid var(--mantine-color-default-border)'
					}}
				>
					<Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
						<Text fw={600} size="lg" lineClamp={2}>
							{episode.title}
						</Text>
						{subscriptionName && (
							<Text size="sm" c="dimmed">
								{subscriptionName}
							</Text>
						)}
						<Group gap="xs">
							{episode.pub_date && (
								<Badge variant="light" color="gray" size="sm">
									{formatDate(episode.pub_date)}
								</Badge>
							)}
							{episode.duration && (
								<Badge variant="light" color="gray" size="sm">
									{formatDuration(episode.duration)}
								</Badge>
							)}
							{isDownloaded && (
								<Badge variant="light" color="green" size="sm">
									Downloaded
								</Badge>
							)}
							{isDownloading && (
								<Badge variant="light" color="orange" size="sm">
									Downloading
								</Badge>
							)}
							{isQueued && (
								<Badge variant="light" color="grape" size="sm">
									Queued
								</Badge>
							)}
							{isCurrentlyPlaying && (
								<Badge variant="light" color="teal" size="sm">
									Playing
								</Badge>
							)}
							{isCurrentlyPaused && (
								<Badge variant="light" color="yellow" size="sm">
									Paused
								</Badge>
							)}
						</Group>
					</Stack>
					<ActionIcon
						radius="xl"
						size="lg"
						variant="light"
						onClick={onClose}
						title="Close"
					>
						<X size={18} />
					</ActionIcon>
				</Group>

				{/* Description */}
				<ScrollArea
					style={{ flex: 1 }}
					scrollbars="y"
					scrollbarSize={4}
					p="md"
				>
					{description ? (
						<Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
							{description}
						</Text>
					) : (
						<Text size="sm" c="dimmed" ta="center">
							No show notes available for this episode.
						</Text>
					)}
				</ScrollArea>

				{/* Actions */}
				<Group p="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
					{renderActionButton()}
				</Group>
			</Stack>
		</Modal>
	);
}

export default EpisodeDetailModal;
