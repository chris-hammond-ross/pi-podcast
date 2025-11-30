import {
	Container,
	Title,
	Text,
	Stack,
	Group,
	Button,
	Progress,
	Card,
	Badge,
	ActionIcon,
	Loader,
	Alert
} from '@mantine/core';
import {
	Play,
	Pause,
	Square,
	X,
	Trash2,
	AlertCircle
} from 'lucide-react';
import { useDownloadContext } from '../contexts';

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
		cancelAll,
		clearFinished
	} = useDownloadContext();

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
	const hasQueuedItems = pendingItems.length > 0 || currentDownload !== null;

	return (
		<Container size="sm" py="md">
			<Stack gap="md">
				<Group justify="space-between" align="center">
					<Title order={1}>Downloads</Title>
					<Group gap="xs">
						{!isRunning ? (
							<Button
								leftSection={<Play size={16} />}
								onClick={start}
								variant="filled"
								size="sm"
							>
								Start
							</Button>
						) : isPaused ? (
							<Button
								leftSection={<Play size={16} />}
								onClick={resume}
								variant="filled"
								size="sm"
							>
								Resume
							</Button>
						) : (
							<Button
								leftSection={<Pause size={16} />}
								onClick={pause}
								variant="light"
								size="sm"
							>
								Pause
							</Button>
						)}
						{isRunning && (
							<Button
								leftSection={<Square size={16} />}
								onClick={stop}
								variant="light"
								color="red"
								size="sm"
							>
								Stop
							</Button>
						)}
					</Group>
				</Group>

				{error && (
					<Alert icon={<AlertCircle size={16} />} color="red" withCloseButton={false}>
						{error}
					</Alert>
				)}

				{/* Status summary */}
				<Group gap="xs">
					<Badge color="blue" variant="light">
						{counts.pending} pending
					</Badge>
					<Badge color="teal" variant="light">
						{counts.downloading} downloading
					</Badge>
					<Badge color="green" variant="light">
						{counts.completed} completed
					</Badge>
					{counts.failed > 0 && (
						<Badge color="red" variant="light">
							{counts.failed} failed
						</Badge>
					)}
				</Group>

				{/* Current download */}
				{currentDownload && (
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
				)}

				{/* Queue */}
				{pendingItems.length > 0 && (
					<Stack gap="xs">
						<Group justify="space-between" align="center">
							<Text fw={500}>Queue ({pendingItems.length})</Text>
							<Button
								variant="subtle"
								color="red"
								size="xs"
								onClick={cancelAll}
							>
								Cancel all
							</Button>
						</Group>
						{pendingItems.slice(0, 10).map((item) => (
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
						{pendingItems.length > 10 && (
							<Text size="sm" c="dimmed" ta="center">
								...and {pendingItems.length - 10} more
							</Text>
						)}
					</Stack>
				)}

				{/* Empty state */}
				{!hasQueuedItems && counts.total === 0 && (
					<Text c="dimmed" ta="center" py="xl">
						No downloads queued. Browse your subscriptions to add episodes.
					</Text>
				)}

				{/* Finished items actions */}
				{(counts.completed > 0 || counts.failed > 0 || counts.cancelled > 0) && (
					<Group justify="center" pt="md">
						<Button
							variant="subtle"
							leftSection={<Trash2 size={16} />}
							onClick={clearFinished}
						>
							Clear finished ({counts.completed + counts.failed + counts.cancelled})
						</Button>
					</Group>
				)}
			</Stack>
		</Container>
	);
}

export default Downloads;
