migrate(
	(app) => {
		const rooms = app.findCollectionByNameOrId('rooms');
		rooms.fields.add(new NumberField({ name: 'round_number', min: 0, onlyInt: true }));
		rooms.fields.add(new DateField({ name: 'round_finished_at' }));
		rooms.fields.add(new BoolField({ name: 'competition_ended' }));
		app.save(rooms);

		const players = app.findCollectionByNameOrId('race_players');
		for (const name of ['gold_count', 'silver_count', 'bronze_count', 'points']) {
			players.fields.add(new NumberField({ name, min: 0, onlyInt: true }));
		}
		app.save(players);

		const rounds = new Collection({
			type: 'base',
			name: 'race_rounds',
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
				{ name: 'number', type: 'number', required: true, min: 1, onlyInt: true },
				{ name: 'gold', type: 'relation', collectionId: players.id, maxSelect: 1 },
				{ name: 'silver', type: 'relation', collectionId: players.id, maxSelect: 1 },
				{ name: 'bronze', type: 'relation', collectionId: players.id, maxSelect: 1 },
				{ name: 'ended_at', type: 'date', required: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_race_rounds_room_number ON race_rounds (room, number)']
		});
		app.save(rounds);

		for (const room of app.findAllRecords('rooms')) {
			if (room.getString('status') !== 'running') continue;
			room.set('round_number', 1);
			app.save(room);
		}
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('race_rounds'));
		const players = app.findCollectionByNameOrId('race_players');
		for (const name of ['gold_count', 'silver_count', 'bronze_count', 'points']) {
			players.fields.removeByName(name);
		}
		app.save(players);
		const rooms = app.findCollectionByNameOrId('rooms');
		for (const name of ['round_number', 'round_finished_at', 'competition_ended']) {
			rooms.fields.removeByName(name);
		}
		app.save(rooms);
	}
);
