import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module';
import { DbModule } from './db/db.module';

import { OfferingsModule } from './offerings/offerings.module';
import { TeamsModule } from './teams/teams.module';
import { CredentialsModule } from './credentials/credentials.module';
import { ContextModule } from './context/context.module';
import { AuthModule } from './auth/auth.module';
import { LabAuthMiddleware } from './auth/lab-auth.middleware';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RateLimitMiddleware } from './rate-limit/rate-limit.middleware';
import { LoggingModule } from './logging/logging.module';
import { ProxyModule } from './proxy/proxy.module';
import { RawBodyMiddleware } from './proxy/raw-body.middleware';
import { ResetModule } from './reset/reset.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { AdminModule } from './admin/admin.module';
import { AdminAuthMiddleware } from './admin/admin-auth.middleware';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    OfferingsModule,
    TeamsModule,
    CredentialsModule,
    ContextModule,
    AuthModule,
    RateLimitModule,
    LoggingModule,
    ProxyModule,
    ResetModule,
    ProvisioningModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Student-facing request pipeline (spec section 8): capture the raw
    // body, resolve lab-auth context, then enforce rate limits — in that
    // order — for every proxied and `/_lab/*` request.
    consumer
      .apply(RawBodyMiddleware, LabAuthMiddleware, RateLimitMiddleware)
      .forRoutes(
        { path: 'api/*splat', method: RequestMethod.ALL },
        { path: '_lab/*splat', method: RequestMethod.ALL },
      );

    // Instructor dashboard session guard.
    consumer
      .apply(AdminAuthMiddleware)
      .forRoutes({ path: 'admin/*splat', method: RequestMethod.ALL });
  }
}
