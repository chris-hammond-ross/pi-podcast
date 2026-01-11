import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
	Container,
	Alert,
	ScrollArea,
	Tabs
} from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts';
import { useSubscriptions } from '../hooks';
import { PodcastDetailModal } from '../components';
import { getSubscriptionById } from '../services';
import type { Subscription } from '../services';
import { Episodes, Podcasts as PodcastsTab, Queue } from './tabs';

const validTabs = ['podcasts', 'queue', 'episodes'];

function Podcasts() {
	const { subscriptions, isLoading, error, refresh } = useSubscriptions();
	const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
	const [modalOpened, setModalOpened] = useState(false);
	const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
	const [currentEpisodeId, setCurrentEpisodeId] = useState<number | null>(null);

	// Episodes refresh key - increment to trigger VirtualScrollList refresh
	const [episodesRefreshKey, setEpisodesRefreshKey] = useState(0);

	// Scroll area ref for VirtualScrollList
	const scrollAreaRef = useRef<HTMLDivElement>(null);

	const { tab, subscriptionId, episodeId } = useParams<{ tab: string; subscriptionId: string; episodeId: string; }>();
	const navigate = useNavigate();
	const location = useLocation();
	const { theme } = useTheme();

	const buttonColor = theme.navigation;

	// Track if we're navigating programmatically
	const isNavigatingRef = useRef(false);

	// Determine current tab from URL or default
	const currentTab = tab && validTabs.includes(tab) ? tab : 'podcasts';

	// Handle episode deletion - trigger refresh of VirtualScrollList
	const handleEpisodeDeleted = useCallback((_deletedEpisodeId: number) => {
		setEpisodesRefreshKey(prev => prev + 1);
	}, []);

	// Handle URL changes for subscription/episode modal
	useEffect(() => {
		// If we triggered this navigation, skip processing
		if (isNavigatingRef.current) {
			isNavigatingRef.current = false;
			return;
		}

		if (subscriptionId) {
			const id = parseInt(subscriptionId);
			const newEpisodeId = episodeId ? parseInt(episodeId) : null;

			// Update episode ID state
			setCurrentEpisodeId(newEpisodeId);

			// Check if subscription is already loaded
			if (selectedSubscription?.id === id) {
				// Subscription already loaded, just ensure modal is open
				if (!modalOpened) {
					setModalOpened(true);
				}
				return;
			}

			// Check if subscription is in the list
			const subscriptionFromList = subscriptions.find(s => s.id === id);

			if (subscriptionFromList) {
				setSelectedSubscription(subscriptionFromList);
				setModalOpened(true);
				setIsLoadingSubscription(false);
			} else {
				// Fetch subscription
				setIsLoadingSubscription(true);
				getSubscriptionById(id)
					.then(response => {
						setSelectedSubscription(response.subscription);
						setModalOpened(true);
					})
					.catch(err => {
						console.error('Failed to load subscription:', err);
						navigate(`/podcasts/${currentTab}`, { replace: true });
					})
					.finally(() => {
						setIsLoadingSubscription(false);
					});
			}
		} else {
			// No subscriptionId in URL - close everything
			setModalOpened(false);
			setSelectedSubscription(null);
			setCurrentEpisodeId(null);
		}
	}, [subscriptionId, episodeId, location.pathname, subscriptions, currentTab]);

	const handleTabChange = useCallback((value: string | null) => {
		if (value && validTabs.includes(value)) {
			isNavigatingRef.current = true;
			navigate(`/podcasts/${value}`);
		}
	}, [navigate]);

	const handlePodcastClick = useCallback((podcast: Subscription) => {
		setSelectedSubscription(podcast);
		setCurrentEpisodeId(null);
		setModalOpened(true);
		isNavigatingRef.current = true;
		navigate(`/podcasts/${currentTab}/${podcast.id}`);
	}, [navigate, currentTab]);

	const handleModalClose = useCallback(() => {
		setModalOpened(false);
		setSelectedSubscription(null);
		setCurrentEpisodeId(null);
		isNavigatingRef.current = true;
		navigate(`/podcasts/${currentTab}`);
		// Refresh downloaded episodes when modal closes in case something changed
		setEpisodesRefreshKey(prev => prev + 1);
	}, [navigate, currentTab]);

	const handleSubscriptionUpdate = useCallback((updated: Subscription) => {
		setSelectedSubscription(updated);
		refresh();
	}, [refresh]);

	const handleUnsubscribe = useCallback(() => {
		// Refresh subscriptions list after unsubscribe
		refresh();
		// Refresh downloaded episodes too
		setEpisodesRefreshKey(prev => prev + 1);
	}, [refresh]);

	const handleEpisodeOpen = useCallback((epId: number) => {
		if (selectedSubscription) {
			setCurrentEpisodeId(epId);
			isNavigatingRef.current = true;
			navigate(`/podcasts/${currentTab}/${selectedSubscription.id}/episode/${epId}`);
		}
	}, [navigate, selectedSubscription, currentTab]);

	const handleEpisodeClose = useCallback(() => {
		if (selectedSubscription) {
			setCurrentEpisodeId(null);
			isNavigatingRef.current = true;
			navigate(`/podcasts/${currentTab}/${selectedSubscription.id}`);
		}
	}, [navigate, selectedSubscription, currentTab]);

	// Error state
	if (error) {
		return (
			<Container size="sm" py="md">
				<Alert icon={<AlertCircle size={16} />} color="red" variant="light">
					{error}
				</Alert>
			</Container>
		);
	}

	return (
		<Tabs
			color={buttonColor}
			value={currentTab}
			onChange={handleTabChange}
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'var(--main-content-height)'
			}}
		>
			<Container size="sm" style={{ width: '100%' }}>
				<Tabs.List justify='flex-start'>
					<Tabs.Tab size="xl" value="podcasts">
						Podcasts
					</Tabs.Tab>
					<Tabs.Tab value="queue">
						Playing
					</Tabs.Tab>
					<Tabs.Tab value="episodes">
						Episodes
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

				{/* Queue and Episodes tabs manage their own scroll */}
				{currentTab === 'queue' && <Queue />}
				{currentTab === 'episodes' && (
					<Episodes
						refreshKey={episodesRefreshKey}
						onEpisodeDeleted={handleEpisodeDeleted}
					/>
				)}
			</Container>

			{/* Only Podcasts tab uses the shared ScrollArea */}
			{currentTab === 'podcasts' && (
				<ScrollArea
					ref={scrollAreaRef}
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
							value="podcasts"
							style={{
								flex: 1,
								display: 'flex',
								flexDirection: 'column'
							}}
						>
							<PodcastsTab
								subscriptions={subscriptions}
								isLoading={isLoading}
								isLoadingSubscription={isLoadingSubscription}
								selectedSubscription={selectedSubscription}
								onPodcastClick={handlePodcastClick}
							/>
						</Tabs.Panel>
					</Container>
				</ScrollArea>
			)}

			<PodcastDetailModal
				subscription={selectedSubscription}
				opened={modalOpened}
				onClose={handleModalClose}
				onSubscriptionUpdate={handleSubscriptionUpdate}
				onUnsubscribe={handleUnsubscribe}
				initialEpisodeId={currentEpisodeId}
				onEpisodeOpen={handleEpisodeOpen}
				onEpisodeClose={handleEpisodeClose}
			/>
		</Tabs>
	);
}

export default Podcasts;
