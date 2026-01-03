import { useCallback } from 'react';
import {
	Text,
	Card,
	Stack,
	Skeleton,
	Group,
} from '@mantine/core';
import { EpisodeRow, VirtualScrollList } from '../../components';
import { getAllDownloadedEpisodes, getMockDownloadedEpisodes } from '../../services';
import type { DownloadedEpisodeRecord } from '../../services';

// ============================================================================
// TESTING: Use mock data for testing infinite scroll
// Configure via environment variables (see .env.demo)
// ============================================================================
const USE_MOCK_EPISODES = import.meta.env.VITE_USE_MOCK_EPISODES === 'true';
const MOCK_TOTAL_EPISODES = parseInt(import.meta.env.VITE_MOCK_TOTAL_EPISODES) || 2000;
const MOCK_DELAY_MS = parseInt(import.meta.env.VITE_MOCK_DELAY_MS) || 200;

interface EpisodesProps {
	refreshKey: number;
	onEpisodeDeleted: (episodeId: number) => void;
}

function Episodes({ refreshKey, onEpisodeDeleted }: EpisodesProps) {
	// Fetch function for VirtualScrollList
	const fetchEpisodesPage = useCallback(async (offset: number, limit: number) => {
		if (USE_MOCK_EPISODES) {
			// Use mock endpoint for testing
			const response = await getMockDownloadedEpisodes({
				limit,
				offset,
				totalEpisodes: MOCK_TOTAL_EPISODES,
				delay: MOCK_DELAY_MS
			});
			return {
				items: response.episodes,
				total: response.total
			};
		}

		// Use real endpoint
		const response = await getAllDownloadedEpisodes({
			orderBy: 'pub_date',
			order: 'DESC',
			limit,
			offset
		});
		return {
			items: response.episodes,
			total: response.total
		};
	}, []);

	return (
		<VirtualScrollList<DownloadedEpisodeRecord>
			fetchPage={fetchEpisodesPage}
			pageSize={100}
			maxItems={500}
			getItemKey={(episode) => episode.id}
			renderItem={(episode) => (
				<EpisodeRow
					episode={episode}
					subscriptionName={episode.subscription_name}
					showDownloadStatus={false}
					onEpisodeDeleted={onEpisodeDeleted}
				/>
			)}
			gap="xs"
			loaderColor="blue"
			loadThreshold={300}
			refreshDeps={[refreshKey]}
			emptyContent={
				<Card
					style={{
						flex: 1,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						minHeight: '200px'
					}}
				>
					<Text c="dimmed">No episodes have been downloaded</Text>
				</Card>
			}
			loadingContent={
				<Stack gap="sm">
					{[...Array(6).keys()].map(i => (
						<Card key={i} p="sm">
							<Group justify="space-between" align="center" wrap="nowrap">
								<div style={{ flex: 1, minWidth: 0 }}>
									<Skeleton height={16} width="70%" mb={8} />
									<Skeleton height={12} width="50%" />
								</div>
								<Skeleton height={28} width={28} circle />
							</Group>
						</Card>
					))}
				</Stack>
			}
		/>
	);
}

export default Episodes;