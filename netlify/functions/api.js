const serverless = require('serverless-http');

let cachedHandler;

exports.handler = async (event, context) => {
	if (!cachedHandler) {
		const { default: app } = await import('../../backend/src/server.js');
		cachedHandler = serverless(app);
	}

	return cachedHandler(event, context);
};