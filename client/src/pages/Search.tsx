import { Container, Title } from '@mantine/core';
import { PodcastSearch } from '../components';

function Search() {
	return (
		<Container size="sm" py="md">
			<Title order={1} mb="md">
				Search
			</Title>
			<PodcastSearch
				onResultsChange={(count) => console.log(`Found ${count} results`)}
			/>
		</Container>
	);
}

export default Search;