import {
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Card,
	Text
} from '@mantine/core';
// import { useMediaPlayer } from '../contexts';
// import { useSubscriptions } from '../hooks';

function Playlists() {
	// const {
	// 	// Queue state
	// 	queue,
	// 	queuePosition,
	// 	queueLength,
	// 	hasNext,
	// 	hasPrevious,

	// 	// Queue actions
	// 	addToQueue,
	// 	playNext,
	// 	playPrevious,
	// 	removeFromQueue,
	// 	clearQueue,
	// } = useMediaPlayer();

	// const { getSubscriptionById } = useSubscriptions();

	return (
		<Tabs
			defaultValue="playlists"
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
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
							flexDirection: 'column',
							overflow: 'hidden'
						}}
					>
						<Tabs.Panel
							value="playlists"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">Playlists comming soon!</Text>
							</Card>
						</Tabs.Panel>
						<Tabs.Panel
							value="auto"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">Playlists comming soon!</Text>
							</Card>
						</Tabs.Panel>
					</Stack>
				</Container>
			</ScrollArea>
		</Tabs>
	);
}

export default Playlists;