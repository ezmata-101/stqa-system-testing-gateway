import { Module } from '@nestjs/common';
import { RequestLoggerService } from './request-logger.service';

@Module({
  providers: [RequestLoggerService],
  exports: [RequestLoggerService],
})
export class LoggingModule {}
