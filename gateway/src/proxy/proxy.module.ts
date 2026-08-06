import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { RawBodyMiddleware } from './raw-body.middleware';
import { ContextModule } from '../context/context.module';
import { OfferingsModule } from '../offerings/offerings.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [ContextModule, OfferingsModule, LoggingModule],
  controllers: [ProxyController],
  providers: [ProxyService, RawBodyMiddleware],
  exports: [RawBodyMiddleware],
})
export class ProxyModule {}
