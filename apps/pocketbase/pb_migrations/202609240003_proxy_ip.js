migrate((app) => {
	const settings = app.settings();
	// PocketBase is expected to listen on loopback behind Caddy.
	settings.trustedProxy.headers = ['X-Forwarded-For'];
	app.save(settings);
});
