import { Container, Title, Text } from '@mantine/core';

function Podcasts() {
	return (
		<Container size="sm" py="md">
			<Title order={1} mb="md">
				Podcasts
			</Title>
			<Text c="dimmed">Your podcast library will appear here.</Text>
		</Container>
	);
}

export default Podcasts;