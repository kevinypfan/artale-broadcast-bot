import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import 'dotenv/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 優雅關閉處理
  process.on('SIGINT', () => {
    logger.log('Shutting down gracefully...');
    void app.close().then(() => process.exit(0));
  });

  logger.log('Artale Discord Bot starting...');
  // 這個應用主要是 Discord 機器人，不需要 HTTP 服務器
  await app.init();
  logger.log('Application initialized successfully!');
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application:', error);
  process.exit(1);
});
