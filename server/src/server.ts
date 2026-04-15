import app from './app';
import { config } from './config';
import { closePool } from './database';

const server = app.listen(config.PORT, () => {
  console.log(`Healthcare API running on port ${config.PORT} [${config.NODE_ENV}]`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await closePool();
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
