migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('race_players');
		collection.fields.add(new NumberField({ name: 'avatar_index', min: 0, max: 3, onlyInt: true }));
		app.save(collection);

		for (const room of app.findAllRecords('rooms')) {
			const players = app.findRecordsByFilter('race_players', 'room = {:room}', 'id', 4, 0, {
				room: room.id
			});
			for (const [index, player] of players.entries()) {
				player.set('avatar_index', index);
				app.save(player);
			}
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('race_players');
		collection.fields.removeByName('avatar_index');
		app.save(collection);
	}
);
