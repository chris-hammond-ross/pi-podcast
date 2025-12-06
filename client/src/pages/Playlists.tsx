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
	Center
} from '@mantine/core';
import { Play } from 'lucide-react';
import { useAutoPlaylists } from '../hooks';
import { getEpisodes, addMultipleToQueue, playEpisode } from '../services';

function Playlists() {
	const { playlists, isLoading, error } = useAutoPlaylists();

	const handlePlayPlaylist = async (subscriptionId: number) => {
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

			// Play the first episode immediately
			await playEpisode(episodeIds[0]);

			// Queue the rest if there are more
			if (episodeIds.length > 1) {
				await addMultipleToQueue(episodeIds.slice(1));
			}
		} catch (err) {
			console.error('[Playlists] Failed to play playlist:', err);
		}
	};

	return (
		<Tabs
			defaultValue="auto"
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
					<Tabs.Panel
						pb="md"
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
							<Text c="dimmed">Saved playlists coming soon!</Text>
						</Card>
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
						{isLoading ? (
							<Center style={{ flex: 1 }}>
								<Loader size="sm" />
							</Center>
						) : error ? (
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="red">{error}</Text>
							</Card>
						) : playlists.length === 0 ? (
							<Card
								withBorder
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No auto playlists yet. Subscribe to a podcast and download some episodes!</Text>
							</Card>
						) : (
							<Stack gap="sm">
								{playlists.map((playlist) => (
									<Card
										withBorder
										p="sm"
										key={playlist.id}
									>
										<Group justify="space-between" align="center" wrap="nowrap">
											<Text
												size="sm"
												truncate
											>
												{playlist.subscription_name}{' '}
												<Text span c="dimmed" size="xs">
													({playlist.episode_count})
												</Text>
											</Text>
											<ActionIcon
												variant="light"
												color="cyan"
												onClick={() => handlePlayPlaylist(playlist.subscription_id)}
												title="Play Playlist"
												disabled={playlist.episode_count === 0}
											>
												<Play size={16} />
											</ActionIcon>
										</Group>
									</Card>
								))}
							</Stack>
						)}
					</Tabs.Panel>
				</Container>
			</ScrollArea>
		</Tabs>
	);
}

export default Playlists;
