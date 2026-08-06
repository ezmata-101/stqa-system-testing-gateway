import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { SeedHookService } from './seed-hook.service';
import { OfferingsModule } from '../offerings/offerings.module';
import { TeamsModule } from '../teams/teams.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [OfferingsModule, TeamsModule, CredentialsModule],
  providers: [ProvisioningService, SeedHookService],
  exports: [ProvisioningService, SeedHookService],
})
export class ProvisioningModule {}
