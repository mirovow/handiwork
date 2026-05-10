function pad(value: number) {
	return value.toString().padStart(2, '0');
}

export function formatElapsedTime(totalSeconds: number) {
	const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(normalizedSeconds / 3600);
	const minutes = Math.floor((normalizedSeconds % 3600) / 60);
	const seconds = normalizedSeconds % 60;

	if (hours > 0) {
		return `${hours}ч ${pad(minutes)}м ${pad(seconds)}с`;
	}

	if (minutes > 0) {
		return `${minutes}м ${pad(seconds)}с`;
	}

	return `${seconds}с`;
}
