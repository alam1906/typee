migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('race_players');
		collection.fields.add(
			new TextField({ name: 'browser_hash', hidden: true, max: 64, pattern: '^[a-f0-9]{64}$' })
		);
		collection.addIndex(
			'idx_race_players_room_browser',
			true,
			'room, browser_hash',
			"browser_hash != ''"
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('race_players');
		collection.removeIndex('idx_race_players_room_browser');
		collection.fields.removeByName('browser_hash');
		app.save(collection);
	}
);
