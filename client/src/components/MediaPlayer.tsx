import { useState, useCallback } from 'react';
import {
	Container,
	Group,
	Stack,
	ActionIcon,
	Slider,
	Text,
	Popover,
	Box,
	Loader
} from '@mantine/core';
import { useHover, useMove } from '@mantine/hooks';
import {
	Play,
	Pause,
	SkipBack,
	SkipForward,
	Volume2,
	Volume1,
	VolumeX
} from 'lucide-react';
import { useMediaPlayer } from '../contexts';

/**
 * Format seconds into MM:SS or HH:MM:SS format
 */
function formatTime(seconds: number): string {
	if (!seconds || !isFinite(seconds)) return '0:00';

	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hrs > 0) {
		return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Vertical volume slider using useMove
 */
function VerticalVolumeSlider({
	value,
	onChange,
	disabled
}: {
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
}) {
	const { ref } = useMove(
		({ y }) => {
			if (!disabled) {
				// y is 0 at top, 1 at bottom - invert for volume (0 at bottom, 100 at top)
				const newValue = Math.round((1 - y) * 100);
				onChange(Math.max(0, Math.min(100, newValue)));
			}
		}
	);

	const percentage = value / 100;

	return (
		<div
			ref={ref}
			style={{
				width: 12,
				height: 120,
				backgroundColor: 'var(--mantine-color-teal-light)',
				borderRadius: 12,
				position: 'relative',
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
			}}
		>
			{/* Filled bar */}
			<div
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: `${percentage * 100}%`,
					backgroundColor: 'var(--mantine-color-teal-filled)',
					borderRadius: 12,
					transition: 'height 50ms ease',
				}}
			/>

			{/* Thumb */}
			<div
				style={{
					position: 'absolute',
					bottom: `calc(${percentage * 100}% - 8px)`,
					left: '50%',
					transform: 'translateX(-50%)',
					width: 14,
					height: 14,
					backgroundColor: 'var(--mantine-color-teal-7)',
					borderRadius: '50%',
					opacity: 0,
					transition: 'bottom 50ms ease',
				}}
			/>
		</div>
	);
}

function MediaPlayer() {
	const { hovered: sliderHovered, ref: sliderRef } = useHover();
	const [volumeOpen, setVolumeOpen] = useState(false);
	const [previousVolume, setPreviousVolume] = useState(100);
	const [isSeeking, setIsSeeking] = useState(false);
	const [seekValue, setSeekValue] = useState(0);

	const {
		// State
		isPlaying,
		isPaused,
		isLoading,
		position,
		duration,
		volume,
		currentEpisode,
		mpvConnected,

		// Computed
		progress,
		hasNext,
		hasPrevious,

		// Actions
		togglePlayPause,
		seekTo,
		setVolume,
		playNext,
		playPrevious,
	} = useMediaPlayer();

	// Determine if we have an active playback session
	const hasPlayback = currentEpisode !== null;
	const showPlayButton = !isPlaying || isPaused;

	// Handle seek slider change (while dragging)
	const handleSeekChange = useCallback((value: number) => {
		setIsSeeking(true);
		setSeekValue(value);
	}, []);

	// Handle seek slider change end (when user releases)
	const handleSeekChangeEnd = useCallback(async (percentage: number) => {
		if (duration > 0) {
			const newPosition = (percentage / 100) * duration;
			await seekTo(newPosition);
		}
		setIsSeeking(false);
	}, [duration, seekTo]);

	// Handle play/pause toggle
	const handlePlayPause = useCallback(async () => {
		if (!hasPlayback) return;
		await togglePlayPause();
	}, [hasPlayback, togglePlayPause]);

	// Handle previous track
	const handlePrevious = useCallback(async () => {
		if (!hasPrevious) return;
		await playPrevious();
	}, [hasPrevious, playPrevious]);

	// Handle next track
	const handleNext = useCallback(async () => {
		if (!hasNext) return;
		await playNext();
	}, [hasNext, playNext]);

	// Handle volume change
	const handleVolumeChange = useCallback(async (value: number) => {
		await setVolume(value);
	}, [setVolume]);

	// Handle mute/unmute toggle
	const handleMuteToggle = useCallback(async () => {
		if (volume > 0) {
			setPreviousVolume(volume);
			await setVolume(0);
		} else {
			await setVolume(previousVolume > 0 ? previousVolume : 100);
		}
	}, [volume, previousVolume, setVolume]);

	// Get volume icon based on current volume level
	const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

	// Calculate display values
	const displayProgress = isSeeking ? seekValue : progress;
	const displayPosition = isSeeking ? (seekValue / 100) * duration : position;

	return (
		<Container size="sm" px="md" py="xs" w="100%">
			<Stack gap="xs" w="100%">
				{/* Episode title */}
				{/*<Text
					size="xs"
					c={hasPlayback ? undefined : 'dimmed'}
					ta="center"
					truncate
					style={{ maxWidth: '100%' }}
				>
					{currentEpisode?.title || 'No episode playing'}
				</Text>*/}

				{/* Progress slider with time display */}
				<Group gap="xs" w="100%" wrap="nowrap">
					<Text size="xs" c="dimmed" w={45} ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
						{formatTime(displayPosition)}
					</Text>
					<Box style={{ flex: 1 }}>
						<Slider
							color="teal"
							size="sm"
							value={displayProgress}
							onChange={handleSeekChange}
							onChangeEnd={handleSeekChangeEnd}
							disabled={!hasPlayback || !mpvConnected}
							ref={sliderRef}
							styles={{
								thumb: {
									transition: 'opacity 150ms ease',
									opacity: sliderHovered || isSeeking ? 1 : 0,
								},
							}}
						/>
					</Box>
					<Text size="xs" c="dimmed" w={45} style={{ fontVariantNumeric: 'tabular-nums' }}>
						{formatTime(duration)}
					</Text>
				</Group>

				{/* Playback controls */}
				<Group gap="xs" justify="center" grow>
					{/* Previous button */}
					<ActionIcon
						variant="light"
						color="teal"
						size="lg"
						aria-label="Previous"
						disabled={!hasPrevious || !mpvConnected}
						onClick={handlePrevious}
					>
						<SkipBack size={18} />
					</ActionIcon>

					{/* Play/Pause button */}
					<ActionIcon
						variant="light"
						color="teal"
						size="lg"
						aria-label={showPlayButton ? 'Play' : 'Pause'}
						disabled={!hasPlayback || !mpvConnected}
						onClick={handlePlayPause}
					>
						{isLoading ? (
							<Loader size={20} color="teal" />
						) : showPlayButton ? (
							<Play size={20} style={{ marginLeft: 2 }} />
						) : (
							<Pause size={20} />
						)}
					</ActionIcon>

					{/* Next button */}
					<ActionIcon
						variant="light"
						color="teal"
						size="lg"
						aria-label="Next"
						disabled={!hasNext || !mpvConnected}
						onClick={handleNext}
					>
						<SkipForward size={18} />
					</ActionIcon>

					{/* Volume control */}
					<Popover
						opened={volumeOpen}
						onChange={setVolumeOpen}
						position="top"
						shadow="md"
						styles={{
							dropdown: {
								width: "56px !important"
							}
						}}
					>
						<Popover.Target>
							<ActionIcon
								variant="light"
								color="teal"
								size="lg"
								aria-label="Volume"
								onClick={() => setVolumeOpen((o) => !o)}
								onDoubleClick={handleMuteToggle}
							>
								<VolumeIcon size={18} />
							</ActionIcon>
						</Popover.Target>
						<Popover.Dropdown p="md">
							<Stack gap="xs" align="center">
								<VerticalVolumeSlider
									value={volume}
									onChange={handleVolumeChange}
									disabled={!mpvConnected}
								/>
								<Text size="xs" c="dimmed">
									{volume}%
								</Text>
								<ActionIcon
									variant="light"
									color="teal"
									size="sm"
									onClick={handleMuteToggle}
									disabled={!mpvConnected}
								>
									<VolumeIcon size={14} />
								</ActionIcon>
							</Stack>
						</Popover.Dropdown>
					</Popover>
				</Group>
			</Stack>
		</Container>
	);
}

export default MediaPlayer;
