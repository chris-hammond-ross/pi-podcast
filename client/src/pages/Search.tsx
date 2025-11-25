import { Container, Title, Text } from '@mantine/core';

function Search() {
	return (
		<Container size="sm" py="md">
			<Title order={1} mb="md">
				Search
			</Title>
			<Text c="dimmed">Search for podcasts here.</Text>
		</Container>
	);
}

export default Search;