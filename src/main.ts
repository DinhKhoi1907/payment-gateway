import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const frontendDistPath = join(process.cwd(), 'frontend/dist');

  app.useStaticAssets(join(frontendDistPath, 'assets'), {
    prefix: '/assets',
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
