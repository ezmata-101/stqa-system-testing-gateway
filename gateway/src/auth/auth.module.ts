import { Module } from '@nestjs/common';
import { LabAuthMiddleware } from './lab-auth.middleware';
import { OfferingsModule } from '../offerings/offerings.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [OfferingsModule, CredentialsModule, TeamsModule],
  providers: [LabAuthMiddleware],
  exports: [LabAuthMiddleware],
})
export class AuthModule {}
