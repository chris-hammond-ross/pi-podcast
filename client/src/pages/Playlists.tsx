import {
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Card,
	Text,
	Group
} from '@mantine/core';
import { useMediaPlayer } from '../contexts';
import { useSubscriptions } from '../hooks';

function Playlists() {
	const {
		// Queue state
		queue,
		queuePosition,
		queueLength,
		hasNext,
		hasPrevious,

		// Queue actions
		addToQueue,
		playNext,
		playPrevious,
		removeFromQueue,
		clearQueue,
	} = useMediaPlayer();

	const { getSubscriptionById } = useSubscriptions();

	return (
		<Tabs
			defaultValue="queue"
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
					<Tabs.Tab size="xl" value="queue">
						Current
					</Tabs.Tab>
					<Tabs.Tab value="playlists">
						Saved Playlists
					</Tabs.Tab>
					<Tabs.Tab value="auto">
						Auto Playlists
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
				<Container size="sm" py="md">
					<Stack gap="xl">
						<Tabs.Panel value="queue">
							<Stack>
								<Card>
									<Text size='xs' c="dimmed">Podcast episodes in the current queue</Text>
								</Card>
								{queue.map((item, index) => (
									<Card
										withBorder
										p="sm"
										style={{ cursor: 'pointer' }}
										key={index}
									>
										<Group justify="space-between" align="center" wrap="nowrap">
											<div style={{ flex: 1, minWidth: 0 }}>
												<Group gap="xs" wrap="nowrap">
													<Text size="sm" truncate style={{ flex: 1 }}>
														{item.title}
													</Text>
												</Group>
												<Text size="xs" c="dimmed" truncate>
													{getSubscriptionById(item.subscription_id)?.name} •
													{/*{episode.pub_date && formatDate(episode.pub_date)}*/}
													{item.duration && ` • ${item.duration}`}
												</Text>
											</div>
										</Group>
									</Card>
								))}
							</Stack>
						</Tabs.Panel>
						<Tabs.Panel value="playlists">
							<Card>
								<Text size='xs' c="dimmed">Your saved custom playlists</Text>
							</Card>
						</Tabs.Panel>
						<Tabs.Panel value="auto">
							<Card>
								<Text size='xs' c="dimmed">Auto generated playlists created from your podcasts</Text>
							</Card>
						</Tabs.Panel>
					</Stack>
				</Container>
			</ScrollArea>
		</Tabs>
	);
}

export default Playlists;