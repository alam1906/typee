migrate(
	(app) => {
		const rooms = app.findCollectionByNameOrId('rooms');
		const players = app.findCollectionByNameOrId('race_players');
		const messages = new Collection({
			type: 'base',
			name: 'race_messages',
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
				{
					name: 'player',
					type: 'relation',
					required: true,
					collectionId: players.id,
					maxSelect: 1
				},
				{ name: 'nickname', type: 'text', required: true, min: 2, max: 18 },
				{ name: 'text', type: 'text', required: true, min: 1, max: 200 },
				{ name: 'sequence', type: 'number', required: true, min: 1, onlyInt: true },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_race_messages_room_sequence ON race_messages (room, sequence DESC)'
			]
		});
		app.save(messages);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('race_messages'));
	}
);
