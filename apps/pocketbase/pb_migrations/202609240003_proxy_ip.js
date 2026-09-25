migrate((app) => {
	const settings = app.settings();
	// PocketBase listens on loopback behind Nginx, with Traefik as the public entry point.
	settings.trustedProxy.headers = ['X-Forwarded-For'];
	app.save(settings);
});
