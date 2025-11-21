import { Container, Title, Text } from '@mantine/core';

function Playlists() {
	return (
		<Container size="xl">
			<Title order={1} mb="md">
				Playlists
			</Title>
			<Text c="dimmed">Your playlists will appear here.</Text>
		</Container>
	);
}

export default Playlists;