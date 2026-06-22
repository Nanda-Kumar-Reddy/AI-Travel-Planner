import 'dotenv/config';
import app from './app';
import connectDB from './config/db';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '5000', 10);

const startServer = async (): Promise<void> => {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
};

startServer().catch((err) => {
  logger.error('Fatal: server failed to start', err);
  process.exit(1);
});
