import { useState, useEffect } from 'react';
import { Modal, Stack, Button, Group, Text, ActionIcon } from '@mantine/core';
import { Ellipsis, ListPlus, Play, Trash2 } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useLocation } from 'react-router-dom';
import { useEpisodesContext, useMediaPlayer } from '../contexts';
import { deleteEpisodeDownload } from '../services';
import type { EpisodeRecord } from '../services';

interface EpisodeActionsModalProps {
	episodeId: number;
	subscriptionName?: string;
}

function EpisodeActionsModal({ episodeId, subscriptionName }: EpisodeActionsModalProps) {
	const [modalOpened, setModalOpened] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
	const location = useLocation();

	const { getEpisodeById, updateEpisode } = useEpisodesContext();
	const { play, addToQueue } = useMediaPlayer();

	// Load episode data
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

	// Handle browser back button to close modal
	useEffect(() => {
		const handlePopState = () => {
			if (modalOpened) {
				setModalOpened(false);
			}
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, [modalOpened]);

	const handleActionsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setModalOpened(true);
	};

	const handleModalClose = () => {
		setModalOpened(false);
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
				message: `Now playing "${episode.title}"`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to play episode',
				position: 'top-right',
				autoClose: 3000
			});
			handleModalClose();
		}
	};

	const handleAddToQueue = async () => {
		if (!episode) return;

		try {
			await addToQueue(episode.id);
			notifications.show({
				color: 'teal',
				message: `Added "${episode.title}" to queue`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to add episode to queue',
				position: 'top-right',
				autoClose: 3000
			});
			handleModalClose();
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
				message: `Deleted "${episode.title}"`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to delete',
				position: 'top-right',
				autoClose: 3000
			});
			handleModalClose();
		} finally {
			setIsDeleting(false);
		}
	};

	if (!episode) return null;

	return (
		<>
			<ActionIcon
				variant="light"
				color="cyan"
				onClick={(e) => {
					e.stopPropagation();
					handleActionsClick(e);
				}}
				title="Episode options"
			>
				<Ellipsis size={16} />
			</ActionIcon>

			<Modal
				opened={modalOpened}
				onClose={handleModalClose}
				withCloseButton={false}
				size="sm"
				centered
				overlayProps={{
					blur: 5
				}}
				onClick={(e) => e.stopPropagation()}
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

export default EpisodeActionsModal;