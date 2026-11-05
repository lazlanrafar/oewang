import { describe, expect, it } from 'vitest';

import { handOff, takeHandoff } from './chat-handoff';

describe('chat handoff', () => {
	it('hands the message to the session it was left for, once', () => {
		handOff('ses_1', { message: 'Where did my money go?', files: [] });

		expect(takeHandoff('ses_1')).toEqual({ message: 'Where did my money go?', files: [] });
		expect(takeHandoff('ses_1')).toBeNull();
	});

	it('drops a handoff when a different session opens', () => {
		handOff('ses_1', { message: 'hi', files: [] });

		expect(takeHandoff('ses_2')).toBeNull();
		expect(takeHandoff('ses_1')).toBeNull();
	});
});
