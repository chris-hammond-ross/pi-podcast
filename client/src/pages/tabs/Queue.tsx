import { useState, useCallback } from 'react';
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
} from '@dnd-kit/sortable';
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
	Text,
	Card,
	Stack,
	ScrollArea,
	Button,
	Modal,
	TextInput,
	ActionIcon,
	Group,
	Container,
	Tabs,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { X, Save, GripHorizontal, Trash, Play, Pause } from 'lucide-react';
import { useMediaPlayer } from '../../contexts';
import { createUserPlaylist, addEpisodeToPlaylist } from '../../services';
import { formatDuration } from '../../utilities';

const TRASH_DROP_ID = 'trash-drop-zone';

interface QueueItem {
	episodeId: number;
	title: string;
	duration?: number;
}

interface SortableQueueItemProps {
	item: QueueItem;
	isCurrentEpisode: boolean;
	queueIndex: number;
	onPlayEpisode: (index: number) => void;
}

function SortableQueueItem({ item, isCurrentEpisode, queueIndex, onPlayEpisode }: SortableQueueItemProps) {
	const { isPlaying, pause, togglePlayPause } = useMediaPlayer();

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
		display: 'flex',
		justifyContent: 'center'
	};

	return (
		<Card
			ref={setNodeRef}
			style={style}
			px="sm"
			mah={52}
			bg={isCurrentEpisode ? "var(--mantine-color-teal-light)" : undefined}
		>
			<Group justify="space-between" align="center" wrap="nowrap">
				<div style={{ flex: 1, minWidth: 0 }}>
					<Group gap={4} wrap="nowrap" justify="space-between">
						<Text
							size="sm"
							c={isCurrentEpisode ? "var(--mantine-color-teal-light-color)" : undefined}
							lineClamp={2}
							style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
						>
							{item.title}
						</Text>
						{item.duration && (
							<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
								{formatDuration(item.duration)}
							</Text>
						)}
					</Group>
				</div>
				<Group>
					{isCurrentEpisode ? (
						<>
							{isPlaying ? (
								<ActionIcon
									variant="light"
									color="cyan"
									onClick={pause}
									title="Pause Episode"
								>
									<Pause size={16} />
								</ActionIcon>
							) : (
								<ActionIcon
									variant="light"
									color="cyan"
									onClick={togglePlayPause}
									title="Play Episode"
								>
									<Play size={16} />
								</ActionIcon>
							)}
						</>
					) : (
						<ActionIcon
							variant="light"
							color="cyan"
							onClick={() => onPlayEpisode(queueIndex)}
							title="Play Episode"
						>
							<Play size={16} />
						</ActionIcon>
					)}

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
			my="md"
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

function Queue() {
	const [isDragging, setIsDragging] = useState(false);
	const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null);

	// Save Playlist modal state
	const [savePlaylistModalOpened, setSavePlaylistModalOpened] = useState(false);
	const [playlistName, setPlaylistName] = useState('');
	const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
	const [savePlaylistError, setSavePlaylistError] = useState<string | null>(null);

	const {
		queue,
		currentEpisode,
		clearQueue,
		moveInQueue,
		removeFromQueue,
		playQueueIndex
	} = useMediaPlayer();

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handlePlayEpisodeInQueue = useCallback(async (index: number) => {
		await playQueueIndex(index);
	}, [playQueueIndex]);

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

	const handleDragStart = (event: DragStartEvent) => {
		setIsDragging(true);
		setActiveDragId(event.active.id);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		setIsDragging(false);
		setActiveDragId(null);

		if (!over) return;

		// Check if dropped on trash zone
		if (over.id === TRASH_DROP_ID) {
			const index = queue.findIndex(item => item.episodeId === active.id);
			if (index !== -1) {
				try {
					await removeFromQueue(index);
				} catch (err) {
					notifications.show({
						color: 'red',
						message: err instanceof Error ? err.message : 'Failed to remove from queue',
						position: 'top-right',
						autoClose: 3000
					});
				}
			}
			return;
		}

		// Handle reordering within the queue
		if (active.id !== over.id) {
			const oldIndex = queue.findIndex(item => item.episodeId === active.id);
			const newIndex = queue.findIndex(item => item.episodeId === over.id);

			if (oldIndex !== -1 && newIndex !== -1) {
				try {
					await moveInQueue(oldIndex, newIndex);
				} catch (err) {
					notifications.show({
						color: 'red',
						message: err instanceof Error ? err.message : 'Failed to reorder queue',
						position: 'top-right',
						autoClose: 3000
					});
				}
			}
		}
	};

	const handleDragCancel = () => {
		setIsDragging(false);
		setActiveDragId(null);
	};

	// Get the currently dragged item for the overlay
	const activeDragItem = activeDragId ? queue.find(item => item.episodeId === activeDragId) : null;

	return (
		<>
			<DndContext
				sensors={sensors}
				collisionDetection={pointerWithin}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				onDragCancel={handleDragCancel}
			>
				{!isDragging ? (
					<Group grow py="md" gap="sm">
						<Button
							variant='light'
							color='cyan'
							leftSection={<Save size={16} />}
							onClick={openSavePlaylistModal}
							disabled={queue.length === 0}
						>
							Save as Playlist
						</Button>
						<Button
							variant='light'
							color='pink'
							leftSection={<X size={16} />}
							onClick={handleClearQueue}
							disabled={queue.length === 0}
						>
							Clear Queue
						</Button>
					</Group>
				) : (
					<TrashDropZone />
				)}

				<ScrollArea
					style={{ flex: 1 }}
					scrollbars="y"
					scrollbarSize={4}
				>
					<Container
						size="sm"
						pb="md"
						px={0}
						style={{
							display: 'flex',
							flexDirection: 'column',
							height: 'var(--main-content-with-tabs-buttons-height)'
						}}
					>
						<Tabs.Panel
							pb="md"
							value="queue"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							<Stack
								gap="xs"
								style={{
									flex: 1,
									display: 'flex',
									flexDirection: 'column'
								}}
							>
								{queue.length === 0 ? (
									<Card
										mb="-1rem"
										style={{
											flex: 1,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center'
										}}
									>
										<Text c="dimmed">No episodes in queue</Text>
									</Card>
								) : (
									<SortableContext
										items={queue.map(item => item.episodeId)}
										strategy={verticalListSortingStrategy}
									>
										{queue.map((item, index) => (
											<SortableQueueItem
												key={item.episodeId}
												item={item}
												queueIndex={index}
												isCurrentEpisode={currentEpisode?.id === item.episodeId}
												onPlayEpisode={handlePlayEpisodeInQueue}
											/>
										))}
									</SortableContext>
								)}
							</Stack>
						</Tabs.Panel>
					</Container>
				</ScrollArea>

				<DragOverlay>
					{activeDragItem ? (
						<Card
							px="sm"
							mah={52}
							shadow="lg"
							style={{ cursor: 'grabbing', display: 'flex', justifyContent: 'center' }}
							bg={currentEpisode?.id === activeDragItem.episodeId ? "var(--mantine-color-teal-light)" : undefined}
						>
							<Group justify="space-between" align="center" wrap="nowrap">
								<div style={{ flex: 1, minWidth: 0 }}>
									<Group gap={4} wrap="nowrap" justify="space-between">
										<Text
											size="sm"
											c={currentEpisode?.id === activeDragItem.episodeId ? "var(--mantine-color-teal-light-color)" : undefined}
											lineClamp={2}
											style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
										>
											{activeDragItem.title}
										</Text>
										{activeDragItem.duration && (
											<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
												{formatDuration(activeDragItem.duration)}
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
		</>
	);
}

export default Queue;