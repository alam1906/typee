migrate((app) => {
	const settings = app.settings();
	settings.rateLimits.enabled = true;
	settings.rateLimits.rules = [
		{ label: 'POST /api/typee/rooms', audience: '', duration: 60, maxRequests: 5 },
		{ label: 'POST /api/typee/rooms/', audience: '', duration: 10, maxRequests: 100 },
		{ label: '/api/typee/', audience: '', duration: 10, maxRequests: 120 },
		{ label: '*:auth', audience: '', duration: 3, maxRequests: 2 },
		{ label: '*:create', audience: '', duration: 5, maxRequests: 20 },
		{ label: '/api/', audience: '', duration: 10, maxRequests: 300 }
	];
	app.save(settings);
});
