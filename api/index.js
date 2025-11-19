const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');
const { join } = require('path');

let cachedApp;

async function createApp() {
  if (cachedApp) {
    return cachedApp;
  }

  try {
    // Dynamic import for ES modules
    const { AppModule } = await import('../dist/src/app.module.js');
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    const app = await NestFactory.create(AppModule, adapter);

    // Enable CORS
    app.enableCors({
      origin: true,
      credentials: true,
    });

    // Serve static files from frontend/dist (if exists)
    try {
      const frontendDistPath = join(process.cwd(), 'frontend/dist');
      app.useStaticAssets(join(frontendDistPath, 'assets'), {
        prefix: '/assets',
      });
    } catch (_error) {
      console.warn('Static assets not found, skipping...');
    }

    // Initialize the app
    await app.init();

    cachedApp = expressApp;
    return cachedApp;
  } catch (error) {
    console.error('Error creating NestJS app:', error);
    throw error;
  }
}

module.exports = async (req, res) => {
  try {
    const app = await createApp();
    return app(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
