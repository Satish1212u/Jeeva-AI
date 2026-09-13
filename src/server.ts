import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { checkDatabaseConnection } from './database/prisma.js';

const PORT = env.PORT || 3000;

async function startServer() {
  // Check database connectivity
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    logger.info('Database connection established successfully.');
  } else {
    logger.warn('Running with database offline/degraded mode.');
  }

  const server = app.listen(PORT, () => {
    logger.info(`Jeeva AI server running on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`Webhook endpoint ready at: POST /webhook/telegram`);
    logger.info(`Health check available at: GET /health`);
  });

  const shutdown = () => {
    logger.info('Gracefully shutting down server...');
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start Jeeva AI server.');
  process.exit(1);
});
