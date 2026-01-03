import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	useDroppable,
	DragOverlay,
	pointerWithin,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
	arrayMove,
} from '@dnd-kit/sortable';
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Card,
	Text,
	Group,
	ActionIcon,
	Loader,
	Center,
	Button,
	Modal,
	TextInput
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useTheme } from '../contexts';
import { Pencil, Play, X, PencilLine, Trash, Save, GripHorizontal, Check, Plus } from 'lucide-react';
import { useAutoPlaylists, useUserPlaylists } from '../hooks';
import type { AutoPlaylist, PlaylistEpisode } from '../services';
import {
	getEpisodes,
	getPlaylistEpisodes,
	clearQueue,
	addMultipleToQueue,
	playQueueIndex,
	updateUserPlaylist,
	deleteUserPlaylist,
	updatePlaylistEpisodes
} from '../services';
import { formatDuration } from '../utilities';

const TRASH_DROP_ID = 'trash-drop-zone';

const validTabs = ['auto', 'playlists'];

interface SortablePlaylistItemProps {
	episode: PlaylistEpisode;
}

function SortablePlaylistItem({ episode }: SortablePlaylistItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: episode.id });

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
		>
			<Group justify="space-between" align="center" wrap="nowrap">
				<div style={{ flex: 1, minWidth: 0 }}>
					<Group gap={4} wrap="nowrap">
						<Text
							size="sm"
							truncate
							style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
						>
							{episode.title}
						</Text>
						{episode.duration && (
							<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
								• {formatDuration(episode.duration)}
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

function TrashDropZone() {
	const { isOver, setNodeRef } = useDroppable({
		id: TRASH_DROP_ID,
	});

	return (
		<Group
			ref={setNodeRef}
			h={36}
			justify='center'
			style={{
				border: `2px dashed ${isOver ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-red-text)'}`,
				borderRadius: 'var(--mantine-radius-md)',
				backgroundColor: isOver ? 'var(--mantine-color-red-light)' : 'transparent',
				transition: 'all 150ms ease',
			}}
		>
			<Trash size={16} color={isOver ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-red-text)'} />
			<Text c={isOver ? 'var(--mantine-color-red-filled)' : 'red'} fw={isOver ? 600 : 400}>
				Drop here to remove episode
			</Text>
		</Group>
	);
}

/**
 * Compare two episode arrays to determine if there are changes
 * Returns true if there are differences (order changed or episodes removed)
 */
function hasPlaylistChanges(original: PlaylistEpisode[], current: PlaylistEpisode[]): boolean {
	// Different lengths means episodes were removed
	if (original.length !== current.length) {
		return true;
	}

	// Check if order or content has changed
	for (let i = 0; i < original.length; i++) {
		if (original[i].id !== current[i].id) {
			return true;
		}
	}

	return false;
}

function Playlists() {
	const [editMode, setEditMode] = useState(false);
	const [editingPlaylist, setEditingPlaylist] = useState<AutoPlaylist | null>(null);
	const [originalEpisodes, setOriginalEpisodes] = useState<PlaylistEpisode[]>([]);
	const [editingEpisodes, setEditingEpisodes] = useState<PlaylistEpisode[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	// Rename modal state
	const [renameModalOpened, setRenameModalOpened] = useState(false);
	const [renameValue, setRenameValue] = useState('');
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);

	// Delete modal state
	const [deleteModalOpened, setDeleteModalOpened] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { playlists: autoPlaylists, isLoading: autoIsLoading, error: autoError } = useAutoPlaylists();
	const { playlists: userPlaylists, isLoading: userIsLoading, error: userError, refresh: refreshUserPlaylists } = useUserPlaylists();
	const isMobile = useMediaQuery('(max-width: 768px)');

	const { tab } = useParams<{ tab: string; }>();
	const navigate = useNavigate();
	const { theme } = useTheme();

	const buttonColor = theme.navigation;

	// Determine current tab from URL or default
	const currentTab = tab && validTabs.includes(tab) ? tab : 'auto';

	const handleTabChange = useCallback((value: string | null) => {
		if (value && validTabs.includes(value)) {
			navigate(`/playlists/${value}`);
		}
	}, [navigate]);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Determine if there are unsaved changes
	const hasChanges = useMemo(() => {
		return hasPlaylistChanges(originalEpisodes, editingEpisodes);
	}, [originalEpisodes, editingEpisodes]);

	const handlePlayAutoPlaylist = async (subscriptionId: number) => {
		try {
			// Get all downloaded episodes for this subscription, sorted by pub_date DESC
			const response = await getEpisodes(subscriptionId, {
				downloaded: true,
				orderBy: 'pub_date',
				order: 'DESC'
			});

			if (response.episodes.length === 0) {
				console.warn('[Playlists] No downloaded episodes to play');
				return;
			}

			const episodeIds = response.episodes.map(ep => ep.id);

			// Clear the queue first, then add all episodes, then play the first one
			// This avoids the race condition where playEpisode + addMultipleToQueue
			// can conflict when MPV hasn't fully loaded the first file yet
			await clearQueue();
			await addMultipleToQueue(episodeIds);
			await playQueueIndex(0);
		} catch (err) {
			console.error('[Playlists] Failed to play auto playlist:', err);
		}
	};

	const handlePlayUserPlaylist = async (playlistId: number) => {
		try {
			// Get all episodes in this user playlist (already in playlist order)
			const response = await getPlaylistEpisodes(playlistId);

			if (response.episodes.length === 0) {
				console.warn('[Playlists] No episodes in playlist to play');
				return;
			}

			const episodeIds = response.episodes.map(ep => ep.id);

			// Clear the queue first, then add all episodes, then play the first one
			await clearQueue();
			await addMultipleToQueue(episodeIds);
			await playQueueIndex(0);
		} catch (err) {
			console.error('[Playlists] Failed to play user playlist:', err);
		}
	};

	const handleAddUserPlaylist = async (playlistId: number) => {
		try {
			// Get all episodes in this user playlist (already in playlist order)
			const response = await getPlaylistEpisodes(playlistId);

			if (response.episodes.length === 0) {
				console.warn('[Playlists] No episodes in playlist to add');
				notifications.show({
					color: 'yellow',
					message: 'No episodes in playlist to add',
					position: 'top-right',
					autoClose: 2000
				});
				return;
			}

			const episodeIds = response.episodes.map(ep => ep.id);

			// Add episodes to the queue without clearing or auto-playing
			await addMultipleToQueue(episodeIds);

			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed">
						Added <Text span c="var(--mantine-color-text)">{episodeIds.length}</Text> episode{episodeIds.length !== 1 ? 's' : ''} to queue
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});
		} catch (err) {
			console.error('[Playlists] Failed to add user playlist to queue:', err);
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to add playlist to queue',
				position: 'top-right',
				autoClose: 3000
			});
		}
	};

	const handleAddAutoPlaylist = async (subscriptionId: number) => {
		try {
			// Get all downloaded episodes for this subscription, sorted by pub_date DESC
			const response = await getEpisodes(subscriptionId, {
				downloaded: true,
				orderBy: 'pub_date',
				order: 'DESC'
			});

			if (response.episodes.length === 0) {
				console.warn('[Playlists] No downloaded episodes to add');
				notifications.show({
					color: 'yellow',
					message: 'No downloaded episodes to add',
					position: 'top-right',
					autoClose: 2000
				});
				return;
			}

			const episodeIds = response.episodes.map(ep => ep.id);

			// Add episodes to the queue without clearing or auto-playing
			await addMultipleToQueue(episodeIds);

			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed">
						Added <Text span c="var(--mantine-color-text)">{episodeIds.length}</Text> episode{episodeIds.length !== 1 ? 's' : ''} to queue
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});
		} catch (err) {
			console.error('[Playlists] Failed to add auto playlist to queue:', err);
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to add playlist to queue',
				position: 'top-right',
				autoClose: 3000
			});
		}
	};

	const handleEditUserPlaylist = async (playlist: AutoPlaylist) => {
		try {
			// Get all episodes in this user playlist
			const response = await getPlaylistEpisodes(playlist.id);

			if (response.episodes.length === 0) {
				console.warn('[Playlists] No episodes in playlist');
				return;
			}

			setEditingPlaylist(playlist);
			// Store both original (for comparison) and editing (for modifications)
			setOriginalEpisodes(response.episodes);
			setEditingEpisodes(response.episodes);
			setEditMode(true);
		} catch (err) {
			console.error('[Playlists] Failed to load user playlist:', err);
		}
	};

	const handleOpenRenamePlaylist = () => {
		if (editingPlaylist) {
			setRenameValue(editingPlaylist.name);
			setRenameError(null);
			setRenameModalOpened(true);
		}
	};

	const handleCloseRenameModal = () => {
		setRenameModalOpened(false);
		setRenameValue('');
		setRenameError(null);
	};

	const handleRenamePlaylist = async () => {
		if (!editingPlaylist) return;

		const trimmedName = renameValue.trim();

		if (!trimmedName) {
			setRenameError('Please enter a playlist name');
			return;
		}

		if (trimmedName === editingPlaylist.name) {
			// No change, just close the modal
			handleCloseRenameModal();
			return;
		}

		setIsRenaming(true);
		setRenameError(null);

		try {
			const { playlist } = await updateUserPlaylist(editingPlaylist.id, { name: trimmedName });

			// Update the editing playlist with new name
			setEditingPlaylist(prev => prev ? { ...prev, name: playlist.name } : null);

			// Refresh the playlists list
			await refreshUserPlaylists();

			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed" lineClamp={2}>
						Playlist renamed to <Text span c="var(--mantine-color-text)">{trimmedName}</Text>
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});

			handleCloseRenameModal();
		} catch (err) {
			console.error('[Playlists] Failed to rename playlist:', err);
			setRenameError(err instanceof Error ? err.message : 'Failed to rename playlist');
		} finally {
			setIsRenaming(false);
		}
	};

	const handleSavePlaylist = async () => {
		if (!editingPlaylist || !hasChanges) return;

		setIsSaving(true);

		try {
			// Get the episode IDs in the current order
			const episodeIds = editingEpisodes.map(ep => ep.id);

			// Update the playlist episodes via API
			await updatePlaylistEpisodes(editingPlaylist.id, episodeIds);

			// Update original to match current so hasChanges becomes false
			setOriginalEpisodes([...editingEpisodes]);

			// Refresh the playlists list to update episode counts
			await refreshUserPlaylists();

			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed" lineClamp={2}>
						Playlist <Text span c="var(--mantine-color-text)">{editingPlaylist.name}</Text> saved
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});
			handleCloseEditing();
		} catch (err) {
			console.error('[Playlists] Failed to save playlist:', err);
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to save playlist',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleOpenDeletePlaylist = () => {
		setDeleteModalOpened(true);
	};

	const handleCloseDeleteModal = () => {
		setDeleteModalOpened(false);
	};

	const handleDeletePlaylist = async () => {
		if (!editingPlaylist) return;

		setIsDeleting(true);

		try {
			await deleteUserPlaylist(editingPlaylist.id);

			// Refresh the playlists list
			await refreshUserPlaylists();

			notifications.show({
				color: 'teal',
				message: (
					<Text size="xs" c="dimmed" lineClamp={2}>
						Playlist <Text span c="var(--mantine-color-text)">{editingPlaylist.name}</Text> deleted
					</Text>
				),
				position: 'top-right',
				autoClose: 1500
			});

			// Close both the delete modal and editing mode
			handleCloseDeleteModal();
			handleCloseEditing();
		} catch (err) {
			console.error('[Playlists] Failed to delete playlist:', err);
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to delete playlist',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const handleCloseEditing = () => {
		setEditingPlaylist(null);
		setOriginalEpisodes([]);
		setEditingEpisodes([]);
		setEditMode(false);
	};

	const handleDragStart = (event: DragStartEvent) => {
		setIsDragging(true);
		setActiveDragId(event.active.id);
	};

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;

		setIsDragging(false);
		setActiveDragId(null);

		if (!over) return;

		// Check if dropped on trash zone
		if (over.id === TRASH_DROP_ID) {
			// Remove the episode from the editing list
			setEditingEpisodes(prev => prev.filter(ep => ep.id !== active.id));
			return;
		}

		// Handle reordering within the list
		if (active.id !== over.id) {
			setEditingEpisodes(prev => {
				const oldIndex = prev.findIndex(ep => ep.id === active.id);
				const newIndex = prev.findIndex(ep => ep.id === over.id);

				if (oldIndex !== -1 && newIndex !== -1) {
					return arrayMove(prev, oldIndex, newIndex);
				}
				return prev;
			});
		}
	}, []);

	const handleDragCancel = () => {
		setIsDragging(false);
		setActiveDragId(null);
	};

	// Get the currently dragged item for the overlay
	const activeDragItem = activeDragId ? editingEpisodes.find(ep => ep.id === activeDragId) : null;

	return (
		<Tabs
			color={buttonColor}
			value={currentTab}
			onChange={handleTabChange}
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
					<Tabs.Tab value="auto">
						Auto Playlists
					</Tabs.Tab>
					<Tabs.Tab value="playlists">
						Saved Playlists
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
						value="playlists"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{userIsLoading ? (
							<Center style={{ flex: 1 }}>
								<Loader size="sm" />
							</Center>
						) : userError ? (
							<Card
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="red">{userError}</Text>
							</Card>
						) : userPlaylists.length === 0 ? (
							<Card
								mb="-1rem"
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No saved playlists</Text>
							</Card>
						) : (
							<>
								{editMode ? (
									<DndContext
										sensors={sensors}
										collisionDetection={pointerWithin}
										onDragStart={handleDragStart}
										onDragEnd={handleDragEnd}
										onDragCancel={handleDragCancel}
									>
										<Stack gap="sm">
											<Card py="xs">
												<Group justify='space-between' wrap='nowrap'>
													<Text size='sm' truncate>{editingPlaylist?.name}</Text>
													<ActionIcon
														bdrs="50%"
														variant='light'
														onClick={handleCloseEditing}
													>
														<X size={16} />
													</ActionIcon>
												</Group>
											</Card>

											{!isDragging ? (
												<Group gap="sm" wrap='nowrap'>
													<Button
														variant='light'
														color='red'
														onClick={handleOpenDeletePlaylist}
														leftSection={<Trash size={16} />}
														style={{ flex: isMobile ? '0 0 auto' : '1 1 0' }}
													>
														Delete
													</Button>
													<Button
														variant='light'
														color='violet'
														onClick={handleOpenRenamePlaylist}
														leftSection={<PencilLine size={16} />}
														style={{ flex: '1 1 0' }}
													>
														Rename
													</Button>
													<Button
														variant='light'
														color='cyan'
														onClick={handleSavePlaylist}
														leftSection={<Save size={16} />}
														style={{ flex: isMobile ? '0 0 auto' : '1 1 0' }}
														disabled={!hasChanges}
														loading={isSaving}
													>
														Save
													</Button>
												</Group>
											) : (
												<TrashDropZone />
											)}

											{editingEpisodes.length === 0 ? (
												<Card
													style={{
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center'
													}}
												>
													<Text c="dimmed">No episodes in playlist</Text>
												</Card>
											) : (
												<SortableContext
													items={editingEpisodes.map(ep => ep.id)}
													strategy={verticalListSortingStrategy}
												>
													<Stack gap="xs">
														{editingEpisodes.map((episode) => (
															<SortablePlaylistItem
																key={episode.id}
																episode={episode}
															/>
														))}
													</Stack>
												</SortableContext>
											)}
										</Stack>

										<DragOverlay>
											{activeDragItem ? (
												<Card
													p="sm"
													shadow="lg"
													style={{ cursor: 'grabbing' }}
												>
													<Group justify="space-between" align="center" wrap="nowrap">
														<div style={{ flex: 1, minWidth: 0 }}>
															<Group gap={4} wrap="nowrap">
																<Text
																	size="sm"
																	truncate
																	style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
																>
																	{activeDragItem.title}
																</Text>
																{activeDragItem.duration && (
																	<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
																		• {formatDuration(activeDragItem.duration)}
																	</Text>
																)}
															</Group>
														</div>
														<div style={{ display: "flex", alignItems: "center" }}>
															<GripHorizontal size={20} />
														</div>
													</Group>
												</Card>
											) : null}
										</DragOverlay>
									</DndContext>
								) : (
									<Stack gap="sm">
										{userPlaylists.map((playlist) => (
											<Card
												p="sm"
												key={playlist.id}
											>
												<Group justify="space-between" align="center" wrap="nowrap">
													<Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
														<Text
															size="sm"
															truncate
															style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
														>
															{playlist.name}
														</Text>
														<Text c="dimmed" size="xs" ff="Roboto Mono" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
															({playlist.episode_count})
														</Text>
													</Group>
													<Group gap="xs">
														<ActionIcon
															variant="light"
															color="grape"
															onClick={() => handleEditUserPlaylist(playlist)}
															title="Edit Playlist"
															disabled={playlist.episode_count === 0}
														>
															<Pencil size={16} />
														</ActionIcon>
														<ActionIcon
															variant="light"
															color="cyan"
															onClick={() => handlePlayUserPlaylist(playlist.id)}
															title="Play Playlist"
															disabled={(playlist.episode_count === 0 || playlist.episode_count > 500)}
														>
															<Play size={16} />
														</ActionIcon>
														<ActionIcon
															variant="light"
															color="teal"
															onClick={() => handleAddUserPlaylist(playlist.id)}
															title="Add to Queue"
															disabled={playlist.episode_count === 0}
														>
															<Plus size={16} />
														</ActionIcon>
													</Group>

												</Group>
											</Card>
										))}
									</Stack>
								)}
							</>
						)}
					</Tabs.Panel>
					<Tabs.Panel
						pb="md"
						value="auto"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{autoIsLoading ? (
							<Center style={{ flex: 1 }}>
								<Loader size="sm" />
							</Center>
						) : autoError ? (
							<Card
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="red">{autoError}</Text>
							</Card>
						) : autoPlaylists.length === 0 ? (
							<Card
								mb="-1rem"
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No auto playlists</Text>
							</Card>
						) : (
							<Stack gap="sm">
								{autoPlaylists.map((playlist) => (
									<Card
										p="sm"
										key={playlist.id}
									>
										<Group justify="space-between" align="center" wrap="nowrap">
											<Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
												<Text
													size="sm"
													truncate
													style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
												>
													{playlist.subscription_name}
												</Text>
												<Text c="dimmed" size="xs" ff="Roboto Mono" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
													({playlist.episode_count})
												</Text>
											</Group>
											<Group gap="xs">
												<ActionIcon
													variant="light"
													color="cyan"
													onClick={() => handlePlayAutoPlaylist(playlist.subscription_id)}
													title="Play Playlist"
													disabled={(playlist.episode_count === 0 || playlist.episode_count > 500)}
												>
													<Play size={16} />
												</ActionIcon>
												<ActionIcon
													variant="light"
													color="teal"
													onClick={() => handleAddAutoPlaylist(playlist.subscription_id)}
													title="Add to Queue"
													disabled={playlist.episode_count === 0}
												>
													<Plus size={16} />
												</ActionIcon>
											</Group>
										</Group>
									</Card>
								))}
							</Stack>
						)}
					</Tabs.Panel>
				</Container>
			</ScrollArea>

			{/* Rename Playlist Modal */}
			<Modal
				opened={renameModalOpened}
				onClose={handleCloseRenameModal}
				title="Rename Playlist"
				withCloseButton={false}
				centered
				overlayProps={{
					blur: 5,
				}}
			>
				<Stack gap="sm">
					<TextInput
						placeholder="Enter a new name for your playlist"
						value={renameValue}
						onChange={(e) => setRenameValue(e.currentTarget.value)}
						error={renameError}
						disabled={isRenaming}
						data-autofocus
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !isRenaming) {
								handleRenamePlaylist();
							}
						}}
					/>

					<Group justify="flex-end" gap="sm" mt="sm" grow>
						<Button
							variant="light"
							color='red'
							onClick={handleCloseRenameModal}
							disabled={isRenaming}
							leftSection={<X size={16} />}
						>
							Cancel
						</Button>
						<Button
							variant='light'
							color="cyan"
							onClick={handleRenamePlaylist}
							loading={isRenaming}
							leftSection={<Save size={16} />}
						>
							Save
						</Button>
					</Group>
				</Stack>
			</Modal>

			{/* Delete Playlist Confirmation Modal */}
			<Modal
				opened={deleteModalOpened}
				onClose={handleCloseDeleteModal}
				title="Delete Playlist"
				withCloseButton={false}
				centered
				overlayProps={{
					blur: 5,
				}}
			>
				<Stack gap="sm">
					<Text size="sm">
						Are you sure you want to delete <Text span fw={600}>"{editingPlaylist?.name}"</Text>?
					</Text>
					<Text size="xs" c="dimmed">
						This action cannot be undone.
					</Text>

					<Group justify="flex-end" gap="sm" mt="sm" grow>
						<Button
							variant="light"
							onClick={handleCloseDeleteModal}
							disabled={isDeleting}
							leftSection={<X size={16} />}
						>
							No
						</Button>
						<Button
							variant='light'
							color="red"
							onClick={handleDeletePlaylist}
							loading={isDeleting}
							leftSection={<Check size={16} />}
						>
							Yes
						</Button>
					</Group>
				</Stack>
			</Modal>
		</Tabs>
	);
}

export default Playlists;
