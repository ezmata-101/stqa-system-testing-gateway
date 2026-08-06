import { Global, Module } from '@nestjs/common';
import { ControlDbService } from './control-db.service';
import { LoggingDbService } from './logging-db.service';
import { TeamDbRegistryService } from './team-db-registry.service';
import { DbAdminService } from './db-admin.service';

@Global()
@Module({
  providers: [ControlDbService, LoggingDbService, TeamDbRegistryService, DbAdminService],
  exports: [ControlDbService, LoggingDbService, TeamDbRegistryService, DbAdminService],
})
export class DbModule {}
