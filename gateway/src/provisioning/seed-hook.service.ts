import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from '../common/config/config.service';

const execFileAsync = promisify(execFile);

/**
 * Runs the optional per-offering seed hook (`configuration.seeding.command`)
 * against a specific team database. Shared by provisioning (initial seed)
 * and reset (re-seed after recreating from template) so both stay in sync
 * (spec sections 12, 13, 20).
 */
@Injectable()
export class SeedHookService {
  private readonly logger = new Logger(SeedHookService.name);

  constructor(private readonly config: ConfigService) {}

  async run(
    configuration: Record<string, any>,
    ctx: { databaseName: string; seedValue: string; offeringCode: string; teamCode: string },
  ): Promise<void> {
    const command: string[] | undefined = configuration?.seeding?.command;
    if (!command || command.length === 0) return;

    const teamDbUrl = new URL(this.config.teamDatabaseAdminUrl);
    teamDbUrl.pathname = `/${ctx.databaseName}`;

    try {
      await execFileAsync(command[0], command.slice(1), {
        env: {
          ...process.env,
          TEAM_DATABASE_URL: teamDbUrl.toString(),
          TEAM_SEED: ctx.seedValue,
          OFFERING_CODE: ctx.offeringCode,
          TEAM_CODE: ctx.teamCode,
        },
      });
    } catch (err) {
      this.logger.error(`Seed hook failed for team ${ctx.teamCode}: ${err}`);
      throw err;
    }
  }
}
