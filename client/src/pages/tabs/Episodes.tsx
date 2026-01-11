import { useCallback, useState, useRef, memo, useEffect } from 'react';
import {
	Text,
	Card,
	Stack,
	Skeleton,
	Group,
	TextInput,
	ActionIcon,
	ScrollArea,
	Container,
	Tabs,
	Modal,
	Button,
	Image,
	Badge
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
	Funnel,
	ArrowUpDown,
	Search,
	X,
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	CalendarArrowDown,
	CalendarArrowUp
} from 'lucide-react';
import { EpisodeRow, VirtualScrollList } from '../../components';
import { getAllDownloadedEpisodes, getMockDownloadedEpisodes } from '../../services';
import { useSubscriptions } from '../../hooks';
import type { DownloadedEpisodeRecord, Subscription } from '../../services';

// ============================================================================
// TESTING: Use mock data for testing infinite scroll
// Configure via environment variables (see .env.demo)
// ============================================================================
const USE_MOCK_EPISODES = import.meta.env.VITE_USE_MOCK_EPISODES === 'true';
const MOCK_TOTAL_EPISODES = parseInt(import.meta.env.VITE_MOCK_TOTAL_EPISODES) || 2000;
const MOCK_DELAY_MS = parseInt(import.meta.env.VITE_MOCK_DELAY_MS) || 200;

// ============================================================================
// Types
// ============================================================================
type SortField = 'pub_date' | 'downloaded_at';
type SortOrder = 'ASC' | 'DESC';

interface SortConfig {
	orderBy: SortField;
	order: SortOrder;
}

interface FilterConfig {
	subscriptionId: number | null;
	subscriptionName: string | null;
}

// ============================================================================
// Search bar component - isolated to prevent re-renders of the episode list
// ============================================================================
interface EpisodeSearchBarProps {
	onSearch: (value: string) => void;
	onClear: () => void;
	onOpenFilterModal: () => void;
	onOpenSortModal: () => void;
	hasActiveFilter: boolean;
}

const EpisodeSearchBar = memo(function EpisodeSearchBar({
	onSearch,
	onClear,
	onOpenFilterModal,
	onOpenSortModal,
	hasActiveFilter
}: EpisodeSearchBarProps) {
	const [searchValue, setSearchValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSearch = () => {
		onSearch(searchValue);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			handleSearch();
		}
	};

	const handleClearSearch = () => {
		setSearchValue('');
		onClear();
		inputRef.current?.focus();
	};

	return (
		<Group gap="xs" py="md">
			<TextInput
				ref={inputRef}
				variant="default"
				placeholder="Search for episodes..."
				leftSection={<Search size={16} />}
				rightSection={
					searchValue ? (
						<ActionIcon
							variant="subtle"
							color="gray"
							size="sm"
							onClick={handleClearSearch}
							aria-label="Clear search"
						>
							<X size={14} />
						</ActionIcon>
					) : null
				}
				value={searchValue}
				onChange={(e) => setSearchValue(e.currentTarget.value)}
				onKeyDown={handleKeyDown}
				style={{
					flexGrow: 1
				}}
			/>
			<ActionIcon
				variant={hasActiveFilter ? 'filled' : 'light'}
				color='cyan'
				size="lg"
				onClick={onOpenFilterModal}
			>
				<Funnel size={16} />
			</ActionIcon>
			<ActionIcon
				variant='light'
				color='cyan'
				size="lg"
				onClick={onOpenSortModal}
			>
				<ArrowUpDown size={16} />
			</ActionIcon>
		</Group>
	);
});

// ============================================================================
// Episodes component
// ============================================================================
interface EpisodesProps {
	refreshKey: number;
	onEpisodeDeleted: (episodeId: number) => void;
}

function Episodes({ refreshKey, onEpisodeDeleted }: EpisodesProps) {
	const [activeFilter, setActiveFilter] = useState('');
	const [listKey, setListKey] = useState(0);
	const [sortConfig, setSortConfig] = useState<SortConfig>({
		orderBy: 'pub_date',
		order: 'DESC'
	});
	const [filterConfig, setFilterConfig] = useState<FilterConfig>({
		subscriptionId: null,
		subscriptionName: null
	});

	// Modal states
	const [sortModalOpened, { open: openSortModal, close: closeSortModal }] = useDisclosure(false);
	const [filterModalOpened, { open: openFilterModal, close: closeFilterModal }] = useDisclosure(false);

	// Get subscriptions for filter modal
	const { subscriptions, isLoading: subscriptionsLoading } = useSubscriptions();

	// Fetch function for VirtualScrollList
	const fetchEpisodesPage = useCallback(async (offset: number, limit: number) => {
		if (USE_MOCK_EPISODES) {
			// Use mock endpoint for testing
			const response = await getMockDownloadedEpisodes({
				limit,
				offset,
				totalEpisodes: MOCK_TOTAL_EPISODES,
				delay: MOCK_DELAY_MS,
				filter: activeFilter || undefined,
				subscriptionId: filterConfig.subscriptionId || undefined
			});
			return {
				items: response.episodes,
				total: response.total
			};
		}

		// Use real endpoint
		const response = await getAllDownloadedEpisodes({
			orderBy: sortConfig.orderBy,
			order: sortConfig.order,
			limit,
			offset,
			filter: activeFilter || undefined,
			subscriptionId: filterConfig.subscriptionId || undefined
		});
		return {
			items: response.episodes,
			total: response.total
		};
	}, [activeFilter, sortConfig, filterConfig.subscriptionId]);

	const handleSearch = useCallback((value: string) => {
		setActiveFilter(value);
		setListKey(prev => prev + 1);
	}, []);

	const handleClear = useCallback(() => {
		if (activeFilter) {
			setActiveFilter('');
			setListKey(prev => prev + 1);
		}
	}, [activeFilter]);

	// Sort handlers
	const handleSort = useCallback((orderBy: SortField, order: SortOrder) => {
		setSortConfig({ orderBy, order });
		setListKey(prev => prev + 1);
		closeSortModal();
	}, [closeSortModal]);

	// Filter handlers
	const handleFilterBySubscription = useCallback((subscription: Subscription) => {
		setFilterConfig({
			subscriptionId: subscription.id,
			subscriptionName: subscription.name
		});
		setListKey(prev => prev + 1);
		closeFilterModal();
	}, [closeFilterModal]);

	const handleClearFilter = useCallback(() => {
		setFilterConfig({
			subscriptionId: null,
			subscriptionName: null
		});
		setListKey(prev => prev + 1);
		closeFilterModal();
	}, [closeFilterModal]);

	const hasActiveFilter = filterConfig.subscriptionId !== null;

	return (
		<>
			{/* Search/filter bar - isolated component to prevent list re-renders */}
			<EpisodeSearchBar
				onSearch={handleSearch}
				onClear={handleClear}
				onOpenFilterModal={openFilterModal}
				onOpenSortModal={openSortModal}
				hasActiveFilter={hasActiveFilter}
			/>

			{/* Active filter indicator */}
			{hasActiveFilter && (
				<Group gap="xs" mb="xs">
					<Badge
						color="cyan"
						variant="light"
						rightSection={
							<ActionIcon
								variant="transparent"
								color="cyan"
								size="xs"
								onClick={handleClearFilter}
							>
								<X size={12} />
							</ActionIcon>
						}
					>
						{filterConfig.subscriptionName}
					</Badge>
				</Group>
			)}

			{/* Scrollable episodes list */}
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
						value="episodes"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						<VirtualScrollList<DownloadedEpisodeRecord>
							key={listKey}
							fetchPage={fetchEpisodesPage}
							pageSize={100}
							maxItems={500}
							getItemKey={(episode) => episode.id}
							renderItem={(episode) => (
								<EpisodeRow
									episode={episode}
									subscriptionName={episode.subscription_name}
									showDownloadStatus={false}
									onEpisodeDeleted={onEpisodeDeleted}
								/>
							)}
							gap="xs"
							loaderColor="blue"
							loadThreshold={300}
							refreshDeps={[refreshKey]}
							emptyContent={
								<Card
									style={{
										flex: 1,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										minHeight: '200px'
									}}
								>
									<Text c="dimmed">
										{activeFilter
											? `No episodes found matching "${activeFilter}"`
											: hasActiveFilter
												? `No downloaded episodes from ${filterConfig.subscriptionName}`
												: 'No episodes have been downloaded'
										}
									</Text>
								</Card>
							}
							loadingContent={
								<Stack gap="sm">
									{[...Array(6).keys()].map(i => (
										<Card key={i} p="sm">
											<Group justify="space-between" align="center" wrap="nowrap">
												<div style={{ flex: 1, minWidth: 0 }}>
													<Skeleton height={16} width="70%" mb={8} />
													<Skeleton height={12} width="50%" />
												</div>
												<Skeleton height={28} width={28} circle />
											</Group>
										</Card>
									))}
								</Stack>
							}
						/>
					</Tabs.Panel>
				</Container>
			</ScrollArea>

			{/* Sort Modal */}
			<Modal
				opened={sortModalOpened}
				onClose={closeSortModal}
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
								Sort Episodes
							</Text>
							<Text size="sm" c="dimmed" lineClamp={1} mt={4}>
								Choose how to order the episode list
							</Text>
						</div>
					</Group>

					{/* Sort Options */}
					<Stack gap="xs">
						<Button
							variant={sortConfig.orderBy === 'pub_date' && sortConfig.order === 'DESC' ? 'filled' : 'light'}
							color="violet"
							leftSection={<ArrowDownWideNarrow size={16} />}
							onClick={() => handleSort('pub_date', 'DESC')}
							fullWidth
						>
							Published - Newest First
						</Button>
						<Button
							variant={sortConfig.orderBy === 'pub_date' && sortConfig.order === 'ASC' ? 'filled' : 'light'}
							color="violet"
							leftSection={<ArrowUpNarrowWide size={16} />}
							onClick={() => handleSort('pub_date', 'ASC')}
							fullWidth
						>
							Published - Oldest First
						</Button>
						<Button
							variant={sortConfig.orderBy === 'downloaded_at' && sortConfig.order === 'DESC' ? 'filled' : 'light'}
							color="pink"
							leftSection={<CalendarArrowDown size={16} />}
							onClick={() => handleSort('downloaded_at', 'DESC')}
							fullWidth
						>
							Downloaded - Newest First
						</Button>
						<Button
							variant={sortConfig.orderBy === 'downloaded_at' && sortConfig.order === 'ASC' ? 'filled' : 'light'}
							color="pink"
							leftSection={<CalendarArrowUp size={16} />}
							onClick={() => handleSort('downloaded_at', 'ASC')}
							fullWidth
						>
							Downloaded - Oldest First
						</Button>
					</Stack>
				</Stack>
			</Modal>

			{/* Filter Modal */}
			<Modal
				opened={filterModalOpened}
				onClose={closeFilterModal}
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
								Filter by Podcast
							</Text>
							<Text size="sm" c="dimmed" lineClamp={1} mt={4}>
								Show episodes from a specific podcast
							</Text>
						</div>
					</Group>

					{/* Clear filter button */}
					{hasActiveFilter && (
						<Button
							variant="light"
							color="red"
							leftSection={<X size={16} />}
							onClick={handleClearFilter}
							fullWidth
						>
							Clear Filter
						</Button>
					)}

					{/* Subscription list */}
					<ScrollArea.Autosize mah={400}>
						<Stack gap="xs">
							{subscriptionsLoading ? (
								<>
									{[...Array(4).keys()].map(i => (
										<Card key={i} p="sm">
											<Group wrap="nowrap">
												<Skeleton height={40} width={40} radius="sm" />
												<Skeleton height={16} width="60%" />
											</Group>
										</Card>
									))}
								</>
							) : subscriptions.length === 0 ? (
								<Text c="dimmed" ta="center" py="md">
									No subscriptions found
								</Text>
							) : (
								subscriptions.map((subscription) => (
									<Card
										key={subscription.id}
										p="sm"
										style={{ cursor: 'pointer' }}
										bg={filterConfig.subscriptionId === subscription.id ? 'var(--mantine-color-cyan-light)' : undefined}
										onClick={() => handleFilterBySubscription(subscription)}
									>
										<Group wrap="nowrap">
											{subscription.artworkUrl100 ? (
												<Image
													src={subscription.artworkUrl100}
													alt={subscription.name}
													w={40}
													h={40}
													radius="sm"
												/>
											) : (
												<div
													style={{
														width: 40,
														height: 40,
														borderRadius: 'var(--mantine-radius-sm)',
														backgroundColor: 'var(--mantine-color-gray-3)',
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center'
													}}
												>
													<Text size="xs" c="dimmed">?</Text>
												</div>
											)}
											<Text size="sm" lineClamp={2} style={{ flex: 1 }}>
												{subscription.name}
											</Text>
										</Group>
									</Card>
								))
							)}
						</Stack>
					</ScrollArea.Autosize>
				</Stack>
			</Modal>
		</>
	);
}

export default Episodes;
