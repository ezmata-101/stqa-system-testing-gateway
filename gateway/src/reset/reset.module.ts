import { Module } from '@nestjs/common';
import { ResetController } from './reset.controller';
import { ResetService } from './reset.service';
import { OfferingsModule } from '../offerings/offerings.module';
import { TeamsModule } from '../teams/teams.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';

@Module({
  imports: [OfferingsModule, TeamsModule, ProvisioningModule],
  controllers: [ResetController],
  providers: [ResetService],
  exports: [ResetService],
})
export class ResetModule {}
