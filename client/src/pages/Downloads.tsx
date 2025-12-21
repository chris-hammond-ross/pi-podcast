import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
	Container,
	Text,
	Stack,
	Group,
	Button,
	Progress,
	Card,
	ActionIcon,
	Loader,
	Alert,
	Tabs,
	Divider,
	ScrollArea
} from '@mantine/core';
import {
	Play,
	Pause,
	Square,
	X,
	AlertCircle,
	RefreshCw
} from 'lucide-react';
import { useDownloadContext } from '../contexts';
import { EpisodeDetailModal, EpisodeRow } from '../components';
import * as downloadsApi from '../services/downloads';
import { getEpisode, getSubscriptionById, type EpisodeRecord } from '../services';
import type { DownloadQueueItem } from '../services/websocket';

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function isRecent(timestamp: number): boolean {
	const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
	return (timestamp * 1000) > twentyFourHoursAgo;
}

const validTabs = ['downloading', 'pending', 'completed'];

function Downloads() {
	const {
		isRunning,
		isPaused,
		isLoading,
		currentDownload,
		activeItems,
		counts,
		hasMoreItems,
		error,
		start,
		stop,
		pause,
		resume,
		cancelCurrent,
		removeFromQueue,
		cancelAll
	} = useDownloadContext();

	const { tab, episodeId } = useParams<{ tab: string; episodeId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();

	const [completedItems, setCompletedItems] = useState<DownloadQueueItem[]>([]);
	const [completedLoading, setCompletedLoading] = useState(false);
	const [completedError, setCompletedError] = useState<string | null>(null);

	// Episode modal state
	const [selectedEpisode, setSelectedEpisode] = useState<EpisodeRecord | null>(null);
	const [subscriptionName, setSubscriptionName] = useState<string>('');
	const [episodeModalOpened, setEpisodeModalOpened] = useState(false);
	const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);

	// Track if we're navigating programmatically
	const isNavigatingRef = useRef(false);

	// Determine current tab from URL or default
	const currentTab = tab && validTabs.includes(tab) ? tab : 'downloading';

	const fetchCompletedItems = useCallback(async () => {
		setCompletedLoading(true);
		setCompletedError(null);
		try {
			const response = await downloadsApi.getQueueItems('completed');
			setCompletedItems(response.items);
			return response.items;
		} catch (err) {
			setCompletedError(err instanceof Error ? err.message : 'Failed to load completed items');
			return [];
		} finally {
			setCompletedLoading(false);
		}
	}, []);

	// Fetch completed items on mount and when counts change
	useEffect(() => {
		fetchCompletedItems();
	}, [fetchCompletedItems, counts.completed]);

	// Handle URL changes for episode modal
	useEffect(() => {
		// Skip if we triggered this navigation
		if (isNavigatingRef.current) {
			isNavigatingRef.current = false;
			return;
		}

		if (episodeId && tab === 'completed') {
			const epId = parseInt(episodeId);

			// Check if already loaded
			if (selectedEpisode?.id === epId && episodeModalOpened) {
				return;
			}

			// Find in completed items first
			const itemFromList = completedItems.find(item => item.episode_id === epId);

			setIsLoadingEpisode(true);
			getEpisode(epId)
				.then(async response => {
					setSelectedEpisode(response.episode);
					// Get subscription name
					if (itemFromList) {
						setSubscriptionName(itemFromList.subscription_name || '');
					} else {
						try {
							const subResponse = await getSubscriptionById(response.episode.subscription_id);
							setSubscriptionName(subResponse.subscription.name);
						} catch {
							setSubscriptionName('');
						}
					}
					setEpisodeModalOpened(true);
				})
				.catch(err => {
					console.error('Failed to load episode:', err);
					navigate('/downloads/completed', { replace: true });
				})
				.finally(() => {
					setIsLoadingEpisode(false);
				});
		} else if (!episodeId && episodeModalOpened) {
			// No episodeId in URL but modal is open - close it (back navigation)
			setEpisodeModalOpened(false);
			setSelectedEpisode(null);
			setSubscriptionName('');
		}
	}, [episodeId, tab, location.pathname, completedItems]);

	const handleTabChange = useCallback((value: string | null) => {
		if (value && validTabs.includes(value)) {
			isNavigatingRef.current = true;
			navigate(`/downloads/${value}`);
		}
	}, [navigate]);

	const handleEpisodeClick = useCallback((item: DownloadQueueItem) => {
		// Open modal directly, then navigate to update URL
		setIsLoadingEpisode(true);
		getEpisode(item.episode_id)
			.then(response => {
				setSelectedEpisode(response.episode);
				setSubscriptionName(item.subscription_name || '');
				setEpisodeModalOpened(true);
				isNavigatingRef.current = true;
				navigate(`/downloads/completed/${item.episode_id}`);
			})
			.catch(err => {
				console.error('Failed to load episode:', err);
			})
			.finally(() => {
				setIsLoadingEpisode(false);
			});
	}, [navigate]);

	const handleEpisodeClose = useCallback(() => {
		setEpisodeModalOpened(false);
		setSelectedEpisode(null);
		setSubscriptionName('');
		isNavigatingRef.current = true;
		navigate('/downloads/completed');
	}, [navigate]);

	const handleEpisodeUpdate = useCallback((updatedEpisode: EpisodeRecord) => {
		// If the episode was deleted, remove it from completed items
		if (!updatedEpisode.downloaded_at) {
			setCompletedItems(prev =>
				prev.filter(item => item.episode_id !== updatedEpisode.id)
			);
		}
	}, []);

	if (!isLoading) {
		return (
			<Container size="sm" py="md">
				<Group justify="center" py="xl">
					<Loader size="lg" />
				</Group>
			</Container>
		);
	}

	const pendingItems = activeItems.filter(item => item.status === 'pending');
	const hasCurrentDownload = currentDownload !== null;

	// Calculate how many more items are not shown
	const totalPendingCount = counts.pending;
	const shownPendingCount = pendingItems.length;
	const hiddenPendingCount = totalPendingCount - shownPendingCount;

	// Split completed items into recent (last 24 hours) and older
	const recentCompletedItems = completedItems.filter(
		item => item.completed_at && isRecent(item.completed_at)
	);
	const olderCompletedItems = completedItems.filter(
		item => !item.completed_at || !isRecent(item.completed_at)
	);

	return (
		<>
			<Tabs
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
						<Tabs.Tab value="downloading">
							Current {hasCurrentDownload ? '(1)' : ''}
						</Tabs.Tab>
						<Tabs.Tab value="pending">
							Pending {totalPendingCount > 0 ? `(${totalPendingCount})` : ''}
						</Tabs.Tab>
						<Tabs.Tab value="completed">
							Done {completedItems.length > 0 ? `(${completedItems.length})` : ''}
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
						<Stack
							gap="md"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							{error && (
								<Alert icon={<AlertCircle size={16} />} color="red" withCloseButton={false}>
									{error}
								</Alert>
							)}

							{/* Downloading Tab */}
							<Tabs.Panel
								pb="md"
								value="downloading"
								style={{
									flex: 1,
									display: 'flex',
									flexDirection: 'column'
								}}
							>
								<Stack
									gap="md"
									style={{
										flex: 1,
										display: 'flex',
										flexDirection: 'column'
									}}
								>
									{/* Controls - only shown in Downloading tab */}
									<Group gap="xs" grow>
										{!isRunning ? (
											<Button
												leftSection={<Play size={16} />}
												onClick={start}
												variant="filled"
												size="sm"
												disabled={!hasCurrentDownload && pendingItems.length === 0}
											>
												Start
											</Button>
										) : isPaused ? (
											<Button
												leftSection={<Play size={16} />}
												onClick={resume}
												variant="filled"
												size="sm"
												disabled={!hasCurrentDownload}
											>
												Resume
											</Button>
										) : (
											<Button
												leftSection={<Pause size={16} />}
												onClick={pause}
												variant="light"
												size="sm"
												disabled={!hasCurrentDownload}
											>
												Pause
											</Button>
										)}
										<Button
											leftSection={<Square size={16} />}
											onClick={stop}
											variant="light"
											color="red"
											size="sm"
											disabled={!isRunning || !hasCurrentDownload}
										>
											Stop
										</Button>
									</Group>

									{/* Current download */}
									{currentDownload ? (
										<Card p="md">
											<Stack gap="xs">
												<Group justify="space-between" align="flex-start">
													<div style={{ flex: 1, minWidth: 0 }}>
														<Text fw={500} truncate>
															{currentDownload.title}
														</Text>
														<Text size="sm" c="dimmed" truncate>
															{currentDownload.subscriptionName}
														</Text>
													</div>
													<ActionIcon
														variant="subtle"
														color="red"
														onClick={cancelCurrent}
														title="Cancel download"
													>
														<X size={16} />
													</ActionIcon>
												</Group>
												<Progress
													value={currentDownload.percent}
													size="lg"
													radius="sm"
													animated={!isPaused}
												/>
												<Group justify="space-between">
													<Text size="xs" c="dimmed">
														{formatBytes(currentDownload.downloadedBytes)} / {formatBytes(currentDownload.totalBytes)}
													</Text>
													<Text size="xs" c="dimmed">
														{currentDownload.percent}%
													</Text>
												</Group>
											</Stack>
										</Card>
									) : (
										<Card
											mb="-1rem"
											style={{
												flex: 1,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center'
											}}
										>
											<Text c="dimmed">No episode currently downloading</Text>
										</Card>
									)}
								</Stack>
							</Tabs.Panel>

							{/* Pending Tab */}
							<Tabs.Panel
								pb="md"
								value="pending"
								style={{
									flex: 1,
									display: 'flex',
									flexDirection: 'column'
								}}
							>
								<Stack
									gap="md"
									style={{
										flex: 1,
										display: 'flex',
										flexDirection: 'column'
									}}
								>
									{pendingItems.length > 0 ? (
										<>
											<Group justify="flex-end">
												<Button
													fullWidth
													variant="light"
													color="red"
													size="xs"
													onClick={cancelAll}
												>
													Cancel all
												</Button>
											</Group>
											<Stack gap="xs">
												{pendingItems.map((item) => (
													<Card key={item.id} p="sm">
														<Group justify="space-between" align="center" wrap="nowrap">
															<div style={{ flex: 1, minWidth: 0 }}>
																<Text size="sm" truncate>
																	{item.episode_title}
																</Text>
																<Text size="xs" c="dimmed" truncate>
																	{item.subscription_name}
																</Text>
															</div>
															<ActionIcon
																variant="subtle"
																color="red"
																onClick={() => removeFromQueue(item.id)}
																title="Remove from queue"
															>
																<X size={14} />
															</ActionIcon>
														</Group>
													</Card>
												))}

												{/* Truncation message */}
												{hasMoreItems && hiddenPendingCount > 0 && (
													<Text size="sm" c="dimmed" ta="center" py="sm">
														+ {hiddenPendingCount.toLocaleString()} more episode{hiddenPendingCount !== 1 ? 's' : ''} in queue
													</Text>
												)}
											</Stack>
										</>
									) : (
										<Card
											mb="-1rem"
											style={{
												flex: 1,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center'
											}}
										>
											<Text c="dimmed">No episodes pending download</Text>
										</Card>
									)}
								</Stack>
							</Tabs.Panel>

							{/* Completed Tab */}
							<Tabs.Panel
								pb="md"
								value="completed"
								style={{
									flex: 1,
									display: 'flex',
									flexDirection: 'column'
								}}
							>
								<Stack
									gap="md"
									style={{
										flex: 1,
										display: 'flex',
										flexDirection: 'column'
									}}
								>
									{completedLoading ? (
										<Group justify="center" py="xl">
											<Loader size="md" />
										</Group>
									) : completedError ? (
										<Alert
											icon={<AlertCircle size={16} />}
											color="red"
											withCloseButton={false}
											title="Error loading completed downloads"
										>
											{completedError}
											<Button
												variant="subtle"
												size="xs"
												leftSection={<RefreshCw size={14} />}
												onClick={fetchCompletedItems}
												mt="xs"
											>
												Retry
											</Button>
										</Alert>
									) : completedItems.length > 0 ? (
										<Stack gap="xs">
											{/* Recent section */}
											{recentCompletedItems.length > 0 && (
												<>
													<Divider label="Recent" />
													{recentCompletedItems.map((item) => (
														<EpisodeRow
															key={item.id}
															episodeId={item.episode_id}
															subscriptionName={item.subscription_name}
														/>
													))}
												</>
											)}

											{/* Older section */}
											{olderCompletedItems.length > 0 && (
												<>
													<Divider
														label="Older"
														mt={recentCompletedItems.length > 0 ? 'md' : undefined}
													/>
													{olderCompletedItems.map((item) => (
														<EpisodeRow
															key={item.id}
															episodeId={item.id}
															subscriptionName={item.subscription_name}
														/>
													))}
												</>
											)}
										</Stack>
									) : (
										<Card
											mb="-1rem"
											style={{
												flex: 1,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center'
											}}
										>
											<Text c="dimmed">No completed downloads</Text>
										</Card>
									)}
								</Stack>
							</Tabs.Panel>
						</Stack>
					</Container>
				</ScrollArea>
			</Tabs>

			{/* Loading state when fetching episode directly from URL */}
			{isLoadingEpisode && !selectedEpisode && (
				<Group
					justify="center"
					align="center"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						zIndex: 1000
					}}
				>
					<Loader size="lg" />
				</Group>
			)}

			<EpisodeDetailModal
				episode={selectedEpisode}
				subscriptionName={subscriptionName}
				opened={episodeModalOpened}
				onClose={handleEpisodeClose}
				onEpisodeUpdate={handleEpisodeUpdate}
			/>
		</>
	);
}

export default Downloads;
