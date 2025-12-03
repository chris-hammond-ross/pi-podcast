import {
	Container,
	Stack,
	Tabs,
	ScrollArea,
	Card,
	Text
} from '@mantine/core';

function Playlists() {
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
						Playlists
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
							<Card>
								<Text size='xs' c="dimmed">Podcast episodes in the current queue</Text>
							</Card>
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