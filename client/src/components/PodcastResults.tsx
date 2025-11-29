import { SimpleGrid, Card, Image, Text, Stack } from '@mantine/core';
import type { Podcast } from '../services';

interface PodcastResultsProps {
	podcasts: Podcast[];
	onPodcastClick?: (podcast: Podcast) => void;
}

function PodcastResults({
	podcasts = [],
	onPodcastClick
}: PodcastResultsProps) {
	const handleClick = (podcast: Podcast) => {
		if (onPodcastClick) {
			onPodcastClick(podcast);
		} else {
			console.log(podcast);
		}
	};

	return (
		<SimpleGrid cols={{ base: 3, sm: 3 }} spacing="sm">
			{podcasts.map((podcast) => (
				<Card
					p="0"
					key={podcast.id}
					onClick={() => handleClick(podcast)}
					style={{ cursor: 'pointer' }}
					className="hover:shadow-lg transition-shadow"
				>
					<Stack gap="0" justify='space-between'>
						<Image
							src={podcast.artworkUrl600}
							alt={podcast.name}
							mah="100%"
							maw="100%"
							height="auto"
							w="auto"
							fit="contain"
							fallbackSrc="https://placehold.co/300x300?text=No+Image"
						/>
						<Stack p="xs">
							<Text fw={600} size="xs" lineClamp={2}>
								{podcast.name}
							</Text>
						</Stack>

					</Stack>
				</Card>
			))}
		</SimpleGrid>
	);
}

export default PodcastResults;
