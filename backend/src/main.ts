import {EventLedger} from './observability/event-ledger.service';
import {traceMiddleware} from './observability/http-observability';
import { SensitiveFieldsInterceptor } from './common/sensitive-fields.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const express=app.getHttpAdapter().getInstance();
  express.set('trust proxy',process.env.TRUSTED_PROXY_CIDRS?.split(',').map(s=>s.trim())??['loopback']);
  app.use(traceMiddleware(app.get(EventLedger)));
  app.enableCors({credentials:true,origin:[process.env.TECH_PANEL_ORIGIN??'https://89-207-255-42.sslip.io',...(process.env.NODE_ENV==='production'?[]:['http://127.0.0.1:3002','http://localhost:3001','http://localhost:3002'])],exposedHeaders:['X-Request-ID']});
  app.useGlobalInterceptors(new SensitiveFieldsInterceptor());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
}

void bootstrap();
