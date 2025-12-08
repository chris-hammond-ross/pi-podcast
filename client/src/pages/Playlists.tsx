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
import { useAutoPlaylists, useUserPlaylists } from '../hooks';
import { getEpisodes, addMultipleToQueue, playEpisode } from '../services';

function Playlists() {
	const { playlists: autoPlaylists, isLoading: autoIsLoading, error: autoError } = useAutoPlaylists();
	const { playlists: userPlaylists, isLoading: userIsLoading, error: userError } = useUserPlaylists();

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
					<Tabs.Tab value="auto">
						Auto Playlists
					</Tabs.Tab>
					<Tabs.Tab value="playlists">
						Saved Playlists
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
						{userIsLoading ? (
							<Center style={{ flex: 1 }}>
								<Loader size="sm" />
							</Center>
						) : userError ? (
							<Card
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="red">{userError}</Text>
							</Card>
						) : userPlaylists.length === 0 ? (
							<Card
								mb="-1rem"
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No saved playlists</Text>
							</Card>
						) : (
							<Stack gap="sm">
								{userPlaylists.map((playlist) => (
									<Card
										p="sm"
										key={playlist.id}
									>
										<Group justify="space-between" align="center" wrap="nowrap">
											<Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
												<Text
													size="sm"
													truncate
													style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
												>
													{playlist.name}
												</Text>
												<Text c="dimmed" size="xs" ff="Roboto Mono" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
													({playlist.episode_count})
												</Text>
											</Group>
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
					<Tabs.Panel
						pb="md"
						value="auto"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						{autoIsLoading ? (
							<Center style={{ flex: 1 }}>
								<Loader size="sm" />
							</Center>
						) : autoError ? (
							<Card
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="red">{autoError}</Text>
							</Card>
						) : autoPlaylists.length === 0 ? (
							<Card
								mb="-1rem"
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
							>
								<Text c="dimmed">No auto playlists</Text>
							</Card>
						) : (
							<Stack gap="sm">
								{autoPlaylists.map((playlist) => (
									<Card
										p="sm"
										key={playlist.id}
									>
										<Group justify="space-between" align="center" wrap="nowrap">
											<Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
												<Text
													size="sm"
													truncate
													style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
												>
													{playlist.subscription_name}
												</Text>
												<Text c="dimmed" size="xs" ff="Roboto Mono" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
													({playlist.episode_count})
												</Text>
											</Group>
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
