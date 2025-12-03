import { Container, Group, Stack, ActionIcon, Slider } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { Play, Pause, SkipBack, SkipForward, VolumeOff, Shuffle, Volume2 } from 'lucide-react';
import { useMediaPlayer } from '../contexts';

function MediaPlayer() {
	const { hovered, ref } = useHover();
	const {
		// State
		isPlaying,       // Is currently playing boolean
		isPaused,        // Is currently paused boolean
		isLoading,       // Is currently loading boolean
		position,        // Current position in seconds
		duration,        // Total duration in seconds
		volume,          // 0-100
		currentEpisode,  // { id, title, subscription_id, duration } | null
		mpvConnected,    // Whether MPV is connected
		error,           // Error message if any

		// Computed
		progress,        // 0-100 percentage

		// Actions
		play,            // (episodeId: number) => Promise<void>
		pause,           // () => Promise<void>
		resume,          // () => Promise<void>
		togglePlayPause, // () => Promise<void>
		stop,            // () => Promise<void>
		seekTo,          // (position: number) => Promise<void>
		seekRelative,    // (offset: number) => Promise<void>
		setVolume,       // (volume: number) => Promise<void>
		refreshStatus,   // () => Promise<void>
	} = useMediaPlayer();

	const handleSliderChange = async (percentage: number) => {
		const newPosition = (percentage / 100) * duration;
		await seekTo(newPosition);
	};

	return (
		<Container size="sm" px="md" py="xs" w="100%">
			<Stack gap="xs" w="100%">
				<Slider
					color='teal'
					value={progress}
					onChangeEnd={handleSliderChange}
					ref={ref}
					styles={{
						thumb: {
							transition: 'opacity 150ms ease',
							opacity: hovered ? 1 : 0,
						},
					}}
				/>
				<Group gap="sm" grow>
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Mute"
					>
						<VolumeOff size={16} />
					</ActionIcon>
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Previous"
					>
						<SkipBack size={16} />
					</ActionIcon>
					{/* TODO: show play if currently paused */}
					{isPaused && (
						<ActionIcon
							variant="light"
							color="teal"
							size="xl"
							aria-label="Play"
						>
							<Play size={16} />
						</ActionIcon>
					)}
					{isPlaying && (
						<ActionIcon
							variant="light"
							color="teal"
							size="xl"
							aria-label="Pause"
						>
							<Pause size={16} />
						</ActionIcon>
					)}
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Next"
					>
						<SkipForward size={16} />
					</ActionIcon>
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Shuffle"
					>
						<Shuffle size={16} />
					</ActionIcon>
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Volume"
					>
						<Volume2 size={16} />
					</ActionIcon>
				</Group>
			</Stack>
		</Container>
	);
}

export default MediaPlayer;