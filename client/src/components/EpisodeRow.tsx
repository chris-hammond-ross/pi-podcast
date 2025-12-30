import { useState, useEffect } from 'react';
import { Card, Group, Text, Badge } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { useDownloadContext, useMediaPlayer, useEpisodesContext } from '../contexts';
import EpisodeActionsModal from './EpisodeActionsModal';
import EpisodeDetailModal from './EpisodeDetailModal';
import { formatDate, formatDuration } from '../utilities';
import type { EpisodeRecord } from '../services';

interface EpisodeRowProps {
	episode: EpisodeRecord;
	subscriptionName?: string;
	showDownloadStatus?: boolean;
	onEpisodeDeleted?: (episodeId: number) => void;
}

function EpisodeRow({
	episode,
	subscriptionName,
	showDownloadStatus = true,
	onEpisodeDeleted
}: EpisodeRowProps) {
	const [detailModalOpened, setDetailModalOpened] = useState(false);
	const [localEpisode, setLocalEpisode] = useState<EpisodeRecord>(episode);
	const { currentDownload } = useDownloadContext();
	const { currentEpisode, isPlaying } = useMediaPlayer();
	const { updateEpisode } = useEpisodesContext();
	const location = useLocation();

	// Update local episode when prop changes
	useEffect(() => {
		setLocalEpisode(episode);
	}, [episode]);

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
		setLocalEpisode(updatedEpisode);
		updateEpisode(updatedEpisode.id, updatedEpisode);
	};

	const handleEpisodeDeleted = (deletedEpisodeId: number) => {
		// Notify parent component
		if (onEpisodeDeleted) {
			onEpisodeDeleted(deletedEpisodeId);
		}
	};

	const isDownloading = currentDownload?.episodeId === localEpisode.id;
	const isCurrentlyPlaying = currentEpisode?.id === localEpisode.id && isPlaying;

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
								{localEpisode.title}
							</Text>
							{localEpisode.duration && (
								<Text span c="dimmed" size="xs" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
									• {formatDuration(localEpisode.duration)}
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
							{localEpisode.pub_date && `${formatDate(localEpisode.pub_date)} • `}
							{subscriptionName && subscriptionName}
						</Text>
					</div>
					<EpisodeActionsModal
						episode={localEpisode}
						subscriptionName={subscriptionName}
						onEpisodeDeleted={handleEpisodeDeleted}
					/>
				</Group>
			</Card>

			{/* Episode Detail Modal */}
			<EpisodeDetailModal
				episode={localEpisode}
				subscriptionName={subscriptionName}
				opened={detailModalOpened}
				onClose={handleDetailModalClose}
				onEpisodeUpdate={handleEpisodeUpdate}
			/>
		</>
	);
}

export default EpisodeRow;
