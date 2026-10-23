// Starts the HTTP server and gracefully closes the server and database pool.
import { createApp } from './app.js';
import env from './config/env.js';
import pool from './db/pool.js';
import { error as logError, info } from './utils/logger.js';

const app = createApp(pool);
const server = app.listen(env.port, () => info(`Backend listening on port ${env.port}`));

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  info(`Received ${signal}; shutting down.`);
  try {
    await new Promise((resolve, reject) => {
      server.close((closeError) => (closeError ? reject(closeError) : resolve()));
    });
    await pool.end();
  } catch (shutdownError) {
    logError(shutdownError);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
