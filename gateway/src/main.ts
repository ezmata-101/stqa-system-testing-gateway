import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { ConfigService } from './common/config/config.service';
import { GatewayExceptionFilter } from './common/errors/gateway-exception.filter';

async function bootstrap() {
  // Body parsing is disabled globally: `/api/*` and `/_lab/*` need the raw,
  // unparsed byte stream so the proxy can forward it byte-for-byte
  // (RawBodyMiddleware handles that itself); `/admin/*` gets its own
  // urlencoded parser below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(
    '/admin',
    express.urlencoded({ extended: true }),
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );

  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');

  app.useGlobalFilters(new GatewayExceptionFilter());

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`STQA gateway listening on port ${config.port}`);
}
bootstrap();
