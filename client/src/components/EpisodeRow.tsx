import { useEffect, useState } from 'react';
import { Card, Group, Text, Skeleton, Badge } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { useEpisodesContext, useDownloadContext, useMediaPlayer } from '../contexts';
import EpisodeActionsModal from './EpisodeActionsModal';
import EpisodeDetailModal from './EpisodeDetailModal';
import { formatDate, formatDuration } from '../utilities';
import type { EpisodeRecord } from '../services';

interface EpisodeRowProps {
	episodeId: number;
	subscriptionName?: string;
	showDownloadStatus?: boolean;
}

function EpisodeRow({
	episodeId,
	subscriptionName,
	showDownloadStatus = true
}: EpisodeRowProps) {
	const [detailModalOpened, setDetailModalOpened] = useState(false);
	const [actionsModalOpened, setActionsModalOpened] = useState(false);
	const { getEpisodeById, updateEpisode, isLoading: isEpisodeLoading } = useEpisodesContext();
	const { currentDownload } = useDownloadContext();
	const { currentEpisode, isPlaying } = useMediaPlayer();
	const [episode, setEpisode] = useState<EpisodeRecord | null>(null);
	const location = useLocation();

	// Load episode on mount or when episodeId changes
	useEffect(() => {
		let mounted = true;

		const loadEpisode = async () => {
			const ep = await getEpisodeById(episodeId);
			if (mounted && ep) {
				setEpisode(ep);
			}
		};

		loadEpisode();

		return () => {
			mounted = false;
		};
	}, [episodeId, getEpisodeById]);

	// Handle browser back button to close modals
	useEffect(() => {
		const handlePopState = () => {
			if (detailModalOpened) {
				setDetailModalOpened(false);
			}
			if (actionsModalOpened) {
				setActionsModalOpened(false);
			}
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, [detailModalOpened, actionsModalOpened]);

	const handleCardClick = () => {
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

	// Show loading skeleton if episode is being fetched
	if (isEpisodeLoading(episodeId) || !episode) {
		return (
			<Card withBorder p="sm">
				<Group justify="space-between" align="center" wrap="nowrap">
					<div style={{ flex: 1, minWidth: 0 }}>
						<Skeleton height={16} width="70%" mb={8} />
						<Skeleton height={12} width="50%" />
					</div>
					<Skeleton height={28} width={28} circle />
				</Group>
			</Card>
		);
	}

	const isDownloading = currentDownload?.episodeId === episode.id;
	const isCurrentlyPlaying = currentEpisode?.id === episode.id && isPlaying;

	return (
		<>
			<Card
				p="sm"
				onClick={handleCardClick}
				style={{ cursor: 'pointer' }}
			>
				<Group justify="space-between" align="center" wrap="nowrap">
					<div style={{ flex: 1, minWidth: 0 }}>
						<Group gap={4} wrap="nowrap">
							<Text
								size="sm"
								truncate
								style={{ flexShrink: 1, minWidth: 0, maxWidth: 'fit-content' }}
							>
								{episode.title}
							</Text>
							{episode.duration && (
								<Text span c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
									• {formatDuration(episode.duration)}
								</Text>
							)}
							{showDownloadStatus && (
								<>
									{isCurrentlyPlaying && (
										<Badge variant="light" color="teal" size="xs">
											Playing
										</Badge>
									)}
									{isDownloading && (
										<Badge variant="light" color="orange" size="xs">
											Downloading
										</Badge>
									)}
								</>
							)}
						</Group>
						<Text size="xs" c="dimmed" truncate>
							{episode.pub_date && `${formatDate(episode.pub_date)} • `}
							{subscriptionName && subscriptionName}
						</Text>
					</div>
					<EpisodeActionsModal episodeId={episodeId} subscriptionName={subscriptionName} />
				</Group>
			</Card>

			{/* Episode Detail Modal */}
			<EpisodeDetailModal
				episode={episode}
				subscriptionName={subscriptionName}
				opened={detailModalOpened}
				onClose={handleDetailModalClose}
				onEpisodeUpdate={handleEpisodeUpdate}
			/>
		</>
	);
}

export default EpisodeRow;
