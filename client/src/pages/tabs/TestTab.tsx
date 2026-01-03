import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
	Button,
	ActionIcon,
	Group,
	Container,
	Loader,
	Center,
	Badge,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { GripHorizontal, Trash, Play, Pause, ChevronUp, ChevronDown } from 'lucide-react';
import { useMediaPlayer } from '../../contexts';
import { formatDuration } from '../../utilities';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const TRASH_DROP_ID = 'trash-drop-zone';
const ITEMS_PER_PAGE = 100;
const MAX_RENDERED_ITEMS = 500;

interface VirtualQueueItem {
	index: number; // The absolute index in the full queue
	episodeId: number;
	title: string;
	duration?: number;
	isPlaying: boolean;
}

interface QueueWindow {
	items: VirtualQueueItem[];
	startIndex: number;
	endIndex: number;
	totalLength: number;
	currentIndex: number;
}

// API service for paginated queue
async function getQueuePage(offset: number, limit: number): Promise<QueueWindow> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/page?offset=${offset}&limit=${limit}`, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get queue page');
	}

	return response.json();
}

async function moveInQueue(from: number, to: number): Promise<{ success: boolean; queueLength: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/move`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to })
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to move in queue');
	}

	return response.json();
}

async function removeFromQueueByIndex(index: number): Promise<{ success: boolean; removed: number; queueLength: number }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/${index}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to remove from queue');
	}

	return response.json();
}

async function playQueueIndex(index: number): Promise<{ success: boolean }> {
	const response = await fetch(`${API_BASE_URL}/api/media/queue/play/${index}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to play queue index');
	}

	return response.json();
}

interface SortableQueueItemProps {
	item: VirtualQueueItem;
	isCurrentEpisode: boolean;
	onPlayEpisode: (index: number) => void;
}

function SortableQueueItem({ item, isCurrentEpisode, onPlayEpisode }: SortableQueueItemProps) {
	const { isPlaying, pause, togglePlayPause } = useMediaPlayer();

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: `${item.episodeId}-${item.index}` });

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
			bg={isCurrentEpisode ? "var(--mantine-color-teal-light)" : undefined}
		>
			<Group justify="space-between" align="center" wrap="nowrap">
				<Badge size="sm" variant="light" color="gray" style={{ flexShrink: 0 }}>
					{item.index + 1}
				</Badge>
				<div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
					<Group gap={4} wrap="nowrap">
						<Text
							size="sm"
							c={isCurrentEpisode ? "var(--mantine-color-teal-light-color)" : undefined}
							truncate
							style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
						>
							{item.title}
						</Text>
						{item.duration && (
							<Text c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
								• {formatDuration(item.duration)}
							</Text>
						)}
					</Group>
				</div>
				<Group gap="xs">
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
							onClick={() => onPlayEpisode(item.index)}
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

function TestTab() {
	// Window state - the visible items
	const [windowItems, setWindowItems] = useState<VirtualQueueItem[]>([]);
	const [windowStartIndex, setWindowStartIndex] = useState(0);
	const [windowEndIndex, setWindowEndIndex] = useState(0);
	const [totalLength, setTotalLength] = useState(0);
	const [queueCurrentIndex, setQueueCurrentIndex] = useState(-1);

	// Loading states
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	// Drag state
	const [isDragging, setIsDragging] = useState(false);
	const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null);

	// Scroll ref
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Get current episode from context
	const { currentEpisode, isPlaying, pause, togglePlayPause } = useMediaPlayer();

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Initial load
	useEffect(() => {
		loadInitialData();
	}, []);

	const loadInitialData = async () => {
		setIsLoading(true);
		try {
			const data = await getQueuePage(0, ITEMS_PER_PAGE);
			setWindowItems(data.items);
			setWindowStartIndex(data.startIndex);
			setWindowEndIndex(data.endIndex);
			setTotalLength(data.totalLength);
			setQueueCurrentIndex(data.currentIndex);
		} catch (err) {
			console.error('Failed to load queue:', err);
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to load queue',
				position: 'top-right',
				autoClose: 3000
			});
		} finally {
			setIsLoading(false);
		}
	};

	const loadMoreAbove = async () => {
		if (isLoadingMore || windowStartIndex === 0) return;

		setIsLoadingMore(true);
		try {
			const newStartIndex = Math.max(0, windowStartIndex - ITEMS_PER_PAGE);
			const data = await getQueuePage(newStartIndex, windowStartIndex - newStartIndex);

			setWindowItems(prev => {
				// Combine new items with existing
				let combined = [...data.items, ...prev];

				// Trim from bottom if we exceed MAX_RENDERED_ITEMS
				if (combined.length > MAX_RENDERED_ITEMS) {
					combined = combined.slice(0, MAX_RENDERED_ITEMS);
				}

				return combined;
			});

			setWindowStartIndex(newStartIndex);
			setWindowEndIndex(Math.min(newStartIndex + MAX_RENDERED_ITEMS - 1, totalLength - 1));
			setQueueCurrentIndex(data.currentIndex);
		} catch (err) {
			console.error('Failed to load more items above:', err);
		} finally {
			setIsLoadingMore(false);
		}
	};

	const loadMoreBelow = async () => {
		if (isLoadingMore || windowEndIndex >= totalLength - 1) return;

		setIsLoadingMore(true);
		try {
			const newOffset = windowEndIndex + 1;
			const data = await getQueuePage(newOffset, ITEMS_PER_PAGE);

			setWindowItems(prev => {
				// Combine existing with new items
				let combined = [...prev, ...data.items];

				// Trim from top if we exceed MAX_RENDERED_ITEMS
				if (combined.length > MAX_RENDERED_ITEMS) {
					const trimAmount = combined.length - MAX_RENDERED_ITEMS;
					combined = combined.slice(trimAmount);
					setWindowStartIndex(s => s + trimAmount);
				}

				return combined;
			});

			setWindowEndIndex(Math.min(newOffset + data.items.length - 1, totalLength - 1));
			setQueueCurrentIndex(data.currentIndex);
		} catch (err) {
			console.error('Failed to load more items below:', err);
		} finally {
			setIsLoadingMore(false);
		}
	};

	// Handle scroll for infinite loading
	const handleScroll = useCallback(() => {
		if (!scrollContainerRef.current || isLoadingMore) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

		// Load more above when near top
		if (scrollTop < 100 && windowStartIndex > 0) {
			loadMoreAbove();
		}

		// Load more below when near bottom
		if (scrollHeight - scrollTop - clientHeight < 100 && windowEndIndex < totalLength - 1) {
			loadMoreBelow();
		}
	}, [isLoadingMore, windowStartIndex, windowEndIndex, totalLength]);

	// Attach scroll listener
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.addEventListener('scroll', handleScroll);
			return () => container.removeEventListener('scroll', handleScroll);
		}
	}, [handleScroll]);

	const handlePlayEpisode = useCallback(async (absoluteIndex: number) => {
		try {
			await playQueueIndex(absoluteIndex);
		} catch (err) {
			notifications.show({
				color: 'red',
				message: err instanceof Error ? err.message : 'Failed to play episode',
				position: 'top-right',
				autoClose: 3000
			});
		}
	}, []);

	const handleDragStart = (event: DragStartEvent) => {
		setIsDragging(true);
		setActiveDragId(event.active.id);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		setIsDragging(false);
		setActiveDragId(null);

		if (!over) return;

		// Parse the active ID to get the absolute index
		const activeIdParts = String(active.id).split('-');
		const activeAbsoluteIndex = parseInt(activeIdParts[activeIdParts.length - 1], 10);

		// Check if dropped on trash zone
		if (over.id === TRASH_DROP_ID) {
			try {
				// Optimistically remove from local state
				setWindowItems(prev => prev.filter(item => item.index !== activeAbsoluteIndex));
				setTotalLength(prev => prev - 1);

				// Call API
				await removeFromQueueByIndex(activeAbsoluteIndex);

				// Reload to get correct indices
				await loadInitialData();
			} catch (err) {
				notifications.show({
					color: 'red',
					message: err instanceof Error ? err.message : 'Failed to remove from queue',
					position: 'top-right',
					autoClose: 3000
				});
				// Reload on error to restore state
				await loadInitialData();
			}
			return;
		}

		// Handle reordering within the queue
		if (active.id !== over.id) {
			const overIdParts = String(over.id).split('-');
			const overAbsoluteIndex = parseInt(overIdParts[overIdParts.length - 1], 10);

			if (activeAbsoluteIndex !== overAbsoluteIndex) {
				try {
					// Optimistically update local state
					setWindowItems(prev => {
						const newItems = [...prev];
						const activeLocalIndex = newItems.findIndex(item => item.index === activeAbsoluteIndex);
						const overLocalIndex = newItems.findIndex(item => item.index === overAbsoluteIndex);

						if (activeLocalIndex !== -1 && overLocalIndex !== -1) {
							const [removed] = newItems.splice(activeLocalIndex, 1);
							newItems.splice(overLocalIndex, 0, removed);

							// Update indices for display
							return newItems.map((item, i) => ({
								...item,
								index: windowStartIndex + i
							}));
						}
						return prev;
					});

					// Call API
					await moveInQueue(activeAbsoluteIndex, overAbsoluteIndex);

					// Reload to get correct state from server
					await loadInitialData();
				} catch (err) {
					notifications.show({
						color: 'red',
						message: err instanceof Error ? err.message : 'Failed to reorder queue',
						position: 'top-right',
						autoClose: 3000
					});
					// Reload on error to restore state
					await loadInitialData();
				}
			}
		}
	};

	const handleDragCancel = () => {
		setIsDragging(false);
		setActiveDragId(null);
	};

	// Get the currently dragged item for the overlay
	const activeDragItem = useMemo(() => {
		if (!activeDragId) return null;
		const idParts = String(activeDragId).split('-');
		const absoluteIndex = parseInt(idParts[idParts.length - 1], 10);
		return windowItems.find(item => item.index === absoluteIndex) || null;
	}, [activeDragId, windowItems]);

	// Sortable IDs for dnd-kit
	const sortableIds = useMemo(() =>
		windowItems.map(item => `${item.episodeId}-${item.index}`),
		[windowItems]
	);

	// Stats display
	const canLoadAbove = windowStartIndex > 0;
	const canLoadBelow = windowEndIndex < totalLength - 1;

	if (isLoading) {
		return (
			<Center style={{ height: 'var(--main-content-with-tabs-buttons-height)' }}>
				<Loader color="cyan" />
			</Center>
		);
	}

	return (
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
			{/* Stats header */}
			<Group justify="space-between" mb="sm">
				<Text size="sm" c="dimmed">
					Showing {windowItems.length} of {totalLength} items
					{totalLength > 0 && ` (${windowStartIndex + 1}-${windowEndIndex + 1})`}
				</Text>
				<Button
					size="xs"
					variant="light"
					color="cyan"
					onClick={loadInitialData}
					loading={isLoading}
				>
					Refresh
				</Button>
			</Group>

			<DndContext
				sensors={sensors}
				collisionDetection={pointerWithin}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				onDragCancel={handleDragCancel}
			>
				{isDragging && <TrashDropZone />}

				{/* Load more above button */}
				{canLoadAbove && !isDragging && (
					<Button
						variant="subtle"
						color="cyan"
						size="xs"
						mb="xs"
						onClick={loadMoreAbove}
						loading={isLoadingMore}
						leftSection={<ChevronUp size={14} />}
						fullWidth
					>
						Load {Math.min(ITEMS_PER_PAGE, windowStartIndex)} more above
					</Button>
				)}

				{/* Scrollable list */}
				<div
					ref={scrollContainerRef}
					style={{
						flex: 1,
						overflowY: 'auto',
						paddingBottom: '1rem'
					}}
				>
					<Stack gap="xs">
						{windowItems.length === 0 ? (
							<Card
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									minHeight: 200
								}}
							>
								<Text c="dimmed">No episodes in queue</Text>
							</Card>
						) : (
							<SortableContext
								items={sortableIds}
								strategy={verticalListSortingStrategy}
							>
								{windowItems.map((item) => (
									<SortableQueueItem
										key={`${item.episodeId}-${item.index}`}
										item={item}
										isCurrentEpisode={currentEpisode?.id === item.episodeId}
										onPlayEpisode={handlePlayEpisode}
									/>
								))}
							</SortableContext>
						)}
					</Stack>
				</div>

				{/* Load more below button */}
				{canLoadBelow && !isDragging && (
					<Button
						variant="subtle"
						color="cyan"
						size="xs"
						mt="xs"
						onClick={loadMoreBelow}
						loading={isLoadingMore}
						leftSection={<ChevronDown size={14} />}
						fullWidth
					>
						Load {Math.min(ITEMS_PER_PAGE, totalLength - windowEndIndex - 1)} more below
					</Button>
				)}

				<DragOverlay>
					{activeDragItem ? (
						<Card
							p="sm"
							shadow="lg"
							style={{ cursor: 'grabbing' }}
							bg={currentEpisode?.id === activeDragItem.episodeId ? "var(--mantine-color-teal-light)" : undefined}
						>
							<Group justify="space-between" align="center" wrap="nowrap">
								<Badge size="sm" variant="light" color="gray" style={{ flexShrink: 0 }}>
									{activeDragItem.index + 1}
								</Badge>
								<div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
									<Group gap={4} wrap="nowrap">
										<Text
											size="sm"
											c={currentEpisode?.id === activeDragItem.episodeId ? "var(--mantine-color-teal-light-color)" : undefined}
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
		</Container>
	);
}

export default TestTab;
