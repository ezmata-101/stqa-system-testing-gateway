import { Injectable, Logger } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';
import { DbAdminService } from '../db/db-admin.service';
import { OfferingsService } from '../offerings/offerings.service';
import { TeamsService } from '../teams/teams.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ConfigService } from '../common/config/config.service';
import { SeedHookService } from './seed-hook.service';
import { hashWithSecret } from '../common/util/crypto.util';
import { ProvisionedCredential, ProvisioningResult, RosterRow } from './roster.types';

/**
 * Turns a roster into provisioned teams, isolated databases, and
 * individual lab credentials (spec section 12). Deliberately knows nothing
 * about the backend's schema or bugs — team-specific variation is limited
 * to a deterministic HMAC seed value (spec section 13) that a semester's
 * own seed script/hook can use however it likes.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly db: ControlDbService,
    private readonly dbAdmin: DbAdminService,
    private readonly offerings: OfferingsService,
    private readonly teams: TeamsService,
    private readonly credentials: CredentialsService,
    private readonly config: ConfigService,
    private readonly seedHook: SeedHookService,
  ) {}

  async provision(
    offeringCode: string,
    roster: RosterRow[],
    options: { teamSize?: number } = {},
  ): Promise<ProvisioningResult> {
    const offering = await this.offerings.findByCode(offeringCode);
    if (!offering) throw new Error(`Unknown offering: ${offeringCode}`);
    const backendVersion = await this.offerings.getBackendVersion(offering.backendVersionId);
    if (!backendVersion) throw new Error(`Offering ${offeringCode} has no backend version.`);

    const teamGroups = this.groupIntoTeams(roster, options.teamSize ?? offering.maximumTeamSize);
    const resultTeams: ProvisioningResult['teams'] = [];
    const resultCredentials: ProvisionedCredential[] = [];
    const existingTeams = await this.teams.listByOffering(offering.id);
    const existingTeamsByCode = new Map(existingTeams.map((t) => [t.teamCode, t]));
    const existingTeamsByDatabase = new Map(existingTeams.map((t) => [t.databaseName, t]));

    for (const [teamCode, members] of teamGroups) {
      const databaseName = this.sanitizeDatabaseName(`stqa_${offeringCode}_team_${teamCode}`);
      const seedValue = hashWithSecret(`${offering.id}:${teamCode}`, this.config.credentialHashSecret);

      this.logger.log(`Creating database ${databaseName} from template ${backendVersion.databaseTemplate}`);
      if (!(await this.dbAdmin.databaseExists(databaseName))) {
        await this.dbAdmin.createDatabaseFromTemplate(databaseName, backendVersion.databaseTemplate);
      }

      let team = existingTeamsByCode.get(teamCode) ?? existingTeamsByDatabase.get(databaseName);
      const createdTeam = !team;
      if (!team) {
        team = await this.teams.create({
          offeringId: offering.id,
          teamCode,
          databaseName,
          seedValue,
        });
        existingTeamsByCode.set(team.teamCode, team);
        existingTeamsByDatabase.set(team.databaseName, team);
      } else if (team.databaseName !== databaseName) {
        this.logger.warn(
          `Reusing existing team ${team.teamCode} with database ${team.databaseName} (expected ${databaseName}).`,
        );
      }

      for (const member of members) {
        await this.upsertStudent(member);
        await this.teams.addMember(team.id, member.studentId);
      }

      if (createdTeam) {
        await this.seedHook.run(offering.configuration, {
          databaseName,
          seedValue,
          offeringCode,
          teamCode,
        });
      } else {
        this.logger.log(`Reusing team ${teamCode}; skipping seed hook.`);
      }

      resultTeams.push({
        teamCode,
        databaseName,
        members: members.map((m) => m.studentId),
      });
    }

    for (const row of roster) {
      const rawKey = await this.credentials.issue(offering.id, row.studentId, offering.activeUntil);
      const teamCode =
        [...teamGroups.entries()].find(([, members]) =>
          members.some((m) => m.studentId === row.studentId),
        )?.[0] ?? 'unknown';
      resultCredentials.push({
        studentId: row.studentId,
        name: row.name,
        email: row.email,
        teamCode,
        rawKey,
      });
    }

    return { offeringCode, teams: resultTeams, credentials: resultCredentials };
  }

  private groupIntoTeams(roster: RosterRow[], teamSize: number): Map<string, RosterRow[]> {
    const groups = new Map<string, RosterRow[]>();
    const withExplicitTeam = roster.filter((r) => r.teamCode);
    const withoutTeam = roster.filter((r) => !r.teamCode);

    for (const row of withExplicitTeam) {
      const key = row.teamCode!;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Auto-chunk anyone without an explicit team code into new numbered teams.
    let autoIndex = groups.size + 1;
    for (let i = 0; i < withoutTeam.length; i += teamSize) {
      const chunk = withoutTeam.slice(i, i + teamSize);
      const key = String(autoIndex++).padStart(3, '0');
      groups.set(key, chunk);
    }

    return groups;
  }

  private async upsertStudent(row: RosterRow): Promise<void> {
    await this.db.query(
      `INSERT INTO students (student_id, name, email, section)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
         section = EXCLUDED.section`,
      [row.studentId, row.name, row.email, row.section ?? null],
    );
  }

  private sanitizeDatabaseName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 63);
  }
}
