import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Container, Stack, Card, Text, ScrollArea, Loader, Group } from '@mantine/core';
import { PodcastSearch, PodcastResults, SubscribeModal } from '../components';
import type { Podcast } from '../services';
import { getPodcastById } from '../services';

function Search() {
	const [searchResults, setSearchResults] = useState<Podcast[]>([]);
	const [resultCount, setResultCount] = useState<number>(0);
	const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
	const [searchTerm, setSearchTerm] = useState<string>('');
	const [modalOpened, setModalOpened] = useState(false);
	const [isLoadingPodcast, setIsLoadingPodcast] = useState(false);

	const { podcastId } = useParams<{ podcastId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();

	// Track if we're navigating programmatically to avoid closing modal on our own navigation
	const isNavigatingRef = useRef(false);

	// Handle URL-based podcast selection (e.g., /search/123)
	useEffect(() => {
		if (podcastId) {
			const id = parseInt(podcastId);

			// First check if the podcast is in the current search results
			const podcastFromResults = searchResults.find(p => p.id === id);

			if (podcastFromResults) {
				setSelectedPodcast(podcastFromResults);
				setModalOpened(true);
				setIsLoadingPodcast(false);
			} else if (!selectedPodcast || selectedPodcast.id !== id) {
				// Only fetch if we don't already have this podcast loaded
				setIsLoadingPodcast(true);
				getPodcastById(id)
					.then(response => {
						setSelectedPodcast(response.podcast);
						setModalOpened(true);
					})
					.catch(err => {
						console.error('Failed to load podcast:', err);
						// Navigate back to search if podcast not found
						const currentSearch = searchParams.toString();
						navigate(`/search${currentSearch ? `?${currentSearch}` : ''}`, { replace: true });
					})
					.finally(() => {
						setIsLoadingPodcast(false);
					});
			}
		} else {
			// No podcastId in URL - close modal if open (handles back navigation)
			if (modalOpened && !isNavigatingRef.current) {
				setModalOpened(false);
				setSelectedPodcast(null);
			}
		}

		// Reset the navigation flag
		isNavigatingRef.current = false;
	}, [podcastId, location.pathname]);

	const handlePodcastClick = useCallback((podcast: Podcast) => {
		setSelectedPodcast(podcast);
		setModalOpened(true);
		isNavigatingRef.current = true;
		// Update URL, preserving search params
		const currentSearch = searchParams.toString();
		navigate(`/search/${podcast.id}${currentSearch ? `?${currentSearch}` : ''}`, { replace: false });
	}, [navigate, searchParams]);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedPodcast(null);
		// Navigate back to search, preserving search params
		const currentSearch = searchParams.toString();
		isNavigatingRef.current = true;
		navigate(`/search${currentSearch ? `?${currentSearch}` : ''}`, { replace: false });
	}, [navigate, searchParams]);

	const handleSubscribed = useCallback((podcast: Podcast) => {
		console.log('Subscribed to:', podcast.name);
		// The modal will close via onSubscribed callback
	}, []);

	console.log(resultCount);

	return (
		<Container
			size="sm"
			py="md"
			style={{
				height: 'var(--main-content-height)',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden'
			}}
		>
			<Stack
				gap="md"
				style={{
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden'
				}}
			>
				<PodcastSearch
					onResultsChange={(count: number, results: Podcast[], searchTerm: string) => {
						setSearchResults(results);
						setResultCount(count);
						setSearchTerm(searchTerm);
					}}
				/>
				{searchResults.length > 0 ? (
					<ScrollArea
						style={{ flex: 1 }}
						scrollbars="y"
						scrollbarSize={4}
					>
						<PodcastResults
							podcasts={searchResults}
							onPodcastClick={handlePodcastClick}
						/>
					</ScrollArea>
				) : (
					<Card
						style={{
							flex: 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center'
						}}
					>
						{searchTerm === '' ? (
							<Text c="dimmed">Please enter a search term</Text>
						) : (
							<Text c="dimmed">No Results</Text>
						)}
					</Card>
				)}
			</Stack>

			{/* Loading state when fetching podcast directly from URL */}
			{isLoadingPodcast && !selectedPodcast && (
				<Group
					justify="center"
					align="center"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						zIndex: 1000
					}}
				>
					<Loader size="lg" />
				</Group>
			)}

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
