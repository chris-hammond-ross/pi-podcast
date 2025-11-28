import { Container, Title, Text } from '@mantine/core';

function Downloads() {
	return (
		<Container size="sm" py="md">
			<Title order={1} mb="md">
				Downloads
			</Title>
			<Text c="dimmed">Your downloads will appear here.</Text>
		</Container>
	);
}

export default Downloads;