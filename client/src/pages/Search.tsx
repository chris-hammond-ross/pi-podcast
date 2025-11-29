import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Stack } from '@mantine/core';
import { PodcastSearch, PodcastResults, SubscribeModal } from '../components';
import type { Podcast } from '../services';
import { getPodcastById } from '../services';

function Search() {
	const [searchResults, setSearchResults] = useState<Podcast[]>([]);
	const [resultCount, setResultCount] = useState<number>(0);
	const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
	const [modalOpened, setModalOpened] = useState(false);

	const { podcastId } = useParams<{ podcastId: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// Handle URL-based podcast selection (e.g., /search/123)
	useEffect(() => {
		if (podcastId) {
			const id = parseInt(podcastId);
			// First check if the podcast is in the current search results
			const podcastFromResults = searchResults.find(p => p.id === id);
			
			if (podcastFromResults) {
				setSelectedPodcast(podcastFromResults);
				setModalOpened(true);
			} else {
				// Fetch the podcast from the API
				getPodcastById(id)
					.then(response => {
						setSelectedPodcast(response.podcast);
						setModalOpened(true);
					})
					.catch(err => {
						console.error('Failed to load podcast:', err);
						// Navigate back to search if podcast not found
						navigate('/search', { replace: true });
					});
			}
		}
	}, [podcastId, searchResults, navigate]);

	const handlePodcastClick = useCallback((podcast: Podcast) => {
		setSelectedPodcast(podcast);
		setModalOpened(true);
		// Update URL without full navigation
		navigate(`/search/${podcast.id}`, { replace: false });
	}, [navigate]);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedPodcast(null);
		// Navigate back to search, preserving search params if any
		const currentSearch = searchParams.toString();
		navigate(`/search${currentSearch ? `?${currentSearch}` : ''}`, { replace: true });
	}, [navigate, searchParams]);

	const handleSubscribed = useCallback((podcast: Podcast) => {
		console.log('Subscribed to:', podcast.name);
		// The modal will close via onSubscribed callback
	}, []);

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
					onPodcastClick={handlePodcastClick}
				/>
			</Stack>

			<SubscribeModal
				podcast={selectedPodcast}
				opened={modalOpened}
				onClose={handleModalClose}
				onSubscribed={handleSubscribed}
			/>
		</Container>
	);
}

export default Search;
