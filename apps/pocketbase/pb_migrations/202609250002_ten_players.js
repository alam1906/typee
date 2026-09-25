migrate((app) => {
	const collection = app.findCollectionByNameOrId('race_players');
	collection.fields.getByName('avatar_index').max = 9;
	app.save(collection);
});
