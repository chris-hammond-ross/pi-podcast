import { useState, useEffect } from 'react';
import { Card, Group, Text, Skeleton } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { useEpisodesContext } from '../contexts';
import EpisodeActionsModal from './EpisodeActionsModal';
import EpisodeDetailModal from './EpisodeDetailModal';
import { formatDate } from '../utilities';
import type { EpisodeRecord, DownloadQueueItem } from '../services';

interface DownloadedItemRowProps {
	item: DownloadQueueItem;
	onEpisodeDeleted?: (episodeId: number) => void;
}

/**
 * A row component for displaying downloaded items in the Downloads page.
 * Unlike EpisodeRow, this component receives a DownloadQueueItem and fetches
 * the full episode data on demand when needed (for modals).
 */
function DownloadedItemRow({
	item,
	onEpisodeDeleted
}: DownloadedItemRowProps) {
	const [detailModalOpened, setDetailModalOpened] = useState(false);
	const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
	const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);
	const { getEpisodeById, updateEpisode } = useEpisodesContext();
	const location = useLocation();

	// Handle browser back button to close modals
	useEffect(() => {
		const handlePopState = () => {
			if (detailModalOpened) {
				setDetailModalOpened(false);
			}
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, [detailModalOpened]);

	const loadEpisode = async () => {
		if (episode) return episode; // Already loaded

		setIsLoadingEpisode(true);
		try {
			const ep = await getEpisodeById(item.episode_id);
			if (ep) {
				setEpisode(ep);
				return ep;
			}
			return null;
		} finally {
			setIsLoadingEpisode(false);
		}
	};

	const handleCardClick = async () => {
		// Load episode data first if not already loaded
		const ep = await loadEpisode();
		if (!ep) return;

		// Add history state for modal
		window.history.pushState(null, '', location.pathname + location.search);
		setDetailModalOpened(true);
	};

	const handleDetailModalClose = () => {
		setDetailModalOpened(false);
		// Go back if we pushed a state
		if (window.history.state !== null) {
			window.history.back();
		}
	};

	const handleEpisodeUpdate = (updatedEpisode: EpisodeRecord) => {
		setEpisode(updatedEpisode);
		updateEpisode(updatedEpisode.id, updatedEpisode);
	};

	const handleEpisodeDeleted = (deletedEpisodeId: number) => {
		if (onEpisodeDeleted) {
			onEpisodeDeleted(deletedEpisodeId);
		}
	};

	// Format the completed date
	const completedDate = item.completed_at
		? new Date(item.completed_at * 1000).toLocaleDateString()
		: null;

	return (
		<>
			<Card
				p="sm"
				onClick={handleCardClick}
				style={{ cursor: 'pointer' }}
			>
				<Group justify="space-between" align="center" wrap="nowrap">
					<div style={{ flex: 1, minWidth: 0 }}>
						<Text
							size="sm"
							truncate
						>
							{item.episode_title || `Episode ${item.episode_id}`}
						</Text>
						<Text size="xs" c="dimmed" truncate>
							{completedDate && `${completedDate} • `}
							{item.subscription_name}
						</Text>
					</div>
					{/* Only show actions if episode is loaded */}
					{episode ? (
						<EpisodeActionsModal
							episode={episode}
							subscriptionName={item.subscription_name}
							onEpisodeDeleted={handleEpisodeDeleted}
						/>
					) : (
						<Skeleton height={28} width={28} circle />
					)}
				</Group>
			</Card>

			{/* Episode Detail Modal - only rendered when episode is loaded */}
			{episode && (
				<EpisodeDetailModal
					episode={episode}
					subscriptionName={item.subscription_name}
					opened={detailModalOpened}
					onClose={handleDetailModalClose}
					onEpisodeUpdate={handleEpisodeUpdate}
				/>
			)}
		</>
	);
}

export default DownloadedItemRow;
