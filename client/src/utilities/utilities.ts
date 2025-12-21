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

export function getHexValue(color: string) {
	switch (color) {
		case "dark":
			return "#2e2e2e";
		case "gray":
			return "#868e96";
		case "red":
			return "#fa5252";
		case "pink":
			return "#e64980";
		case "grape":
			return "#be4bdb";
		case "violet":
			return "#7950f2";
		case "indigo":
			return "#4c6ef5";
		case "blue":
			return "#228be6";
		case "cyan":
			return "#15aabf";
		case "teal":
			return "#12b886";
		case "green":
			return "#40c057";
		case "lime":
			return "#82c91e";
		case "yellow":
			return "#fab005";
		case "orange":
			return "#fd7e14";
		default:
			return "#228be6";
	}
};

export function getColorName(hex: string) {
	switch (hex.toLowerCase()) {
		case "#2e2e2e":
			return "dark";
		case "#868e96":
			return "gray";
		case "#fa5252":
			return "red";
		case "#e64980":
			return "pink";
		case "#be4bdb":
			return "grape";
		case "#7950f2":
			return "violet";
		case "#4c6ef5":
			return "indigo";
		case "#228be6":
			return "blue";
		case "#15aabf":
			return "cyan";
		case "#12b886":
			return "teal";
		case "#40c057":
			return "green";
		case "#82c91e":
			return "lime";
		case "#fab005":
			return "yellow";
		case "#fd7e14":
			return "orange";
		default:
			return "blue";
	}
};

export const colorSwatches = [
	"#2e2e2e",
	"#868e96",
	"#fa5252",
	"#e64980",
	"#be4bdb",
	"#7950f2",
	"#4c6ef5",
	"#228be6",
	"#15aabf",
	"#12b886",
	"#40c057",
	"#82c91e",
	"#fab005",
	"#fd7e14"
];

export const DEFAULT_THEME = {
	navigation: 'blue',
	mediaPlayer: 'teal'
};