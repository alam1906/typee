migrate((app) => {
	const settings = app.settings();
	// PocketBase receives traffic through Nginx or Traefik, not from a published host port.
	settings.trustedProxy.headers = ['X-Forwarded-For'];
	app.save(settings);
});
