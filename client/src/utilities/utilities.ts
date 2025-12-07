export function formatDate(dateString: string | null): string {
	if (!dateString) return '';
	try {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	} catch {
		return dateString;
	}
}

export function secondsToHms(totalSeconds: number) {
	// Ensure the input is treated as a number and round it
	totalSeconds = Math.round(Number(totalSeconds));

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	// Use padStart to add leading zeros if the number is less than 10
	const hDisplay = String(hours).padStart(2, '0');
	const mDisplay = String(minutes).padStart(2, '0');
	const sDisplay = String(seconds).padStart(2, '0');

	return `${hDisplay}:${mDisplay}:${sDisplay}`;
}

export function formatDuration(duration: string | null): string {
	if (!duration) return '';
	if (duration.includes(':')) return formatEdgeCaseDuration(duration);
	const seconds = parseInt(duration);
	if (isNaN(seconds)) return duration;
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

// Deals with duration values that look like "01:00:18" instead of "3618"
function formatEdgeCaseDuration(duration: string): string {
	const parts = duration.split(/[:,.]/).map(Number);

	let hours = 0, minutes = 0, seconds = 0;

	if (parts.length === 3) {
		[hours, minutes, seconds] = parts;
	} else if (parts.length === 2) {
		[minutes, seconds] = parts;
	}

	// Only round up if seconds > 30 (not >=)
	if (seconds > 30) {
		minutes++;
		if (minutes >= 60) {
			hours++;
			minutes = 0;
		}
	}

	let result = '';
	if (hours > 0) result += `${hours}h `;
	if (minutes > 0) result += `${minutes}m`;

	return result.trim() || '0m';
}