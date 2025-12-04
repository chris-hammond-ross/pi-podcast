import { useEffect, useState } from 'react';
import { Card, Group, Text, ActionIcon, Skeleton, Badge, Modal, Stack, Button } from '@mantine/core';
import { Ellipsis, ListPlus, Play, Trash2, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useLocation } from 'react-router-dom';
import { useEpisodesContext, useDownloadContext, useMediaPlayer } from '../contexts';
import { deleteEpisodeDownload } from '../services';
import EpisodeDetailModal from './EpisodeDetailModal';
import type { EpisodeRecord } from '../services';

interface EpisodeRowProps {
	episodeId: number;
	subscriptionName?: string;
	showDownloadStatus?: boolean;
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

function EpisodeRow({
	episodeId,
	subscriptionName,
	showDownloadStatus = true
}: EpisodeRowProps) {
	const [detailModalOpened, setDetailModalOpened] = useState(false);
	const [actionsModalOpened, setActionsModalOpened] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const { getEpisodeById, updateEpisode, isLoading: isEpisodeLoading } = useEpisodesContext();
	const { currentDownload } = useDownloadContext();
	const { play, currentEpisode, isPlaying, addToQueue } = useMediaPlayer();
	const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
	const location = useLocation();

	// Load episode on mount or when episodeId changes
	useEffect(() => {
		let mounted = true;

		const loadEpisode = async () => {
			const ep = await getEpisodeById(episodeId);
			if (mounted && ep) {
				setEpisode(ep);
			}
		};

		loadEpisode();

		return () => {
			mounted = false;
		};
	}, [episodeId, getEpisodeById]);

	// Handle browser back button to close modals
	useEffect(() => {
		const handlePopState = () => {
			if (detailModalOpened) {
				setDetailModalOpened(false);
			}
			if (actionsModalOpened) {
				setActionsModalOpened(false);
			}
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, [detailModalOpened, actionsModalOpened]);

	const handleCardClick = () => {
		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setDetailModalOpened(true);
	};

	const handleDetailModalClose = () => {
		setDetailModalOpened(false);
		// Go back if we pushed a state
		if (window.history.state !== null) {
			window.history.back();
		}
	};

	const handleActionsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setActionsModalOpened(true);
	};

	const handleActionsModalClose = () => {
		setActionsModalOpened(false);
		// Go back if we pushed a state
		if (window.history.state !== null) {
			window.history.back();
		}
	};

	const handlePlay = async () => {
		if (!episode) return;

		try {
			await play(episode.id);
			notifications.show({
				color: 'teal',
				message: `Now playing "${episode.title}"`
			});
			handleActionsModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to play episode'
			});
		}
	};

	const handleAddToQueue = async () => {
		if (!episode) return;

		try {
			await addToQueue(episode.id);
			notifications.show({
				color: 'teal',
				message: `Added "${episode.title}" to queue`
			});
			handleActionsModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to add episode to queue'
			});
		}
	};

	const handleDelete = async () => {
		if (!episode) return;

		setIsDeleting(true);
		try {
			await deleteEpisodeDownload(episode.id);

			// Update cache
			updateEpisode(episode.id, {
				downloaded_at: null,
				file_path: null,
				file_size: null
			});

			// Update local state
			setEpisode(prev => prev ? {
				...prev,
				downloaded_at: null,
				file_path: null,
				file_size: null
			} : null);

			notifications.show({
				color: 'teal',
				message: `Deleted "${episode.title}"`
			});
			handleActionsModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to delete'
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const handleEpisodeUpdate = (updatedEpisode: EpisodeRecord) => {
		setEpisode(updatedEpisode);
		updateEpisode(updatedEpisode.id, updatedEpisode);
	};

	// Show loading skeleton if episode is being fetched
	if (isEpisodeLoading(episodeId) || !episode) {
		return (
			<Card withBorder p="sm">
				<Group justify="space-between" align="center" wrap="nowrap">
					<div style={{ flex: 1, minWidth: 0 }}>
						<Skeleton height={16} width="70%" mb={8} />
						<Skeleton height={12} width="50%" />
					</div>
					<Skeleton height={28} width={28} circle />
				</Group>
			</Card>
		);
	}

	const isDownloading = currentDownload?.episodeId === episode.id;
	const isCurrentlyPlaying = currentEpisode?.id === episode.id && isPlaying;

	return (
		<>
			<Card
				withBorder
				p="sm"
				onClick={handleCardClick}
				style={{ cursor: 'pointer' }}
			>
				<Group justify="space-between" align="center" wrap="nowrap">
					<div style={{ flex: 1, minWidth: 0 }}>
						<Group gap="xs" wrap="nowrap">
							<Text size="sm" truncate style={{ flex: 1 }}>
								{episode.title}
							</Text>
							{showDownloadStatus && (
								<>
									{isCurrentlyPlaying && (
										<Badge variant="light" color="teal" size="xs">
											Playing
										</Badge>
									)}
									{isDownloading && (
										<Badge variant="light" color="orange" size="xs">
											Downloading
										</Badge>
									)}
								</>
							)}
						</Group>
						<Text size="xs" c="dimmed" truncate>
							{subscriptionName && `${subscriptionName} • `}
							{episode.pub_date && formatDate(episode.pub_date)}
							{episode.duration && ` • ${episode.duration}`}
						</Text>
					</div>

					<ActionIcon
						variant="light"
						color="cyan"
						onClick={handleActionsClick}
						title="Episode options"
					>
						<Ellipsis size={16} />
					</ActionIcon>
				</Group>
			</Card>

			{/* Episode Detail Modal */}
			<EpisodeDetailModal
				episode={episode}
				subscriptionName={subscriptionName}
				opened={detailModalOpened}
				onClose={handleDetailModalClose}
				onEpisodeUpdate={handleEpisodeUpdate}
			/>

			{/* Actions Modal */}
			<Modal
				opened={actionsModalOpened}
				onClose={handleActionsModalClose}
				withCloseButton={false}
				size="sm"
				centered
				overlayProps={{
					blur: 5
				}}
			>
				<Stack gap="md">
					{/* Header */}
					<Group justify="space-between" align="flex-start">
						<div style={{ flex: 1, minWidth: 0 }}>
							<Text fw={600} size="lg" lineClamp={2}>
								{episode.title}
							</Text>
							<Text size="sm" c="dimmed" lineClamp={1} mt={4}>
								{subscriptionName}
							</Text>
						</div>
					</Group>

					{/* Action Buttons */}
					<Stack gap="xs">
						<Button
							variant="light"
							color="teal"
							leftSection={<Play size={16} />}
							onClick={handlePlay}
							fullWidth
						>
							Play Episode
						</Button>
						<Button
							variant="light"
							color="cyan"
							leftSection={<ListPlus size={16} />}
							onClick={handleAddToQueue}
							fullWidth
						>
							Add to Queue
						</Button>
						<Button
							variant="light"
							color="red"
							leftSection={<Trash2 size={16} />}
							onClick={handleDelete}
							loading={isDeleting}
							fullWidth
						>
							Delete
						</Button>
					</Stack>
				</Stack>
			</Modal>
		</>
	);
}

export default EpisodeRow;
