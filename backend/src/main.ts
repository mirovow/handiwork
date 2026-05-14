import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getBackendConfig } from './infrastructure/config/app.config';

async function bootstrap() {
  const config = getBackendConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(config.port, config.host);
}
bootstrap();
