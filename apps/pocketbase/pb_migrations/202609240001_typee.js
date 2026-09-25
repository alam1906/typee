migrate(
	(app) => {
		const rooms = new Collection({
			type: 'base',
			name: 'rooms',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'code', type: 'text', required: true, min: 8, max: 8 },
				{ name: 'passage', type: 'text', required: true, min: 100, max: 500 },
				{ name: 'status', type: 'select', required: true, values: ['waiting', 'running'] },
				{ name: 'starts_at', type: 'date' },
				{ name: 'duration_seconds', type: 'number', required: true, min: 60, max: 60 },
				{ name: 'expires_at', type: 'date', required: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_rooms_code ON rooms (code)']
		});
		app.save(rooms);

		const players = new Collection({
			type: 'base',
			name: 'race_players',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: 'room',
					type: 'relation',
					required: true,
					collectionId: rooms.id,
					maxSelect: 1,
					cascadeDelete: true
				},
				{ name: 'nickname', type: 'text', required: true, min: 2, max: 18 },
				{ name: 'token_hash', type: 'text', required: true, hidden: true },
				{ name: 'is_host', type: 'bool' },
				{ name: 'finished_at', type: 'date' },
				{ name: 'correct_chars', type: 'number', min: 0 },
				{ name: 'elapsed_ms', type: 'number', min: 0 },
				{ name: 'wpm', type: 'number', min: 0 },
				{ name: 'completed', type: 'bool' }
			],
			indexes: ['CREATE INDEX idx_race_players_room ON race_players (room)']
		});
		app.save(players);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('race_players'));
		app.delete(app.findCollectionByNameOrId('rooms'));
	}
);
