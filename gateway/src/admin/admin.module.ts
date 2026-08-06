import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSetupController } from './admin-setup.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminActionsController } from './admin-actions.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminAuthMiddleware } from './admin-auth.middleware';
import { OfferingsModule } from '../offerings/offerings.module';
import { TeamsModule } from '../teams/teams.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { ResetModule } from '../reset/reset.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [
    OfferingsModule,
    TeamsModule,
    CredentialsModule,
    ProvisioningModule,
    ResetModule,
    HealthModule,
  ],
  controllers: [
    AdminAuthController,
    AdminSetupController,
    AdminDashboardController,
    AdminActionsController,
  ],
  providers: [AdminDashboardService, AdminAuthMiddleware],
  exports: [AdminAuthMiddleware],
})
export class AdminModule {}
