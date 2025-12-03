import { Container, Group, Stack, ActionIcon, Slider } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { Play, SkipBack, SkipForward, VolumeOff, Shuffle, Volume2 } from 'lucide-react';
import { useMediaPlayer } from '../contexts';

function MediaPlayer() {
	const { hovered, ref } = useHover();
	const {
		// State
		isPlaying,
		isPaused,
		isLoading,
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

	console.log(isPlaying);
	console.log(isPaused);
	console.log(isLoading);
	console.log(position);
	console.log(duration);
	console.log(volume);
	console.log(currentEpisode);
	console.log(mpvConnected);
	console.log(error);
	console.log(progress);
	console.log(play);
	console.log(pause);
	console.log(resume);
	console.log(togglePlayPause);
	console.log(stop);
	console.log(seekTo);
	console.log(seekRelative);
	console.log(setVolume);
	console.log(refreshStatus);

	return (
		<Container size="sm" px="md" py="xs" w="100%">
			<Stack gap="xs" w="100%">
				<Slider
					color='teal'
					value={volume}
					onChangeEnd={setVolume}
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
					<ActionIcon
						variant="light"
						color="teal"
						size="xl"
						aria-label="Play"
					>
						<Play size={16} />
					</ActionIcon>
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