import { useState } from 'react';
import { Container, Stack } from '@mantine/core';
import { PodcastSearch, PodcastResults } from '../components';
import type { Podcast } from '../services';

function Search() {
	const [searchResults, setSearchResults] = useState<Podcast[]>([]);
	const [resultCount, setResultCount] = useState<number>(0);
	console.log(resultCount);

	return (
		<Container size="sm" py="md">
			<Stack gap="md">
				<PodcastSearch
					onResultsChange={(count: number, results: Podcast[]) => {
						setSearchResults(results);
						setResultCount(count);
					}}
				/>
				{/*<Badge color="blue">{resultCount}</Badge>*/}
				<PodcastResults
					podcasts={searchResults}
				/>
			</Stack>
		</Container>
	);
}

export default Search;