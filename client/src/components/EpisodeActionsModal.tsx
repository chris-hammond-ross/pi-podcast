import { useState, useEffect } from 'react';
import {
	Modal,
	Stack,
	Button,
	Group,
	Text,
	ActionIcon,
	Divider,
	TextInput,
	UnstyledButton,
	Box,
	ScrollArea
} from '@mantine/core';
import {
	Ellipsis,
	ListPlus,
	Play,
	Trash2,
	ListEnd,
	ArrowLeft,
	ListMusic
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useLocation } from 'react-router-dom';
import { useEpisodesContext, useMediaPlayer } from '../contexts';
import {
	deleteEpisodeDownload,
	getUserPlaylists,
	createUserPlaylist,
	addEpisodeToPlaylist
} from '../services';
import type { EpisodeRecord, UserPlaylist } from '../services';

interface EpisodeActionsModalProps {
	episodeId: number;
	subscriptionName?: string;
	onEpisodeDeleted?: (episodeId: number) => void;
}

function EpisodeActionsModal({ episodeId, subscriptionName, onEpisodeDeleted }: EpisodeActionsModalProps) {
	const [modalOpened, setModalOpened] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isShowingPlaylistInterface, setIsShowingPlaylistInterface] = useState(false);
	const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
	const location = useLocation();

	// Playlist state
	const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
	const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
	const [newPlaylistName, setNewPlaylistName] = useState('');
	const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
	const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);

	const { getEpisodeById, updateEpisode } = useEpisodesContext();
	const { play, addToQueue, removeEpisodeFromQueue } = useMediaPlayer();

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

	// Load user playlists when playlist interface is shown
	useEffect(() => {
		if (isShowingPlaylistInterface) {
			loadUserPlaylists();
		}
	}, [isShowingPlaylistInterface]);

	const loadUserPlaylists = async () => {
		setIsLoadingPlaylists(true);
		try {
			const response = await getUserPlaylists();
			setUserPlaylists(response.playlists);
		} catch (err) {
			console.error('Failed to load playlists:', err);
			notifications.show({
				color: 'red',
				message: 'Failed to load playlists',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsLoadingPlaylists(false);
		}
	};

	const handleActionsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setModalOpened(true);
	};

	const handleModalClose = () => {
		setModalOpened(false);
		setIsShowingPlaylistInterface(false);
		setNewPlaylistName('');
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
			// First, remove from queue if present (this also handles stopping playback if needed)
			try {
				const queueResult = await removeEpisodeFromQueue(episode.id);
				if (queueResult.wasPlaying) {
					console.log('[EpisodeActionsModal] Episode was playing, stopped playback');
				}
				if (queueResult.removed) {
					console.log('[EpisodeActionsModal] Episode removed from queue');
				}
			} catch (queueErr) {
				// Queue removal is best-effort, continue with deletion
				console.warn('[EpisodeActionsModal] Could not remove from queue:', queueErr);
			}

			// Delete the file and database entry
			await deleteEpisodeDownload(episode.id);

			// Update episode in cache to reflect it's no longer downloaded
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

			// Notify parent component that episode was deleted
			if (onEpisodeDeleted) {
				onEpisodeDeleted(episode.id);
			}

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

	const handlePlaylistInterface = () => {
		setIsShowingPlaylistInterface(true);
	};

	const isPlaylistNameValid = () => {
		const trimmedName = newPlaylistName.trim();
		if (!trimmedName) return false;
		// Check if name already exists (case-insensitive)
		return !userPlaylists.some(
			playlist => playlist.name.toLowerCase() === trimmedName.toLowerCase()
		);
	};

	const handleCreatePlaylistAndAdd = async () => {
		if (!episode || !isPlaylistNameValid()) return;

		setIsCreatingPlaylist(true);
		try {
			// Create the new playlist
			const createResponse = await createUserPlaylist(newPlaylistName.trim());
			const newPlaylist = createResponse.playlist;

			// Add the episode to the new playlist
			await addEpisodeToPlaylist(newPlaylist.id, episode.id);

			notifications.show({
				color: 'teal',
				message: `Created "${newPlaylist.name}" and added episode`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to create playlist',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsCreatingPlaylist(false);
		}
	};

	const handleAddToExistingPlaylist = async (playlist: UserPlaylist) => {
		if (!episode) return;

		setIsAddingToPlaylist(true);
		try {
			await addEpisodeToPlaylist(playlist.id, episode.id);

			notifications.show({
				color: 'teal',
				message: `Added to "${playlist.name}"`,
				position: 'top-right',
				autoClose: 1200
			});
			handleModalClose();
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to add to playlist',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsAddingToPlaylist(false);
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
						overflow: 'hidden'
					}
				}}
			>
				<Stack
					gap="md"
					style={{
						flex: 1,
						overflow: 'hidden'
					}}
				>
					{/* Header */}
					<Group
						justify="space-between"
						align="flex-start"
						style={{
							flexShrink: 0
						}}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							<Text fw={600} size="lg" lineClamp={2}>
								{episode.title}
							</Text>
							<Text size="sm" c="dimmed" lineClamp={1} mt={4}>
								{subscriptionName}
							</Text>
						</div>
					</Group>

					{isShowingPlaylistInterface ? (
						<>

							<Stack
								gap="xs"
								style={{
									flex: 1,
									overflow: 'hidden'
								}}
							>
								<Box
									style={{
										flexShrink: 0
									}}
								>
									<Button
										variant="light"
										color="blue"
										leftSection={<ArrowLeft size={16} />}
										onClick={() => {
											setIsShowingPlaylistInterface(false);
											setNewPlaylistName('');
										}}
										fullWidth
									>
										Return
									</Button>
								</Box>

								<Divider my="xs" label="Create a new playlist" labelPosition="center" />

								{/* Create new playlist section */}
								<Group gap="xs">
									<TextInput
										placeholder="New playlist name"
										value={newPlaylistName}
										onChange={(e) => setNewPlaylistName(e.currentTarget.value)}
										style={{ flex: 1 }}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && isPlaylistNameValid()) {
												handleCreatePlaylistAndAdd();
											}
										}}
									/>
									<Button
										variant="light"
										color="grape"
										onClick={handleCreatePlaylistAndAdd}
										loading={isCreatingPlaylist}
										disabled={!isPlaylistNameValid()}
									>
										Create
									</Button>
								</Group>
								{newPlaylistName.trim() && !isPlaylistNameValid() && (
									<Text size="xs" c="red">
										A playlist with this name already exists
									</Text>
								)}

								<Divider my="xs" label="Choose an existing playlist" labelPosition="center" />

								{/* Existing playlists list */}
								{isLoadingPlaylists ? (
									<Text size="sm" c="dimmed" ta="center" py="md">
										Loading playlists...
									</Text>
								) : userPlaylists.length === 0 ? (
									<Text size="sm" c="dimmed" ta="center" py="md">
										No playlists yet. Create one above!
									</Text>
								) : (
									<ScrollArea.Autosize
										style={{
											flex: 1
										}}
										scrollbars="y"
										scrollbarSize={4}
									>
										<Stack gap="xs">
											{userPlaylists.map((playlist) => (
												<UnstyledButton
													className='episode-playlist-row-button'
													key={playlist.id}
													onClick={() => handleAddToExistingPlaylist(playlist)}
													disabled={isAddingToPlaylist}
													style={{
														padding: '12px',
														borderRadius: '8px',
														transition: 'background-color 150ms ease',
														opacity: isAddingToPlaylist ? 0.6 : 1,
														cursor: isAddingToPlaylist ? 'wait' : 'pointer'
													}}
												>
													<Group gap="sm">
														<Box
															style={{
																width: 40,
																height: 40,
																backgroundColor: 'var(--mantine-color-grape-light)',
																display: 'flex',
																alignItems: 'center',
																justifyContent: 'center'
															}}
														>
															<ListMusic size={20} color="var(--mantine-color-grape-light-color)" />
														</Box>
														<div style={{ flex: 1, minWidth: 0 }}>
															<Text size="sm" fw={500} lineClamp={1}>
																{playlist.name}
															</Text>
															<Text size="xs" c="dimmed">
																{playlist.episode_count} {playlist.episode_count === 1 ? 'episode' : 'episodes'}
															</Text>
														</div>
													</Group>
												</UnstyledButton>
											))}
										</Stack>
									</ScrollArea.Autosize>
								)}
							</Stack>
						</>
					) : (
						<>
							{/* Action Buttons */}
							< Stack gap="xs">
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
									leftSection={<ListEnd size={16} />}
									onClick={handleAddToQueue}
									fullWidth
								>
									Add to Queue
								</Button>
								<Button
									variant="light"
									color="grape"
									leftSection={<ListPlus size={16} />}
									onClick={handlePlaylistInterface}
									fullWidth
								>
									Add to Playlist
								</Button>
								<Divider my="md" />
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
						</>
					)}
				</Stack>
			</Modal >
		</>
	);
}

export default EpisodeActionsModal;
