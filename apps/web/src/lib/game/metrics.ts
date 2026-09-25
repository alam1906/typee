export function correctPrefix(typed: string, passage: string): number {
	let count = 0;
	while (count < typed.length && typed[count] === passage[count]) count += 1;
	return count;
}

export function matchingCharacters(typed: string, passage: string): number {
	let count = 0;
	for (let index = 0; index < typed.length; index += 1) {
		if (typed[index] === passage[index]) count += 1;
	}
	return count;
}

export function wordsPerMinute(correctCharacters: number, elapsedMs: number): number {
	if (elapsedMs < 1000) return 0;
	return Math.round(correctCharacters / 5 / (elapsedMs / 60_000));
}

export function accuracy(typed: string, passage: string): number {
	if (!typed.length) return 100;
	return Math.round((matchingCharacters(typed, passage) / typed.length) * 100);
}
