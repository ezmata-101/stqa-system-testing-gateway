import { Injectable, Logger } from '@nestjs/common';
import { ControlDbService } from '../db/control-db.service';
import { DbAdminService } from '../db/db-admin.service';
import { OfferingsService } from '../offerings/offerings.service';
import { TeamsService } from '../teams/teams.service';
import { SeedHookService } from '../provisioning/seed-hook.service';
import { GatewayError, GatewayErrorCode } from '../common/errors/gateway-error';

export interface ResetRequestParams {
  offeringId: string;
  teamId: string;
  requestedBy: string; // studentId, or "admin:<name>" for dashboard-triggered resets
}

/**
 * Restores a team's database from the offering template (spec section 20).
 * Enforces a per-team daily limit and prevents concurrent resets using a
 * Postgres advisory lock plus a `running` status row, and never touches
 * any other team's database.
 */
@Injectable()
export class ResetService {
  private readonly logger = new Logger(ResetService.name);

  constructor(
    private readonly db: ControlDbService,
    private readonly dbAdmin: DbAdminService,
    private readonly offerings: OfferingsService,
    private readonly teams: TeamsService,
    private readonly seedHook: SeedHookService,
  ) {}

  async resetTeamDatabase(params: ResetRequestParams): Promise<{ resetRequestId: string }> {
    const { offeringId, teamId, requestedBy } = params;
    const offering = await this.offerings.findById(offeringId);
    if (!offering) {
      throw new GatewayError(404, GatewayErrorCode.UNKNOWN_OFFERING, 'Offering not found.');
    }
    const resetsToday = await this.countResetsToday(teamId);
    if (resetsToday >= offering.resetLimitPerDay) {
      throw new GatewayError(
        429,
        GatewayErrorCode.RESET_LIMIT_EXCEEDED,
        `This team has already reset its database ${resetsToday} time(s) today (limit ${offering.resetLimitPerDay}).`,
      );
    }

    const alreadyRunning = await this.db.query(
      `SELECT id FROM reset_requests WHERE team_id = $1 AND status = 'running'`,
      [teamId],
    );
    if ((alreadyRunning.rowCount ?? 0) > 0) {
      throw new GatewayError(
        409,
        GatewayErrorCode.RESET_IN_PROGRESS,
        'A reset for this team is already in progress.',
      );
    }

    const team = await this.teams.findById(teamId);
    if (!team) {
      throw new GatewayError(404, GatewayErrorCode.TEAM_NOT_FOUND, 'Team not found.');
    }
    const backendVersion = await this.offerings.getBackendVersion(offering.backendVersionId);
    if (!backendVersion) {
      throw new GatewayError(
        500,
        GatewayErrorCode.BACKEND_UNAVAILABLE,
        'No backend is configured for this offering.',
      );
    }

    let resetRequestId: string;
    try {
      const insertResult = await this.db.query(
        `INSERT INTO reset_requests (offering_id, team_id, requested_by, status)
         VALUES ($1,$2,$3,'running') RETURNING id`,
        [offering.id, teamId, requestedBy],
      );
      resetRequestId = insertResult.rows[0].id as string;
    } catch (err: any) {
      if (err?.code === '23505') {
        // Unique partial index caught a race with another concurrent reset request.
        throw new GatewayError(
          409,
          GatewayErrorCode.RESET_IN_PROGRESS,
          'A reset for this team is already in progress.',
        );
      }
      throw err;
    }

    try {
      // Recreate the requesting team's database only — never any other team's.
      await this.dbAdmin.dropDatabase(team.databaseName);
      await this.dbAdmin.createDatabaseFromTemplate(team.databaseName, backendVersion.databaseTemplate);
      await this.seedHook.run(offering.configuration, {
        databaseName: team.databaseName,
        seedValue: team.seedValue,
        offeringCode: offering.code,
        teamCode: team.teamCode,
      });

      await this.db.query(
        `UPDATE reset_requests SET status = 'succeeded', completed_at = now() WHERE id = $1`,
        [resetRequestId],
      );
      this.logger.log(`Reset succeeded for team ${team.teamCode} (${team.databaseName})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db.query(
        `UPDATE reset_requests SET status = 'failed', completed_at = now(), failure_reason = $2
         WHERE id = $1`,
        [resetRequestId, message],
      );
      this.logger.error(`Reset failed for team ${team.teamCode}: ${message}`);
      throw new GatewayError(500, GatewayErrorCode.RESET_FAILED, 'Failed to reset the team database.');
    }

    return { resetRequestId };
  }

  private async countResetsToday(teamId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT count(*)::int AS count FROM reset_requests
        WHERE team_id = $1 AND requested_at >= date_trunc('day', now())
          AND status IN ('succeeded', 'running')`,
      [teamId],
    );
    return result.rows[0].count;
  }
}
