export const roomAvatars = ['🦊', '🐼', '🐸', '🐙', '🐯', '🐨', '🐧', '🦁', '🐰', '🐻'] as const;

export interface PassageSegment {
	start: number;
	end: number;
	text: string;
	isWord: boolean;
}

export function segmentPassage(passage: string): PassageSegment[] {
	return Array.from(passage.matchAll(/\S+|\s+/g), (match) => ({
		start: match.index,
		end: match.index + match[0].length,
		text: match[0],
		isWord: !/^\s+$/.test(match[0])
	}));
}
