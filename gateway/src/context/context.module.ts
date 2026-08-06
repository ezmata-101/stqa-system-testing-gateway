import { Module } from '@nestjs/common';
import { ContextSigningService } from './context-signing.service';

@Module({
  providers: [ContextSigningService],
  exports: [ContextSigningService],
})
export class ContextModule {}
