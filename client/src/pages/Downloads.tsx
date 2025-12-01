import { useEffect, useState, useCallback } from 'react';
import {
	Container,
	Title,
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
	Divider
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
import * as downloadsApi from '../services/downloads';
import type { DownloadQueueItem } from '../services/websocket';

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function isRecent(timestamp: number): boolean {
	const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
	return (timestamp * 1000) > twentyFourHoursAgo;
}

function Downloads() {
	const {
		isRunning,
		isPaused,
		isLoading,
		currentDownload,
		activeItems,
		counts,
		error,
		start,
		stop,
		pause,
		resume,
		cancelCurrent,
		removeFromQueue,
		cancelAll
	} = useDownloadContext();

	const [completedItems, setCompletedItems] = useState<DownloadQueueItem[]>([]);
	const [completedLoading, setCompletedLoading] = useState(false);
	const [completedError, setCompletedError] = useState<string | null>(null);

	const fetchCompletedItems = useCallback(async () => {
		setCompletedLoading(true);
		setCompletedError(null);
		try {
			const response = await downloadsApi.getQueueItems('completed');
			setCompletedItems(response.items);
		} catch (err) {
			setCompletedError(err instanceof Error ? err.message : 'Failed to load completed items');
		} finally {
			setCompletedLoading(false);
		}
	}, []);

	// Fetch completed items on mount and when counts change
	useEffect(() => {
		fetchCompletedItems();
	}, [fetchCompletedItems, counts.completed]);

	if (isLoading) {
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

	// Split completed items into recent (last 24 hours) and older
	const recentCompletedItems = completedItems.filter(
		item => item.completed_at && isRecent(item.completed_at)
	);
	const olderCompletedItems = completedItems.filter(
		item => !item.completed_at || !isRecent(item.completed_at)
	);

	return (
		<Tabs defaultValue="downloading">
			<Container size="sm">
				<Tabs.List>
					<Tabs.Tab value="downloading">
						Downloading {hasCurrentDownload ? '(1)' : ''}
					</Tabs.Tab>
					<Tabs.Tab value="pending">
						Pending {pendingItems.length > 0 ? `(${pendingItems.length})` : ''}
					</Tabs.Tab>
					<Tabs.Tab value="completed">
						Completed {completedItems.length > 0 ? `(${completedItems.length})` : ''}
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

			<Container size="sm" py="md">
				<Stack gap="md">
					{error && (
						<Alert icon={<AlertCircle size={16} />} color="red" withCloseButton={false}>
							{error}
						</Alert>
					)}

					{/* Downloading Tab */}
					<Tabs.Panel value="downloading">
						<Stack gap="md">
							{/* Controls - only shown in Downloading tab */}
							<Group gap="xs">
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
									disabled={!isRunning}
								>
									Stop
								</Button>
							</Group>

							{/* Current download */}
							{currentDownload ? (
								<Card withBorder p="md">
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
								<Text c="dimmed" ta="center" py="xl">
									No episode currently downloading.
								</Text>
							)}
						</Stack>
					</Tabs.Panel>

					{/* Pending Tab */}
					<Tabs.Panel value="pending">
						<Stack gap="md">
							{pendingItems.length > 0 ? (
								<>
									<Group justify="flex-end">
										<Button
											variant="subtle"
											color="red"
											size="xs"
											onClick={cancelAll}
										>
											Cancel all
										</Button>
									</Group>
									<Stack gap="xs">
										{pendingItems.map((item) => (
											<Card key={item.id} withBorder p="sm">
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
									</Stack>
								</>
							) : (
								<Text c="dimmed" ta="center" py="xl">
									No episodes pending download.
								</Text>
							)}
						</Stack>
					</Tabs.Panel>

					{/* Completed Tab */}
					<Tabs.Panel value="completed">
						<Stack gap="md">
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
												<Card key={item.id} withBorder p="sm">
													<Group justify="space-between" align="center" wrap="nowrap">
														<div style={{ flex: 1, minWidth: 0 }}>
															<Text size="sm" truncate>
																{item.episode_title}
															</Text>
															<Text size="xs" c="dimmed" truncate>
																{item.subscription_name}
																{item.completed_at && ` • ${formatDate(item.completed_at)}`}
															</Text>
														</div>
													</Group>
												</Card>
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
												<Card key={item.id} withBorder p="sm">
													<Group justify="space-between" align="center" wrap="nowrap">
														<div style={{ flex: 1, minWidth: 0 }}>
															<Text size="sm" truncate>
																{item.episode_title}
															</Text>
															<Text size="xs" c="dimmed" truncate>
																{item.subscription_name}
																{item.completed_at && ` • ${formatDate(item.completed_at)}`}
															</Text>
														</div>
													</Group>
												</Card>
											))}
										</>
									)}
								</Stack>
							) : (
								<Text c="dimmed" ta="center" py="xl">
									No completed downloads yet.
								</Text>
							)}
						</Stack>
					</Tabs.Panel>
				</Stack>
			</Container>
		</Tabs>
	);
}

export default Downloads;
