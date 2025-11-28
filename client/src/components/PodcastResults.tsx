import { SimpleGrid, Card, Image, Text, Badge, Stack } from '@mantine/core';
import type { Podcast } from '../services';

interface PodcastResultsProps {
	podcasts: Podcast[];
}

function PodcastResults({
	podcasts = []
}: PodcastResultsProps) {
	const handleCardClick = (podcast: Podcast) => {
		console.log(podcast);
	};

	return (
		<SimpleGrid cols={{ base: 3, sm: 3 }} spacing="sm">
			{podcasts.map((podcast) => (
				<Card
					p="0"
					key={podcast.id}
					onClick={() => handleCardClick(podcast)}
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
						/>
						<Stack p="xs">
							<Text fw={600} size="xs" lineClamp={2}>
								{podcast.name}
							</Text>
							{/*<Badge
								size='xs'
								variant="light"
							>
								{podcast.trackCount} episodes
							</Badge>*/}
						</Stack>

					</Stack>
				</Card>
			))}
		</SimpleGrid>
	);
}

export default PodcastResults;