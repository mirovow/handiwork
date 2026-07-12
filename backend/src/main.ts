import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getBackendConfig } from './infrastructure/config/app.config';
import { createBasicAuthMiddleware } from './infrastructure/auth/basic-auth.middleware';

async function bootstrap() {
  const config = getBackendConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(createBasicAuthMiddleware(config.basicAuth));
  await app.listen(config.port, config.host);
}
bootstrap();
